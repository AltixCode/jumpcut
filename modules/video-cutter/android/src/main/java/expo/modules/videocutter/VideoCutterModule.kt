package expo.modules.videocutter

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteOrder

/**
 * Reads a video's audio and writes back only the parts worth keeping.
 *
 * Finding the silences is not here: the native side decodes, and the decision
 * about what to keep is made in TypeScript where it is tested. Writing the same
 * thresholding twice, in Swift and Kotlin, is how the two platforms come to
 * disagree about where a sentence ends.
 */
class VideoCutterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoCutter")

    // Re-encoding a few minutes of 4K is tens of seconds; a spinner with no
    // number over that long reads as a hang.
    Events("onCutProgress")

    AsyncFunction("getInfo") { uri: String ->
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(path(uri))
        val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
          ?: throw Exception("The file contains no video track.")
        val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
          ?: throw Exception("The file contains no video track.")
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        val duration = (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000.0
        val hasAudio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"

        // Stored dimensions ignore the camera's rotation: a portrait clip is
        // stored landscape with a quarter-turn flag.
        val rotated = rotation == 90 || rotation == 270
        mapOf(
          "duration" to duration,
          "width" to if (rotated) height else width,
          "height" to if (rotated) width else height,
          "hasAudio" to hasAudio,
        )
      } finally {
        runCatching { retriever.release() }
      }
    }

    AsyncFunction("decodeAudio") { uri: String ->
      val decoded = decodeAudio(path(uri))
      mapOf(
        "samples" to decoded.pcm,
        "sampleRate" to decoded.sampleRate,
        "channels" to decoded.channels,
      )
    }

    AsyncFunction("cut") { uri: String, segments: String ->
      val output = File(cacheDir(), "jumpcut_${System.currentTimeMillis()}.mp4")
      val result = VideoCutter.cut(path(uri), segments, output) { fraction ->
        sendEvent("onCutProgress", mapOf("progress" to fraction))
      }
      mapOf(
        "uri" to Uri.fromFile(File(result.path)).toString(),
        "duration" to result.durationSeconds,
      )
    }
  }

  private class Decoded(val pcm: ByteArray, val sampleRate: Int, val channels: Int)

  /**
   * Decodes the audio track for the silence detector.
   *
   * Downmixed to mono and decimated to 16 kHz: the detector measures energy per
   * window, and carrying 48 kHz stereo across the bridge to work out where
   * someone stopped talking is megabytes whose detail is thrown away. The
   * decimation averages the samples that fall in each output sample rather than
   * picking one, so a sharp transient cannot alias into a quiet window and hide
   * a silence.
   */
  private fun decodeAudio(path: String): Decoded {
    val targetRate = 16_000
    val extractor = MediaExtractor()
    extractor.setDataSource(path)

    var track = -1
    for (index in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("audio/")) { track = index; break }
    }
    if (track < 0) {
      extractor.release()
      throw Exception("This video has no audio, so there are no silences to find.")
    }

    extractor.selectTrack(track)
    val format = extractor.getTrackFormat(track)
    val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    decoder.configure(format, null, null, 0)
    decoder.start()

    var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

    val out = ByteArrayOutputStream()
    val info = MediaCodec.BufferInfo()
    var sourceIndex = 0L
    var currentBucket = -1L
    var bucketSum = 0L
    var bucketCount = 0
    var lastValue = 0
    var inputDone = false
    var outputDone = false

    fun emit(value: Int) {
      val clamped = value.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
      out.write(clamped and 0xFF)
      out.write((clamped shr 8) and 0xFF)
    }

    try {
      while (!outputDone) {
        if (!inputDone) {
          val index = decoder.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = decoder.getInputBuffer(index)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        val index = decoder.dequeueOutputBuffer(info, 10_000)
        when {
          index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            // The decoder is the authority on what it produced; the extractor's
            // format can differ from the decoded stream.
            val decoded = decoder.outputFormat
            sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          }
          index >= 0 -> {
            val buffer = decoder.getOutputBuffer(index)!!
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            val shorts = buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()

            while (shorts.remaining() >= channels) {
              var frame = 0
              for (channel in 0 until channels) frame += shorts.get().toInt()
              val mono = frame / channels

              val bucket = sourceIndex * targetRate / sampleRate
              if (bucket != currentBucket) {
                if (bucketCount > 0) {
                  lastValue = (bucketSum / bucketCount).toInt()
                  emit(lastValue)
                }
                // Upsampling leaves buckets with no source sample; holding the
                // last value keeps the output continuous rather than punching
                // silence into it, which would read as a gap to cut.
                var gap = currentBucket + 1
                while (currentBucket >= 0 && gap < bucket) { emit(lastValue); gap++ }
                currentBucket = bucket
                bucketSum = 0
                bucketCount = 0
              }
              bucketSum += mono
              bucketCount++
              sourceIndex++
            }

            decoder.releaseOutputBuffer(index, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
      if (bucketCount > 0) emit((bucketSum / bucketCount).toInt())
    } finally {
      runCatching { decoder.stop() }
      runCatching { decoder.release() }
      extractor.release()
    }

    val pcm = out.toByteArray()
    if (pcm.isEmpty()) throw Exception("This video has no audio, so there are no silences to find.")
    return Decoded(pcm, targetRate, 1)
  }

  private fun cacheDir(): File =
    appContext.reactContext?.cacheDir ?: throw Exception("No cache directory is available.")

  /** MediaExtractor takes file paths; the picker hands back a file:// URI. */
  private fun path(uri: String): String {
    if (uri.startsWith("file://")) return Uri.parse(uri).path ?: uri
    return uri
  }
}

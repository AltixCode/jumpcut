package expo.modules.videocutter

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Writes only the chosen ranges of a video, joined end to end.
 *
 * The cuts land mid-sentence by design, so this cannot be a passthrough trim:
 * passthrough copies compressed samples and can only cut on sync frames, which
 * on a two-second keyframe interval moves every cut by up to two seconds. Both
 * tracks are decoded and re-encoded, and the presentation times are rewritten so
 * the removed gaps close up.
 */
internal object VideoCutter {

  private const val TAG = "VideoCutter"
  /** How long the encoder gets to flush after end of stream. */
  private const val DRAIN_TIMEOUT_MS = 30_000L

  class CutFailure(message: String) : Exception(message)

  class Result(val path: String, val durationSeconds: Double)

  fun cut(
    inputPath: String,
    segmentsJson: String,
    outputFile: File,
    onProgress: (Double) -> Unit,
  ): Result {
    val retriever = MediaMetadataRetriever()
    retriever.setDataSource(inputPath)
    val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    val durationUs = (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) * 1000
    retriever.release()

    val segments = Segments.parse(segmentsJson, durationUs)
      ?: throw CutFailure("Nothing was left to keep.")

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    // Carried over rather than baked in, so a portrait clip stays portrait
    // without re-orienting every frame.
    muxer.setOrientationHint(rotation)

    val audio = encodeAudio(inputPath, segments)
    var muxerVideoTrack = -1
    var muxerAudioTrack = -1
    var muxerStarted = false
    var written = 0L

    val extractor = MediaExtractor()
    extractor.setDataSource(inputPath)
    val videoTrack = extractor.trackIndexFor("video/")
      ?: throw CutFailure("The file contains no video track.")
    val videoFormat = extractor.getTrackFormat(videoTrack)
    val width = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
    val height = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
    val frameRate = if (videoFormat.containsKey(MediaFormat.KEY_FRAME_RATE)) {
      videoFormat.getInteger(MediaFormat.KEY_FRAME_RATE)
    } else 30

    val encoderFormat = MediaFormat.createVideoFormat("video/avc", width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, (width.toLong() * height * 4).coerceAtMost(40_000_000L).toInt())
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }

    val encoder = MediaCodec.createEncoderByType("video/avc")
    encoder.configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val pipeline = GlPipeline(encoder.createInputSurface())
    pipeline.setUp()
    encoder.start()

    val decoder = MediaCodec.createDecoderByType(videoFormat.getString(MediaFormat.KEY_MIME)!!)
    decoder.configure(videoFormat, pipeline.decoderSurface, null, 0)
    decoder.start()

    extractor.selectTrack(videoTrack)
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var decoderDone = false
    var encoderDone = false
    var framesWritten = 0
    var drainDeadline = 0L

    try {
      while (!encoderDone) {
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

        if (!decoderDone) {
          val index = decoder.dequeueOutputBuffer(info, 10_000)
          if (index >= 0) {
            val endOfStream = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            val timeUs = info.presentationTimeUs
            // Not `info.size > 0`: a decoder writing to a Surface does not fill
            // a byte buffer and reports size 0 for perfectly good frames.
            val remapped = if (endOfStream) null else segments.remap(timeUs)
            decoder.releaseOutputBuffer(index, remapped != null)

            if (remapped != null) {
              if (!pipeline.awaitFrame()) {
                throw CutFailure("The video could not be decoded on this device.")
              }
              pipeline.drawFrame(width, height)
              pipeline.present(remapped * 1000)
              framesWritten++
            }
            if (durationUs > 0 && timeUs > 0) {
              onProgress((timeUs.toDouble() / durationUs).coerceIn(0.0, 0.99))
            }

            if (endOfStream) {
              decoderDone = true
              Log.i(TAG, "decoder finished, $framesWritten frames kept")
              if (framesWritten == 0) throw CutFailure("Nothing was left to keep.")
              encoder.signalEndOfInputStream()
              drainDeadline = System.currentTimeMillis() + DRAIN_TIMEOUT_MS
            }
          }
        }

        val index = encoder.dequeueOutputBuffer(info, 10_000)
        when {
          index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            muxerVideoTrack = muxer.addTrack(encoder.outputFormat)
            // Every track has to be added before the muxer starts, which is why
            // the audio was encoded up front rather than alongside.
            if (audio != null) muxerAudioTrack = muxer.addTrack(audio.format)
            muxer.start()
            muxerStarted = true
          }
          index >= 0 -> {
            val buffer = encoder.getOutputBuffer(index)!!
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0 && muxerStarted) {
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              muxer.writeSampleData(muxerVideoTrack, buffer, info)
              written = maxOf(written, info.presentationTimeUs)
            }
            encoder.releaseOutputBuffer(index, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) encoderDone = true
          }
        }

        // Nothing downstream of end-of-stream is under our control, so the loop
        // gets a deadline rather than trusting the encoder to always finish.
        if (decoderDone && drainDeadline > 0 && System.currentTimeMillis() > drainDeadline) {
          throw CutFailure("The encoder stopped responding.")
        }
      }

      if (audio != null && muxerStarted) {
        for (sample in audio.samples) {
          muxer.writeSampleData(muxerAudioTrack, ByteBuffer.wrap(sample.bytes), sample.info)
        }
      }
      onProgress(1.0)
    } finally {
      runCatching { decoder.stop() }
      runCatching { decoder.release() }
      runCatching { encoder.stop() }
      runCatching { encoder.release() }
      pipeline.release()
      if (muxerStarted) runCatching { muxer.stop() }
      runCatching { muxer.release() }
      extractor.release()
    }

    if (!outputFile.exists() || outputFile.length() == 0L) {
      throw CutFailure("The export produced no file.")
    }
    return Result(outputFile.absolutePath, written / 1_000_000.0)
  }

  private class EncodedSample(val bytes: ByteArray, val info: MediaCodec.BufferInfo)
  private class EncodedAudio(val format: MediaFormat, val samples: List<EncodedSample>)

  /**
   * Decodes the audio, keeps only the chosen ranges, and re-encodes.
   *
   * Held in memory rather than muxed as it goes, because the muxer cannot be
   * started until every track's format is known, and the video encoder only
   * reports its format part way through its own run.
   */
  private fun encodeAudio(inputPath: String, segments: Segments): EncodedAudio? {
    val extractor = MediaExtractor()
    extractor.setDataSource(inputPath)
    val track = extractor.trackIndexFor("audio/") ?: run {
      extractor.release()
      return null
    }

    extractor.selectTrack(track)
    val sourceFormat = extractor.getTrackFormat(track)
    val decoder = MediaCodec.createDecoderByType(sourceFormat.getString(MediaFormat.KEY_MIME)!!)
    decoder.configure(sourceFormat, null, null, 0)
    decoder.start()

    var sampleRate = sourceFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = sourceFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    val kept = ByteArrayOutputStream()
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false

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
            val decoded = decoder.outputFormat
            sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          }
          index >= 0 -> {
            val buffer = decoder.getOutputBuffer(index)!!
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            val bytes = ByteArray(info.size)
            buffer.get(bytes)

            // Decided per frame, not per buffer: a decoded buffer spans tens of
            // milliseconds and a cut point lands inside one.
            val bytesPerFrame = 2 * channels
            val frames = bytes.size / bytesPerFrame
            for (frame in 0 until frames) {
              val timeUs = info.presentationTimeUs + frame * 1_000_000L / sampleRate
              if (segments.contains(timeUs)) {
                kept.write(bytes, frame * bytesPerFrame, bytesPerFrame)
              }
            }

            decoder.releaseOutputBuffer(index, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
    } finally {
      runCatching { decoder.stop() }
      runCatching { decoder.release() }
      extractor.release()
    }

    val pcm = kept.toByteArray()
    if (pcm.isEmpty()) return null
    return encodePcm(pcm, sampleRate, channels)
  }

  private fun encodePcm(pcm: ByteArray, sampleRate: Int, channels: Int): EncodedAudio {
    val format = MediaFormat.createAudioFormat("audio/mp4a-latm", sampleRate, channels).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 128_000 * channels)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
    }
    val encoder = MediaCodec.createEncoderByType("audio/mp4a-latm")
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()

    val bytesPerFrame = 2 * channels
    var offset = 0
    var framesQueued = 0L
    val info = MediaCodec.BufferInfo()
    val samples = mutableListOf<EncodedSample>()
    var outputFormat: MediaFormat? = null
    var inputDone = false
    var outputDone = false

    try {
      while (!outputDone) {
        if (!inputDone) {
          val index = encoder.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = encoder.getInputBuffer(index)!!
            buffer.clear()
            // Whole frames only: a partial frame splits a sample across two
            // buffers and the encoder reads the halves as separate samples,
            // which is audible as a click.
            val length = minOf(buffer.capacity(), pcm.size - offset).let { it - it % bytesPerFrame }
            val presentationUs = framesQueued * 1_000_000L / sampleRate
            if (length <= 0) {
              encoder.queueInputBuffer(index, 0, 0, presentationUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              buffer.put(pcm, offset, length)
              encoder.queueInputBuffer(index, 0, length, presentationUs, 0)
              offset += length
              framesQueued += length / bytesPerFrame
            }
          }
        }

        val index = encoder.dequeueOutputBuffer(info, 10_000)
        when {
          index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> outputFormat = encoder.outputFormat
          index >= 0 -> {
            val buffer = encoder.getOutputBuffer(index)!!
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0) {
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              val bytes = ByteArray(info.size)
              buffer.get(bytes)
              val copy = MediaCodec.BufferInfo()
              copy.set(0, bytes.size, info.presentationTimeUs, info.flags)
              samples.add(EncodedSample(bytes, copy))
            }
            encoder.releaseOutputBuffer(index, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
    } finally {
      runCatching { encoder.stop() }
      runCatching { encoder.release() }
    }

    return EncodedAudio(outputFormat ?: format, samples)
  }

  private fun MediaExtractor.trackIndexFor(prefix: String): Int? {
    for (index in 0 until trackCount) {
      val mime = getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(prefix)) return index
    }
    return null
  }
}

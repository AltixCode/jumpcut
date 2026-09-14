import ExpoModulesCore
import AVFoundation

/// Reads a video's audio and writes back only the parts worth keeping.
///
/// Finding the silences is not here: the native side decodes, and the decision
/// about what to keep is made in TypeScript where it is tested. Writing the
/// same thresholding twice, in Swift and Kotlin, is how the two platforms come
/// to disagree about where a sentence ends.
public class VideoCutterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoCutter")

    // Re-encoding a few minutes of 4K is tens of seconds; a spinner with no
    // number over that long reads as a hang.
    Events("onCutProgress")

    AsyncFunction("getInfo") { (uri: String, promise: Promise) in
      Task {
        do {
          let asset = AVURLAsset(url: Self.url(uri))
          let duration = try await asset.load(.duration)
          guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            promise.reject("ERR_CUT", "The file contains no video track.")
            return
          }
          // naturalSize ignores rotation; a portrait clip is stored landscape
          // with a quarter-turn flag.
          let size = try await track.load(.naturalSize)
          let transform = try await track.load(.preferredTransform)
          let presented = size.applying(transform)
          let audio = try await asset.loadTracks(withMediaType: .audio)

          promise.resolve([
            "duration": CMTimeGetSeconds(duration),
            "width": Int(abs(presented.width).rounded()),
            "height": Int(abs(presented.height).rounded()),
            "hasAudio": !audio.isEmpty,
          ])
        } catch {
          promise.reject("ERR_CUT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("decodeAudio") { (uri: String, promise: Promise) in
      Task {
        do {
          let decoded = try await Self.decodeAudio(url: Self.url(uri))
          promise.resolve([
            "samples": decoded.samples,
            "sampleRate": decoded.sampleRate,
            "channels": decoded.channels,
          ])
        } catch let error as CutError {
          promise.reject("ERR_CUT", error.message)
        } catch {
          promise.reject("ERR_CUT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("cut") { (uri: String, segments: String, promise: Promise) in
      Task { [weak self] in
        do {
          let result = try await Self.cut(url: Self.url(uri), segmentsJSON: segments) { fraction in
            self?.sendEvent("onCutProgress", ["progress": fraction])
          }
          promise.resolve(["uri": result.uri.absoluteString, "duration": result.duration])
        } catch let error as CutError {
          promise.reject("ERR_CUT", error.message)
        } catch {
          promise.reject("ERR_CUT", error.localizedDescription)
        }
      }
    }
  }

  // MARK: - Audio

  private struct DecodedAudio {
    let samples: Data
    let sampleRate: Int
    let channels: Int
  }

  private static func decodeAudio(url: URL) async throws -> DecodedAudio {
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
      throw CutError("This video has no audio, so there are no silences to find.")
    }

    // Mono at a modest rate: the detector measures energy per window, and
    // decoding 48 kHz stereo to find where someone stopped talking is work
    // whose result is thrown away.
    let sampleRate = 16_000
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderAudioMixOutput(
      audioTracks: [track],
      audioSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ]
    )
    guard reader.canAdd(output) else {
      throw CutError("This audio track cannot be decoded on this device.")
    }
    reader.add(output)
    guard reader.startReading() else {
      throw CutError(reader.error?.localizedDescription ?? "The audio could not be read.")
    }

    var pcm = Data()
    while let sample = output.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      var bytes = [UInt8](repeating: 0, count: length)
      if CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: &bytes) == kCMBlockBufferNoErr {
        pcm.append(contentsOf: bytes)
      }
    }
    if reader.status == .failed {
      throw CutError(reader.error?.localizedDescription ?? "The audio could not be decoded.")
    }
    guard !pcm.isEmpty else {
      throw CutError("This video has no audio, so there are no silences to find.")
    }

    return DecodedAudio(samples: pcm, sampleRate: sampleRate, channels: 1)
  }

  // MARK: - Cutting

  private static func cut(
    url: URL,
    segmentsJSON: String,
    onProgress: @escaping (Double) -> Void
  ) async throws -> (uri: URL, duration: Double) {
    guard
      let data = segmentsJSON.data(using: .utf8),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      throw CutError("The segments to keep could not be read.")
    }

    let asset = AVURLAsset(url: url)
    let total = try await asset.load(.duration)
    let totalSeconds = CMTimeGetSeconds(total)

    // Clamped and dropped here rather than trusted: a segment computed from a
    // rounded duration can overshoot the end of the file by a frame, and
    // inserting a range past the end fails the whole export.
    var ranges: [CMTimeRange] = []
    for entry in raw {
      guard let start = entry["start"] as? Double, let end = entry["end"] as? Double else { continue }
      let from = max(0, min(start, totalSeconds))
      let to = max(from, min(end, totalSeconds))
      guard to - from > 0.01 else { continue }
      ranges.append(CMTimeRange(
        start: CMTime(seconds: from, preferredTimescale: 600),
        end: CMTime(seconds: to, preferredTimescale: 600)
      ))
    }
    guard !ranges.isEmpty else {
      throw CutError("Nothing was left to keep.")
    }

    guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else {
      throw CutError("The file contains no video track.")
    }
    let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first

    let composition = AVMutableComposition()
    guard let video = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw CutError("The cut could not be assembled.")
    }
    // Carried over so a portrait clip stays portrait. The composition's own
    // track has no idea how the camera was held.
    video.preferredTransform = try await sourceVideo.load(.preferredTransform)

    let audio = sourceAudio == nil ? nil : composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    )

    var cursor = CMTime.zero
    for range in ranges {
      try video.insertTimeRange(range, of: sourceVideo, at: cursor)
      if let audio, let sourceAudio {
        try audio.insertTimeRange(range, of: sourceAudio, at: cursor)
      }
      cursor = CMTimeAdd(cursor, range.duration)
    }

    guard let session = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw CutError("This video cannot be exported on this device.")
    }

    let destination = FileManager.default.temporaryDirectory
      .appendingPathComponent("jumpcut_\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
    session.outputURL = destination
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true

    // AVAssetExportSession publishes progress but does not push it, so it is
    // sampled alongside the export and stops as soon as the export ends.
    let ticker = Task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 200_000_000)
        if Task.isCancelled { break }
        onProgress(Double(session.progress))
      }
    }

    await session.export()
    ticker.cancel()

    switch session.status {
    case .completed:
      onProgress(1)
      // The duration actually written, not the one that was asked for. The
      // caller shows this to the user, and a claim of "saved 40 seconds" that
      // does not match the file is worse than no claim.
      let written = AVURLAsset(url: destination)
      let writtenDuration = try await written.load(.duration)
      return (destination, CMTimeGetSeconds(writtenDuration))
    case .cancelled:
      throw CutError("The export was cancelled.")
    default:
      throw CutError(session.error?.localizedDescription ?? "The export failed.")
    }
  }

  private static func url(_ uri: String) -> URL {
    URL(string: uri) ?? URL(fileURLWithPath: uri)
  }

  private struct CutError: Error {
    let message: String
    init(_ message: String) { self.message = message }
  }
}

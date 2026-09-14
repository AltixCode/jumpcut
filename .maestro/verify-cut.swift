// Verifies the video JumpCut exported, independently of the app.
//
// Usage: verify-cut <source.mov> <cut.mp4>
//
// The detector is unit tested, but a unit test cannot say that the file on disk
// is the cut those units described: the wrong ranges could be written, the
// export could silently fall back to a copy of the whole clip, or the cuts
// could land on keyframes instead of where they were asked for. So this listens
// to what the app actually produced and checks the claim the product makes --
// that the dead air is gone.
//
// The silence detection here is written separately from the app's, not shared
// with it. A gate built out of the code it is checking only proves the app
// agrees with itself.

import AVFoundation
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  FileHandle.standardError.write(Data("usage: verify-cut <source> <cut>\n".utf8))
  exit(2)
}

/// Below this a window counts as silent. Matches the app's default so the two
/// are talking about the same thing; everything else here is independent.
let silenceThresholdDb = -35.0
let windowSeconds = 0.05
/// Silence longer than this in the export is dead air the app claimed to have
/// removed. The app keeps 40 ms of padding either side of a phrase, so a real
/// cut leaves well under this.
let allowedSilenceSeconds = 0.5
/// Below this many long silences, the fixture is not exercising the app and a
/// pass would mean nothing.
let minimumSourceSilences = 2

struct Failure: Error { let message: String }

func readMono(_ url: URL) throws -> (samples: [Float], sampleRate: Double, duration: Double) {
  let asset = AVURLAsset(url: url)
  guard let track = try awaitLoad(asset).first else {
    throw Failure(message: "\(url.lastPathComponent) has no audio track")
  }
  let reader = try AVAssetReader(asset: asset)
  let rate = 16_000.0
  let output = AVAssetReaderAudioMixOutput(
    audioTracks: [track],
    audioSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: rate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
  )
  reader.add(output)
  guard reader.startReading() else {
    throw Failure(message: reader.error?.localizedDescription ?? "could not read \(url.lastPathComponent)")
  }

  var samples: [Float] = []
  while let sample = output.copyNextSampleBuffer() {
    guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
    let length = CMBlockBufferGetDataLength(block)
    var bytes = [UInt8](repeating: 0, count: length)
    guard CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: &bytes) == kCMBlockBufferNoErr else { continue }
    bytes.withUnsafeBytes { raw in
      let values = raw.bindMemory(to: Int16.self)
      for value in values { samples.append(Float(value) / 32768) }
    }
  }
  guard !samples.isEmpty else {
    throw Failure(message: "\(url.lastPathComponent) decoded to no audio")
  }
  return (samples, rate, Double(samples.count) / rate)
}

/// AVAsset's async loading, made synchronous for a command-line tool.
func awaitLoad(_ asset: AVURLAsset) throws -> [AVAssetTrack] {
  let semaphore = DispatchSemaphore(value: 0)
  var tracks: [AVAssetTrack] = []
  var failure: Error?
  Task {
    do { tracks = try await asset.loadTracks(withMediaType: .audio) } catch { failure = error }
    semaphore.signal()
  }
  semaphore.wait()
  if let failure { throw failure }
  return tracks
}

func videoSize(_ url: URL) -> CGSize? {
  let asset = AVURLAsset(url: url)
  let semaphore = DispatchSemaphore(value: 0)
  var size: CGSize?
  Task {
    if let track = try? await asset.loadTracks(withMediaType: .video).first,
       let natural = try? await track.load(.naturalSize),
       let transform = try? await track.load(.preferredTransform) {
      let applied = natural.applying(transform)
      size = CGSize(width: abs(applied.width), height: abs(applied.height))
    }
    semaphore.signal()
  }
  semaphore.wait()
  return size
}

/// Runs of quiet longer than `minimumSeconds`.
func longSilences(_ samples: [Float], sampleRate: Double, minimumSeconds: Double) -> [(Double, Double)] {
  let windowSamples = max(1, Int(windowSeconds * sampleRate))
  var runs: [(Double, Double)] = []
  var runStart: Int?
  var window = 0

  while window * windowSamples < samples.count {
    let start = window * windowSamples
    let end = min(start + windowSamples, samples.count)
    var sum = 0.0
    for index in start..<end { sum += Double(samples[index]) * Double(samples[index]) }
    let rms = sqrt(sum / Double(end - start))
    let db = rms > 0 ? 20 * log10(rms) : -.infinity

    if db < silenceThresholdDb {
      if runStart == nil { runStart = window }
    } else if let began = runStart {
      let seconds = Double(window - began) * windowSeconds
      if seconds >= minimumSeconds {
        runs.append((Double(began) * windowSeconds, Double(window) * windowSeconds))
      }
      runStart = nil
    }
    window += 1
  }
  if let began = runStart {
    let seconds = Double(window - began) * windowSeconds
    if seconds >= minimumSeconds {
      runs.append((Double(began) * windowSeconds, Double(window) * windowSeconds))
    }
  }
  return runs
}

var failures: [String] = []
var notes: [String] = []

do {
  let sourceURL = URL(fileURLWithPath: arguments[1])
  let cutURL = URL(fileURLWithPath: arguments[2])

  let source = try readMono(sourceURL)
  let cut = try readMono(cutURL)

  // The fixture has to contain what the app is supposed to remove, or a pass
  // here says nothing at all.
  let sourceSilences = longSilences(source.samples, sampleRate: source.sampleRate, minimumSeconds: allowedSilenceSeconds)
  if sourceSilences.count < minimumSourceSilences {
    failures.append("the source has only \(sourceSilences.count) long silences: this fixture cannot exercise the cut")
  }

  let remaining = longSilences(cut.samples, sampleRate: cut.sampleRate, minimumSeconds: allowedSilenceSeconds)
  if !remaining.isEmpty {
    let worst = remaining.map { $0.1 - $0.0 }.max() ?? 0
    failures.append(String(format: "%d silences survived the cut, the longest %.2fs", remaining.count, worst))
  }

  if cut.duration >= source.duration - 1.0 {
    failures.append(String(format: "the cut is %.2fs against a %.2fs source: nothing was removed",
                           cut.duration, source.duration))
  }
  // The other direction matters just as much: an export that dropped the
  // speech along with the silence is shorter, not better.
  if cut.duration < 1.0 {
    failures.append(String(format: "the cut is only %.2fs: the speech went with the silence", cut.duration))
  }

  if let sourceSize = videoSize(sourceURL), let cutSize = videoSize(cutURL) {
    if sourceSize != cutSize {
      failures.append("size changed: \(Int(sourceSize.width))x\(Int(sourceSize.height)) -> \(Int(cutSize.width))x\(Int(cutSize.height))")
    }
  } else {
    failures.append("the export has no video track")
  }

  notes.append(String(format: "%.2fs from %.2fs, %d silences removed, %d left",
                      cut.duration, source.duration, sourceSilences.count, remaining.count))
} catch let failure as Failure {
  failures.append(failure.message)
} catch {
  failures.append(error.localizedDescription)
}

for note in notes { print("  \(note)") }
if failures.isEmpty {
  print("PASS \(URL(fileURLWithPath: arguments[2]).lastPathComponent)")
  exit(0)
}
for failure in failures { print("FAIL \(failure)") }
exit(1)

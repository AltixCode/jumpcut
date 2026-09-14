// Generates the fixture JumpCut's gates run against: a portrait clip of speech
// separated by long, deliberate pauses.
//
// The pauses are the whole point. A clip of continuous speech has nothing to
// cut, so every assertion about the export would pass on a file the app never
// changed. `say` inserts them with its own silence command, which keeps the
// fixture reproducible and free of any third-party recording.
//
// Build and run: swiftc -O make-speech-clip.swift -o gen && ./gen

import AVFoundation
import CoreGraphics
import Foundation

// Roughly a second and a half of dead air between each phrase, plus some at
// the start and end -- longer than any sensitivity preset's minimum, so every
// preset has something to find.
let sentence = """
[[slnc 1200]] Ship it anyway. [[slnc 1500]] \
The first version is meant to be embarrassing. [[slnc 1500]] \
Talk to five users. [[slnc 1200]]
"""
let width = 1080
let height = 1920
let fps: Int32 = 30

let work = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let speechURL = work.appendingPathComponent("jumpcut-speech.aiff")
let silentURL = work.appendingPathComponent("jumpcut-silent.mov")
let outputURL = work.appendingPathComponent("jumpcut-speech.mov")

for url in [speechURL, silentURL, outputURL] {
  try? FileManager.default.removeItem(at: url)
}

// MARK: - Speech

let say = Process()
say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
say.arguments = ["-o", speechURL.path, "-r", "160", sentence]
try say.run()
say.waitUntilExit()
guard say.terminationStatus == 0 else {
  FileHandle.standardError.write(Data("say failed\n".utf8))
  exit(1)
}

let speech = AVURLAsset(url: speechURL)
let semaphore = DispatchSemaphore(value: 0)
var speechSeconds = 0.0
Task {
  speechSeconds = CMTimeGetSeconds(try await speech.load(.duration))
  semaphore.signal()
}
semaphore.wait()

// A little tail so the last caption is not cut off by the end of the file.
let totalSeconds = speechSeconds + 0.5
let frameCount = Int(totalSeconds * Double(fps))

// MARK: - Video

let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mov)
let input = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
  ]
)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ]
)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()

for frame in 0..<frameCount {
  while !input.isReadyForMoreMediaData { usleep(2000) }

  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  guard let pixels = buffer else { continue }
  CVPixelBufferLockBaseAddress(pixels, [])

  let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixels),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
  )!

  // A moving light band, so a frame grab can tell the video is playing and a
  // burned-in caption has something other than flat colour behind it -- flat
  // colour is exactly where a missing outline still looks fine.
  let progress = Double(frame) / Double(max(frameCount - 1, 1))
  context.setFillColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  context.setFillColor(red: 0.95, green: 0.95, blue: 0.98, alpha: 1)
  let bandHeight = Double(height) * 0.22
  let y = progress * (Double(height) - bandHeight)
  context.fill(CGRect(x: 0, y: y, width: Double(width), height: bandHeight))

  CVPixelBufferUnlockBaseAddress(pixels, [])
  adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps))
}

input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()

guard writer.status == .completed else {
  FileHandle.standardError.write(Data("video write failed: \(writer.error?.localizedDescription ?? "unknown")\n".utf8))
  exit(1)
}

// MARK: - Mux

let composition = AVMutableComposition()
let exported = DispatchSemaphore(value: 0)
var exportError: String?

Task {
  do {
    let silent = AVURLAsset(url: silentURL)
    let range = CMTimeRange(start: .zero, duration: try await silent.load(.duration))

    if let videoTrack = try await silent.loadTracks(withMediaType: .video).first,
       let target = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
      try target.insertTimeRange(range, of: videoTrack, at: .zero)
    }
    if let audioTrack = try await speech.loadTracks(withMediaType: .audio).first,
       let target = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      let audioRange = CMTimeRange(start: .zero, duration: try await speech.load(.duration))
      try target.insertTimeRange(audioRange, of: audioTrack, at: .zero)
    }

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      exportError = "no export session"
      exported.signal()
      return
    }
    session.outputURL = outputURL
    session.outputFileType = .mov
    await session.export()
    if session.status != .completed {
      exportError = session.error?.localizedDescription ?? "export failed"
    }
  } catch {
    exportError = error.localizedDescription
  }
  exported.signal()
}
exported.wait()

try? FileManager.default.removeItem(at: silentURL)
try? FileManager.default.removeItem(at: speechURL)

if let exportError {
  FileHandle.standardError.write(Data("\(exportError)\n".utf8))
  exit(1)
}

print("wrote \(outputURL.lastPathComponent) (\(String(format: "%.1f", totalSeconds))s, \(width)x\(height))")

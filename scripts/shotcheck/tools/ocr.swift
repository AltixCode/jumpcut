// Reads text out of an image with the Vision framework.
//
// Written because every screenshot gate we have measures PIXELS, and the three
// defects that have actually reached live App Store assets were all TEXT:
// a literal "All {total} levels" placeholder, a "[RevenueCat] Purchase was
// cancelled" toast, and a purchase button with no price on it. No brightness
// threshold can see any of those.
//
//   ocr <image.png> [minY maxY]    # optional band, 0.0 = top, 1.0 = bottom
//
// Prints one recognised line per row: "<confidence> <y> <text>".
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: ocr <image.png> [minY maxY]\n".data(using: .utf8)!)
    exit(2)
}
let minY = args.count > 3 ? Double(args[2]) ?? 0.0 : 0.0
let maxY = args.count > 3 ? Double(args[3]) ?? 1.0 : 1.0

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false

do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(3)
}

for obs in (request.results ?? []) {
    guard let top = obs.topCandidates(1).first else { continue }
    // Vision's origin is bottom-left; report y from the top so it matches how
    // every other tool here talks about a frame.
    let y = 1.0 - Double(obs.boundingBox.midY)
    if y < minY || y > maxY { continue }
    print(String(format: "%.2f %.4f %@", top.confidence, y, top.string))
}

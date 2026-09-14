require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VideoCutter'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'Cuts silence out of video with AVFoundation.'
  s.description    = 'Writes only the chosen time ranges of a video, joined end to end.'
  s.author         = 'AltixCode'
  s.homepage       = 'https://www.altixcode.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end

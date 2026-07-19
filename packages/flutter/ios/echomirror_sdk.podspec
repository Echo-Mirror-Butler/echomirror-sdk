Pod::Spec.new do |s|
  s.name             = 'echomirror_sdk'
  s.version          = '0.1.0'
  s.summary          = 'EchoMirror SDK Flutter native FFI plugin.'
  s.description      = 'Bundles the EchoMirror Rust FFI library for Flutter apps.'
  s.homepage         = 'https://github.com/Echo-Mirror-Butler/echomirror-sdk'
  s.license          = { :file => '../../../LICENSE' }
  s.author           = { 'EchoMirror' => 'maintainers@echomirror.dev' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*'
  s.dependency 'Flutter'
  s.platform = :ios, '13.0'
  s.swift_version = '5.0'
  s.vendored_frameworks = 'Frameworks/EchoMirrorFFI.xcframework'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '-framework EchoMirrorFFI'
  }
  s.script_phase = {
    :name => 'Build EchoMirror Rust FFI',
    :script => 'bash "$PODS_TARGET_SRCROOT/../scripts/build_ios_xcframework.sh"',
    :execution_position => :before_compile,
    :input_files => [],
    :output_files => [
      '${PODS_TARGET_SRCROOT}/Frameworks/EchoMirrorFFI.xcframework'
    ]
  }
end

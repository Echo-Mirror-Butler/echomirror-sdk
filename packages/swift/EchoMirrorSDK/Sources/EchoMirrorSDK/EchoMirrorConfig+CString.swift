import Foundation

extension EchoMirrorConfig {
    func withCStringHandles<T>(
        _ body: (UnsafePointer<CChar>, UnsafePointer<CChar>?) -> T
    ) -> T {
        apiKey.withCString { apiKeyCString in
            if let baseURL {
                return baseURL.withCString { baseURLCString in
                    body(apiKeyCString, baseURLCString)
                }
            }

            return body(apiKeyCString, nil)
        }
    }
}

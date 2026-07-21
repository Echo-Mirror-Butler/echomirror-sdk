import Foundation
import EchoMirrorFFI

public final class SocialClient {
    private let handle: OpaquePointer

    public init(config: EchoMirrorConfig) throws {
        guard let handle = config.withCStringHandles({ apiKey, baseURL in
            echomirror_social_client_new(apiKey, baseURL, config.network.rawValue)
        }) else {
            throw EchoMirrorError.invalidConfig("Unable to create SocialClient")
        }

        self.handle = handle
    }

    deinit {
        echomirror_social_client_free(handle)
    }

    public func profile(userId: String) async throws -> UserProfile {
        guard !userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw EchoMirrorError.invalidInput("userId cannot be empty")
        }

        let payload = try await FFIAsync.perform { callback, userData in
            userId.withCString { userIdCString in
                echomirror_social_profile_async(
                    handle,
                    userIdCString,
                    callback,
                    userData
                )
            }
        }

        return try FFIDecode.decode(UserProfile.self, from: payload)
    }
}

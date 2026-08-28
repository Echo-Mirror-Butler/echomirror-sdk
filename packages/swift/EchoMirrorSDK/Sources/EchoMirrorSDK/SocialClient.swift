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

    public func profile(
        userId: String,
        cancellationHandle: CancellationHandle? = nil,
        timeoutMs: UInt32 = 0
    ) async throws -> UserProfile {
        guard !userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw EchoMirrorError.invalidInput("userId cannot be empty")
        }

        let payload = try await FFIAsync.perform(
            cancellationHandle: cancellationHandle,
            timeoutMs: timeoutMs
        ) { callback, userData, cancelPtr, timeout in
            userId.withCString { userIdCString in
                echomirror_social_profile_async(
                    handle,
                    userIdCString,
                    callback,
                    userData,
                    cancelPtr,
                    timeout
                )
            }
        }

        return try FFIDecode.decode(UserProfile.self, from: payload)
    }
}

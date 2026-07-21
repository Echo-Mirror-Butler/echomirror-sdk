import Foundation
import EchoMirrorFFI

public final class StellarClient {
    private let handle: OpaquePointer

    public init(config: EchoMirrorConfig) throws {
        guard let handle = config.withCStringHandles({ apiKey, baseURL in
            echomirror_stellar_client_new(apiKey, baseURL, config.network.rawValue)
        }) else {
            throw EchoMirrorError.invalidConfig("Unable to create StellarClient")
        }

        self.handle = handle
    }

    deinit {
        echomirror_stellar_client_free(handle)
    }

    public func isValidAddress(_ address: String) -> Bool {
        address.withCString { echomirror_is_valid_stellar_address($0) == 1 }
    }

    public func hashPublicKey(_ publicKey: String) -> String? {
        publicKey.withCString { rawPublicKey in
            guard let raw = echomirror_hash_public_key(rawPublicKey) else {
                return nil
            }
            defer { echomirror_free_string(raw) }
            return String(validatingUTF8: raw)
        }
    }

    public func getBalance(publicKey: String) async throws -> StellarBalance {
        guard isValidAddress(publicKey) else {
            throw EchoMirrorError.invalidInput("Expected a Stellar public G-address")
        }

        let payload = try await FFIAsync.perform { callback, userData in
            publicKey.withCString { publicKeyCString in
                echomirror_stellar_get_balance_async(
                    handle,
                    publicKeyCString,
                    callback,
                    userData
                )
            }
        }

        return try FFIDecode.decode(StellarBalance.self, from: payload)
    }
}

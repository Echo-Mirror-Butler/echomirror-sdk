import Foundation
import EchoMirrorFFI

public struct EchoMirrorConfig: Sendable {
    public var apiKey: String
    public var baseURL: String?
    public var network: StellarNetwork

    public init(
        apiKey: String,
        baseURL: String? = nil,
        network: StellarNetwork = .mainnet
    ) {
        self.apiKey = apiKey
        self.baseURL = baseURL
        self.network = network
    }
}

public enum StellarNetwork: UInt8, Codable, Sendable {
    case mainnet = 0
    case testnet = 1
}

public final class EchoMirror {
    public let mood: MoodClient
    public let stellar: StellarClient
    public let social: SocialClient

    public init(config: EchoMirrorConfig) throws {
        self.mood = try MoodClient(config: config)
        self.stellar = try StellarClient(config: config)
        self.social = try SocialClient(config: config)
    }
}

public enum EchoMirrorVersion {
    public static func current() -> String {
        guard let raw = echomirror_version() else {
            return "unknown"
        }
        defer { echomirror_free_string(raw) }
        return String(validatingUTF8: raw) ?? "unknown"
    }
}

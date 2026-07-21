import Foundation

public struct MoodEntry: Codable, Equatable, Sendable {
    public let id: String
    public let userId: String
    public let score: UInt8
    public let note: String?
    public let tags: [String]
    public let network: String
    public let createdAtUnixMs: UInt64
}

public struct StellarBalance: Codable, Equatable, Sendable {
    public let xlm: String
    public let echo: String
    public let publicKey: String
    public let network: String
    public let lastFetched: Date

    private enum CodingKeys: String, CodingKey {
        case xlm
        case echo
        case publicKey = "public_key"
        case network
        case lastFetched = "last_fetched"
    }
}

public struct UserProfile: Codable, Equatable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String
    public let avatarUrl: String?
    public let echoBalance: String
    public let currentStreak: UInt32
    public let totalEntries: UInt32
    public let network: String
    public let joinedAtUnixMs: UInt64
}

struct FFIErrorPayload: Codable {
    let message: String
    let code: Int32?
}

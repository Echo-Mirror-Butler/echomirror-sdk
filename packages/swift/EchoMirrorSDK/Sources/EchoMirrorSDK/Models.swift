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

/// A single anonymized entry from the global social feed. Mirrors the JS
/// `GlobalFeedEntry` shape (`created_at` on the wire).
public struct GlobalFeedEntry: Codable, Equatable, Sendable {
    public let id: String
    public let score: UInt8
    public let tags: [String]
    public let country: String?
    public let city: String?
    public let createdAt: Date

    private enum CodingKeys: String, CodingKey {
        case id
        case score
        case tags
        case country
        case city
        case createdAt = "created_at"
    }
}

/// A single leaderboard row. Mirrors the JS `LeaderboardEntry` shape.
public struct LeaderboardEntry: Codable, Equatable, Sendable {
    public let rank: Int
    public let userId: String
    public let displayName: String
    public let avatarUrl: String?
    public let streak: Int
    public let totalEntries: Int
    public let echoBalance: String
    public let weeklyScore: Double

    private enum CodingKeys: String, CodingKey {
        case rank
        case userId = "user_id"
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case streak
        case totalEntries = "total_entries"
        case echoBalance = "echo_balance"
        case weeklyScore = "weekly_score"
    }
}

/// Time window for leaderboard queries/updates. Mirrors the JS
/// `LeaderboardWindow` union (`all-time` on the wire).
public enum LeaderboardWindow: String, Codable, Sendable, CaseIterable {
    case daily
    case weekly
    case allTime = "all-time"
}

/// Social-specific events emitted by the real-time subscription. Mirrors the
/// JS `SocialLiveEvent` union.
///
/// `connectionGap` fires after a reconnect when the client cannot guarantee it
/// received every event that occurred while disconnected: either no backfill
/// was configured, or the backfill request failed. `since` is the id of the
/// last `feed:new_entry` processed before the disconnect, or `nil` if never.
public enum SocialLiveEvent: Equatable, Sendable {
    case feedNewEntry(GlobalFeedEntry)
    case leaderboardUpdated(window: LeaderboardWindow, entries: [LeaderboardEntry])
    case connectionGap(since: String?)
}

/// Decodes `SocialLiveEvent` from the WebSocket wire shape. This is a
/// discriminated union keyed on `type`, matching the JS `SocialLiveEvent`.
struct SocialLiveEventDecoder {
    private struct WireEvent: Decodable {
        let type: String
        let entry: GlobalFeedEntry?
        let window: LeaderboardWindow?
        let entries: [LeaderboardEntry]?
        let since: String?
    }

    func decode(_ text: String) -> SocialLiveEvent? {
        do {
            let wire = try FFIDecode.decoder.decode(WireEvent.self, from: Data(text.utf8))
            switch wire.type {
            case "feed:new_entry":
                guard let entry = wire.entry else { return nil }
                return .feedNewEntry(entry)
            case "leaderboard:updated":
                guard let window = wire.window, let entries = wire.entries else { return nil }
                return .leaderboardUpdated(window: window, entries: entries)
            case "connection:gap":
                return .connectionGap(since: wire.since)
            default:
                return nil
            }
        } catch {
            // Silently drop malformed messages, matching the JS transport.
            return nil
        }
    }
}

struct FFIErrorPayload: Codable {
    let message: String
    let code: Int32?
}

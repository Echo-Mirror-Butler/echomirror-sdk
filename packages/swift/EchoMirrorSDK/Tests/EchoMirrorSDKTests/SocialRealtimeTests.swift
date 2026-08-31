import XCTest
@testable import EchoMirrorSDK

/// Mock transport that fakes the WebSocket boundary, mirroring how the JS
/// `MockWebSocket` drives the transport's callbacks directly in
/// `packages/js/social/tests/realtime.test.ts`.
private final class MockTransport: SocialRealtimeTransport {
    private(set) var connectCalls = 0
    private(set) var disconnectCalls = 0
    private var onOpen: ((SocialRealtimeOpenInfo) -> Void)?
    private var onEvent: ((SocialLiveEvent) -> Void)?

    func connect(
        url: URL,
        onOpen: @escaping (SocialRealtimeOpenInfo) -> Void,
        onEvent: @escaping (SocialLiveEvent) -> Void
    ) {
        connectCalls += 1
        self.onOpen = onOpen
        self.onEvent = onEvent
    }

    func disconnect() {
        disconnectCalls += 1
    }

    func open(_ isReconnect: Bool) {
        onOpen?(SocialRealtimeOpenInfo(isReconnect: isReconnect))
    }

    func receive(_ event: SocialLiveEvent) {
        onEvent?(event)
    }

    func receiveJSON(_ text: String) {
        guard let data = text.data(using: .utf8),
              let event = FFIDecode.decoder.decodeSocialEvent(from: data) else {
            return
        }
        onEvent?(event)
    }
}

private extension JSONDecoder {
    /// Minimal mirror of the decoder's discriminated-union decoding used by the
    /// tests to feed wire JSON into the mock transport.
    func decodeSocialEvent(from data: Data) -> SocialLiveEvent? {
        struct Wire: Decodable {
            let type: String
            let entry: GlobalFeedEntry?
            let window: LeaderboardWindow?
            let entries: [LeaderboardEntry]?
            let since: String?
        }
        guard let wire = try? decode(Wire.self, from: data) else { return nil }
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
    }
}

final class SocialRealtimeTests: XCTestCase {
    private func makeStream(
        transport: MockTransport,
        backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])? = nil
    ) -> SocialSubscription {
        SocialSubscription(
            transport: transport,
            wsURL: URL(string: "wss://test/social/ws")!,
            backfill: backfill
        )
    }

    private func entry(_ id: String, score: UInt8 = 7) -> GlobalFeedEntry {
        GlobalFeedEntry(
            id: id,
            score: score,
            tags: [],
            country: nil,
            city: nil,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    func testReceivesFeedNewEntryViaForAwait() async throws {
        let transport = MockTransport()
        let subscription = makeStream(transport: transport)

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 1 { break }
            }
            return received
        }

        transport.receive(.feedNewEntry(entry("1")))
        let received = try await task.value

        XCTAssertEqual(transport.connectCalls, 1)
        XCTAssertEqual(received, [.feedNewEntry(entry("1"))])
    }

    func testReceivesLeaderboardUpdated() async throws {
        let transport = MockTransport()
        let subscription = makeStream(transport: transport)
        let leaderboardEntry = LeaderboardEntry(
            rank: 1,
            userId: "user-1",
            displayName: "Alice",
            avatarUrl: nil,
            streak: 12,
            totalEntries: 42,
            echoBalance: "1250.0000000",
            weeklyScore: 88.6
        )

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 1 { break }
            }
            return received
        }

        transport.receive(.leaderboardUpdated(window: .weekly, entries: [leaderboardEntry]))
        let received = try await task.value

        XCTAssertEqual(
            received,
            [.leaderboardUpdated(window: .weekly, entries: [leaderboardEntry])]
        )
    }

    func testEmitsConnectionGapWhenNoBackfillOnReconnect() async throws {
        let transport = MockTransport()
        let subscription = makeStream(transport: transport)

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 2 { break }
            }
            return received
        }

        transport.receive(.feedNewEntry(entry("1")))
        transport.open(true) // reconnect, no backfill configured
        let received = try await task.value

        XCTAssertEqual(
            received,
            [.feedNewEntry(entry("1")), .connectionGap(since: "1")]
        )
    }

    func testBackfillsMissedEntriesAfterReconnect() async throws {
        let transport = MockTransport()
        let backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])? = { _ in
            [GlobalFeedEntry(id: "2", score: 6, tags: [], country: nil, city: nil, createdAt: Date(timeIntervalSince1970: 1_700_000_001)),
             GlobalFeedEntry(id: "3", score: 9, tags: [], country: nil, city: nil, createdAt: Date(timeIntervalSince1970: 1_700_000_002))]
        }
        let subscription = makeStream(transport: transport, backfill: backfill)

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 3 { break }
            }
            return received
        }

        transport.receive(.feedNewEntry(entry("1")))
        transport.open(true) // reconnect with backfill configured

        let received = try await task.value
        XCTAssertEqual(received.map(\.debugLabel), ["entry:1", "entry:2", "entry:3"])
        XCTAssertFalse(received.contains(where: { event in
            if case .connectionGap = event { return true }
            return false
        }))
    }

    func testEmitsConnectionGapWhenBackfillFails() async throws {
        let transport = MockTransport()
        let backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])? = { _ in
            throw SocialRealtimeTests.TestError.backfill
        }
        let subscription = makeStream(transport: transport, backfill: backfill)

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 2 { break }
            }
            return received
        }

        transport.receive(.feedNewEntry(entry("1")))
        transport.open(true)

        let received = try await task.value
        XCTAssertEqual(
            received,
            [.feedNewEntry(entry("1")), .connectionGap(since: "1")]
        )
    }

    func testDisconnectsTransportWhenStreamEnds() async throws {
        let transport = MockTransport()
        let subscription = makeStream(transport: transport)

        let task = Task {
            for await event in subscription.events() {
                _ = event
                break  // stopping iteration triggers teardown
            }
        }

        transport.receive(.feedNewEntry(entry("1")))
        await task.value
        await Task.yield()

        XCTAssertEqual(transport.disconnectCalls, 1)
    }

    // MARK: - Wire shape

    func testDecodesFeedWireShape() async throws {
        let json = """
        {"type":"feed:new_entry","entry":{"id":"feed-001","score":7,"tags":["health"],"country":"US","city":"New York","created_at":"2026-08-17T09:00:00Z"}}
        """
        let transport = MockTransport()
        let subscription = makeStream(transport: transport)

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 1 { break }
            }
            return received
        }

        transport.receiveJSON(json)
        let received = try await task.value

        guard case .feedNewEntry(let entry) = received.first else {
            return XCTFail("expected feedNewEntry, got \(String(describing: received.first))")
        }
        XCTAssertEqual(entry.id, "feed-001")
        XCTAssertEqual(entry.score, 7)
        XCTAssertEqual(entry.tags, ["health"])
        XCTAssertEqual(entry.country, "US")
        XCTAssertEqual(entry.city, "New York")
    }

    private enum TestError: Error {
        case backfill
    }
}

private extension SocialLiveEvent {
    var debugLabel: String {
        switch self {
        case .feedNewEntry(let e): return "entry:\(e.id)"
        case .leaderboardUpdated: return "leaderboard"
        case .connectionGap: return "gap"
        }
    }
}

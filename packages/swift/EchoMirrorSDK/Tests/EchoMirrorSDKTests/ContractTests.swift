import XCTest
@testable import EchoMirrorSDK

/// EchoMirror contract-test runner (Swift).
///
/// The Swift FFI intentionally does NOT traverse HTTP for mood/social — those
/// payloads are generated in `echomirror-ffi`, and the bundled Stellar balance
/// call targets the *real* testnet Horizon (no horizon-base override exists in
/// the FFI yet). So this runner validates the contract *semantics* that the FFI
/// can cover offline: score bounds, address validation, hash shape, and the
/// async-bridge round trip — asserting the values from the shared
/// `contract-tests/contract-spec.json` so they cannot drift from the contract.
///
/// Env override: ECHOMIRROR_CONTRACT_SPEC (path to contract-spec.json).
final class ContractTests: XCTestCase {
    private enum ContractSpecError: Error {
        case specNotFound
    }

    private struct Spec {
        let logMoodBody: [String: Any]
        let moodUserId: String
        let stellarPublicKey: String
        let stellarDestination: String
    }

    private static func loadSpec() throws -> Spec {
        var candidates = [
            ProcessInfo.processInfo.environment["ECHOMIRROR_CONTRACT_SPEC"],
        ].compactMap { $0 }

        // Walk up from the current working directory looking for the shared
        // spec. This is robust to `swift test` being invoked from the repo
        // root, the package directory, or anywhere in between.
        let marker = "contract-tests/contract-spec.json"
        var dir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        for _ in 0..<6 {
            candidates.append(dir.appendingPathComponent(marker).path)
            dir.deleteLastPathComponent()
        }

        for path in candidates {
            guard let data = FileManager.default.contents(atPath: path),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }
            let users = json["fixture"] as? [String: Any] ?? [:]
            let moodUser = users["mood"] as? [String: Any] ?? [:]
            let stellarUser = users["stellar"] as? [String: Any] ?? [:]
            let logOp = (json["operations"] as? [[String: Any]])?
                .first { $0["id"] as? String == "log_mood" } ?? [:]
            let request = logOp["request"] as? [String: Any] ?? [:]
            return Spec(
                logMoodBody: request["body"] as? [String: Any] ?? [:],
                moodUserId: moodUser["id"] as? String ?? "user-contract-001",
                stellarPublicKey: stellarUser["public_key"] as? String
                    ?? "GDKUJHNOCQ6NOFJCSPE5IZMFFRZ6U4VO3EEFJQKJSDK5B4VZTH4XKSKD",
                stellarDestination: stellarUser["destination"] as? String
                    ?? "GDD6NGUJ3W5OWKX4ZP3JVPQF3T7YNONI3B4QJ6WY2XQKJRBZDK7G4T5A"
            )
        }

        if ProcessInfo.processInfo.environment["ECHOMIRROR_CONTRACT_SPEC"] != nil {
            throw ContractSpecError.specNotFound
        }
        throw XCTSkip("contract-spec.json not found — set ECHOMIRROR_CONTRACT_SPEC")
    }

    func testMoodScoreBoundsFromContract() throws {
        let spec = try Self.loadSpec()
        let score = UInt8(spec.logMoodBody["score"] as? Int ?? 8)
        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "contract-test-key", network: .testnet))

        XCTAssertTrue(mood.isValidScore(score))
        XCTAssertTrue(mood.isValidScore(1))
        XCTAssertTrue(mood.isValidScore(10))
        XCTAssertFalse(mood.isValidScore(0))
        XCTAssertFalse(mood.isValidScore(11))
    }

    func testMoodLogBridgesFromContract() async throws {
        let spec = try Self.loadSpec()
        let body = spec.logMoodBody
        let score = UInt8(body["score"] as? Int ?? 8)
        let note = body["note"] as? String ?? "Great day"
        let tags = body["tags"] as? [String] ?? ["work", "proud"]

        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "contract-test-key", network: .testnet))
        let entry = try await mood.logMood(
            userId: spec.moodUserId,
            score: score,
            note: note,
            tags: tags
        )

        XCTAssertEqual(entry.userId, spec.moodUserId)
        XCTAssertEqual(entry.score, score)
        XCTAssertEqual(entry.note, note)
        XCTAssertEqual(entry.tags, tags)
    }

    func testStellarUtilitiesFromContract() throws {
        let spec = try Self.loadSpec()
        let stellar = try StellarClient(config: EchoMirrorConfig(apiKey: "contract-test-key", network: .testnet))

        XCTAssertTrue(stellar.isValidAddress(spec.stellarPublicKey))
        XCTAssertTrue(stellar.isValidAddress(spec.stellarDestination))
        XCTAssertFalse(stellar.isValidAddress("SNOTPUBLIC"))
        XCTAssertEqual(stellar.hashPublicKey(spec.stellarPublicKey)?.count, 64)
    }

    /// Validates the real-time feed semantics behind the contract's
    /// `get_social_feed_since` operation: after a reconnect, entries published
    /// since the last seen id are backfilled (oldest-first) rather than being
    /// silently dropped — mirroring the JS `SocialSubscription` behavior the
    /// FFI can't cover offline. The transport boundary is mocked the same way
    /// the JS runner fakes its WebSocket.
    func testRealtimeBackfillMatchesContractFeedSince() async {
        final class MockTransport: SocialRealtimeTransport {
            private(set) var connectCalls = 0
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
            func disconnect() {}
            func receive(_ event: SocialLiveEvent) { onEvent?(event) }
            func openReconnect() { onOpen?(SocialRealtimeOpenInfo(isReconnect: true)) }
        }

        let transport = MockTransport()
        // The backfill anchor/convention matches the contract's feed-since
        // operation: fetch entries published after a last-seen id, oldest-first.
        // Here feed-002 (score 6, sleep tag, Austin) was published after feed-001.
        let backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])? = { sinceId in
            XCTAssertEqual(sinceId, "feed-001")
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return [try decoder.decode(GlobalFeedEntry.self, from: #"{"id":"feed-002","score":6,"tags":["sleep"],"country":"US","city":"Austin","created_at":"2026-08-17T09:05:00Z"}"#.data(using: .utf8)!)]
        }
        let subscription = SocialSubscription(
            transport: transport,
            wsURL: URL(string: "wss://contract-test/social/ws")!,
            backfill: backfill
        )

        let task = Task {
            var received: [SocialLiveEvent] = []
            for await event in subscription.events() {
                received.append(event)
                if received.count == 2 { break }
            }
            return received
        }

        transport.receive(.feedNewEntry(GlobalFeedEntry(
            id: "feed-001",
            score: 7,
            tags: ["health"],
            country: "US",
            city: "New York",
            createdAt: ISO8601DateFormatter().date(from: "2026-08-17T09:00:00Z")!
        )))
        transport.openReconnect()

        let received = try? await task.value
        guard case .feedNewEntry(let backfilled)? = received?.last else {
            return XCTFail("expected backfilled feedNewEntry, got \(String(describing: received?.last))")
        }
        XCTAssertEqual(backfilled.id, "feed-002")
        XCTAssertEqual(backfilled.score, 6)
        XCTAssertEqual(backfilled.tags, ["sleep"])
        XCTAssertEqual(backfilled.city, "Austin")
    }
}
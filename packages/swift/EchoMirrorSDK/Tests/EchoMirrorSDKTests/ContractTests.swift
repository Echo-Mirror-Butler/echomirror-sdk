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
    private struct Spec {
        let logMoodBody: [String: Any]
        let moodUserId: String
        let stellarPublicKey: String
        let stellarDestination: String
    }

    private static func loadSpec() throws -> Spec {
        let candidates = [
            ProcessInfo.processInfo.environment["ECHOMIRROR_CONTRACT_SPEC"],
            "../../../contract-tests/contract-spec.json", // run from packages/swift/EchoMirrorSDK
            "../../../../contract-tests/contract-spec.json", // run from repo root
        ].compactMap { $0 }

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
                    ?? "GDD6NGUJ3W5OWKX4ZP3JVPQF3T7YNONI3B4QJ6WY2XQKJRBZDK7G4T5QZ"
            )
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
}
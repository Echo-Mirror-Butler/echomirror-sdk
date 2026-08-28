import XCTest
@testable import EchoMirrorSDK

final class EchoMirrorSDKTests: XCTestCase {
    func testErrorMapping() {
        XCTAssertEqual(
            EchoMirrorError(code: 4, message: "bad score"),
            .invalidInput("bad score")
        )
        XCTAssertEqual(
            EchoMirrorError(code: 6, message: "offline"),
            .network("offline")
        )
    }

    func testVersionString() {
        XCTAssertFalse(EchoMirrorVersion.current().isEmpty)
    }

    func testMoodValidation() throws {
        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))
        XCTAssertTrue(mood.isValidScore(1))
        XCTAssertTrue(mood.isValidScore(10))
        XCTAssertFalse(mood.isValidScore(0))
        XCTAssertFalse(mood.isValidScore(11))
    }

    func testStellarUtilities() throws {
        let stellar = try StellarClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))
        let validAddress = "G" + String(repeating: "A", count: 55)

        XCTAssertTrue(stellar.isValidAddress(validAddress))
        XCTAssertFalse(stellar.isValidAddress("SNOTPUBLIC"))
        XCTAssertEqual(stellar.hashPublicKey("GPUBLIC")?.count, 64)
    }

    func testMoodLogBridgesAsyncCallback() async throws {
        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))
        let entry = try await mood.logMood(
            userId: "user-1",
            score: 7,
            note: "steady",
            tags: ["focus"]
        )

        XCTAssertEqual(entry.userId, "user-1")
        XCTAssertEqual(entry.score, 7)
        XCTAssertEqual(entry.note, "steady")
        XCTAssertEqual(entry.tags, ["focus"])
    }

    func testSocialProfileBridgesAsyncCallback() async throws {
        let social = try SocialClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))
        let profile = try await social.profile(userId: "user-1")

        XCTAssertEqual(profile.id, "user-1")
        XCTAssertEqual(profile.currentStreak, 0)
    }

    func testTaskCancellationPropagatesToFFI() async throws {
        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))
        let task = Task { () -> Result<MoodEntry, Error> in
            do {
                return .success(
                    try await mood.logMood(
                        userId: "user-1",
                        score: 7,
                        note: "steady",
                        tags: ["focus"]
                    )
                )
            } catch {
                return .failure(error)
            }
        }

        try? await Task.sleep(nanoseconds: 10_000_000)
        task.cancel()

        switch await task.value {
        case .success:
            XCTFail("expected the native operation to be cancelled")
        case .failure(let error as EchoMirrorError):
            XCTAssertEqual(error, .cancelled("operation cancelled"))
        case .failure(let error):
            XCTFail("unexpected error: \(error)")
        }
    }

    func testFFITimeoutPropagatesToSwift() async throws {
        let mood = try MoodClient(config: EchoMirrorConfig(apiKey: "test", network: .testnet))

        do {
            _ = try await mood.logMood(
                userId: "user-1",
                score: 7,
                note: "steady",
                tags: ["focus"],
                timeoutMs: 1
            )
            XCTFail("expected the native operation to time out")
        } catch let error as EchoMirrorError {
            XCTAssertEqual(error, .timeout("operation timed out"))
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}

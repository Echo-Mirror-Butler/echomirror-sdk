import Foundation
import EchoMirrorFFI

public final class MoodClient {
    private let handle: OpaquePointer

    public init(config: EchoMirrorConfig) throws {
        guard let handle = config.withCStringHandles({ apiKey, baseURL in
            echomirror_mood_client_new(apiKey, baseURL, config.network.rawValue)
        }) else {
            throw EchoMirrorError.invalidConfig("Unable to create MoodClient")
        }

        self.handle = handle
    }

    deinit {
        echomirror_mood_client_free(handle)
    }

    public func isValidScore(_ score: UInt8) -> Bool {
        echomirror_verify_mood_score(score) == 1
    }

    public func logMood(
        userId: String,
        score: UInt8,
        note: String? = nil,
        tags: [String] = []
    ) async throws -> MoodEntry {
        guard isValidScore(score) else {
            throw EchoMirrorError.invalidInput("Mood score must be between 1 and 10")
        }

        let tagsData = try JSONEncoder().encode(tags)
        let tagsJSON = String(decoding: tagsData, as: UTF8.self)

        let payload = try await FFIAsync.perform { callback, userData in
            userId.withCString { userIdCString in
                tagsJSON.withCString { tagsCString in
                    if let note {
                        return note.withCString { noteCString in
                            echomirror_mood_log_async(
                                handle,
                                userIdCString,
                                score,
                                noteCString,
                                tagsCString,
                                callback,
                                userData
                            )
                        }
                    }

                    echomirror_mood_log_async(
                        handle,
                        userIdCString,
                        score,
                        nil,
                        tagsCString,
                        callback,
                        userData
                    )
                }
            }
        }

        return try FFIDecode.decode(MoodEntry.self, from: payload)
    }
}

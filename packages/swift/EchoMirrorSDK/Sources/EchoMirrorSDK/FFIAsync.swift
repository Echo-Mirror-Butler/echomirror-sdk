import Foundation
import EchoMirrorFFI

private final class CallbackBox {
    let continuation: CheckedContinuation<String, Error>

    init(_ continuation: CheckedContinuation<String, Error>) {
        self.continuation = continuation
    }
}

private let echoMirrorCallback: EchoMirrorAsyncCallback = { userData, code, payload in
    guard let userData else {
        if let payload {
            echomirror_free_string(payload)
        }
        return
    }

    let box = Unmanaged<CallbackBox>.fromOpaque(userData).takeRetainedValue()
    let text: String
    if let payload {
        text = String(validatingUTF8: payload) ?? ""
        echomirror_free_string(payload)
    } else {
        text = ""
    }

    if code == 0 {
        box.continuation.resume(returning: text)
        return
    }

    let payloadMessage = (try? JSONDecoder().decode(FFIErrorPayload.self, from: Data(text.utf8)).message)
    box.continuation.resume(
        throwing: EchoMirrorError(
            code: code,
            message: payloadMessage ?? text
        )
    )
}

enum FFIAsync {
    static func perform(
        _ start: (EchoMirrorAsyncCallback?, UnsafeMutableRawPointer?) -> Int32
    ) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let box = Unmanaged.passRetained(CallbackBox(continuation)).toOpaque()
            let code = start(echoMirrorCallback, box)

            if code != 0 {
                Unmanaged<CallbackBox>.fromOpaque(box).release()
                continuation.resume(
                    throwing: EchoMirrorError(
                        code: code,
                        message: "FFI call failed before async dispatch"
                    )
                )
            }
        }
    }
}

enum FFIDecode {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) {
                return date
            }

            let standard = ISO8601DateFormatter()
            standard.formatOptions = [.withInternetDateTime]
            if let date = standard.date(from: value) {
                return date
            }

            throw EchoMirrorError.serialization("Invalid RFC3339 date: \(value)")
        }
        return decoder
    }()

    static func decode<T: Decodable>(_ type: T.Type, from payload: String) throws -> T {
        do {
            return try decoder.decode(type, from: Data(payload.utf8))
        } catch {
            throw EchoMirrorError.serialization("Failed to decode \(T.self): \(error)")
        }
    }
}

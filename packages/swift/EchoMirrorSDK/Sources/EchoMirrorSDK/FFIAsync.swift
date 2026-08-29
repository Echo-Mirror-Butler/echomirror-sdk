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

/// Handle to a cancellation token that can signal an in-flight FFI operation
/// to abort. Wraps the C-ABI `EchoMirrorCancellationHandle`.
public final class CancellationHandle: @unchecked Sendable {
    // Forward-declared C structs import as OpaquePointer in Swift. The native
    // flag is atomic, so sharing this immutable handle with a cancellation
    // handler is safe.
    fileprivate let pointer: OpaquePointer?

    public init() {
        pointer = echomirror_cancellation_new()
    }

    /// Signal the associated async operation to cancel.
    public func cancel() {
        guard let pointer else { return }
        echomirror_cancellation_cancel(pointer)
    }

    /// Whether cancellation has been signalled.
    public var isCancelled: Bool {
        guard let pointer else { return false }
        return echomirror_cancellation_is_cancelled(pointer) != 0
    }

    deinit {
        if let pointer {
            echomirror_cancellation_free(pointer)
        }
    }
}

enum FFIAsync {
    /// Perform an FFI async call without cancellation or timeout.
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

    /// Perform an FFI async call with cancellation and optional timeout.
    ///
    /// - Parameters:
    ///   - cancellationHandle: Optional manual handle. When omitted, the
    ///     enclosing Swift Task still receives a private cancellation handle.
    ///   - timeoutMs: Per-call timeout in milliseconds. 0 means no timeout.
    ///   - start: The FFI function to call, receiving the callback and user data.
    static func perform(
        cancellationHandle: CancellationHandle? = nil,
        timeoutMs: UInt32 = 0,
        _ start: (
            EchoMirrorAsyncCallback?,
            UnsafeMutableRawPointer?,
            OpaquePointer?,
            UInt32
        ) -> Int32
    ) async throws -> String {
        // Retain a handle for the duration of the continuation. This both lets
        // callers cancel manually and propagates Swift Task cancellation to the
        // Rust-side atomic token.
        let handle = cancellationHandle ?? CancellationHandle()
        return try await withTaskCancellationHandler(
            operation: {
                try await withCheckedThrowingContinuation { continuation in
                    let box = Unmanaged.passRetained(CallbackBox(continuation)).toOpaque()
                    let code = start(echoMirrorCallback, box, handle.pointer, timeoutMs)

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
            },
            onCancel: {
                handle.cancel()
            }
        )
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
import Foundation

/// Abstracts the underlying push mechanism so the rest of the real-time layer
/// doesn't care whether it's WebSocket or SSE. Mirrors the JS `RealtimeTransport`
/// interface so a future SSE-backed transport can be swapped in without touching
/// the subscription logic.
///
/// The handler receives each decoded live event. `onOpen` fires every time the
/// transport establishes an open connection; `isReconnect` is `true` when this
/// is not the first open for the current `connect()` — i.e. the connection
/// dropped and came back, which is exactly when events may have been missed.
public protocol SocialRealtimeTransport: AnyObject {
    func connect(url: URL, onOpen: @escaping (SocialRealtimeOpenInfo) -> Void, onEvent: @escaping (SocialLiveEvent) -> Void)
    func disconnect()
}

/// Information passed to the transport's open handler.
public struct SocialRealtimeOpenInfo: Sendable {
    /// `true` when this open is a reconnect rather than the initial connect.
    public let isReconnect: Bool
}

/// WebSocket-based transport for real-time social updates, built on
/// `URLSessionWebSocketTask` (dependency-free).
///
/// Reconnects with capped exponential backoff plus jitter, mirroring the JS
/// `WebSocketTransport` reconnect behavior (`delay * min(attempt, 5)` + 0-200ms
/// jitter) so a transient network blip doesn't silently drop the stream.
///
/// ╔══════════════════════════════════════════════════════════════════╗
/// ║  ASSUMPTION — NOT CONFIRMED                                    ║
/// ║                                                                  ║
/// ║  This transport assumes WebSocket at:                           ║
/// ║    wss://api.echomirror.dev/v1/social/ws                        ║
/// ║                                                                  ║
/// ║  The actual EchoMirror backend may use SSE instead, or a        ║
/// ║  different WebSocket URL/path. The transport protocol exists    ║
/// ║  so switching to SSE requires only a new implementation and a   ║
/// ║  one-line swap.                                                 ║
/// ╚══════════════════════════════════════════════════════════════════╝
public final class WebSocketSocialTransport: SocialRealtimeTransport {
    private let maxReconnectAttempts: Int
    private let reconnectDelayMs: Double
    private let jitterMs: Double
    private let decoder = SocialLiveEventDecoder()

    private let lock = NSLock()
    private var url: URL?
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var onOpen: ((SocialRealtimeOpenInfo) -> Void)?
    private var onEvent: ((SocialLiveEvent) -> Void)?
    private var disposed = false
    private var hasOpenedOnce = false
    private var reconnectAttempts = 0
    private var reconnectWorkItem: DispatchWorkItem?

    /// - Parameters:
    ///   - maxReconnectAttempts: How many times to retry after a drop. Defaults to 10.
    ///   - reconnectDelayMs: Base delay before the first retry. Defaults to 1000.
    ///   - jitterMs: Uniform random jitter added to each delay. Defaults to 200.
    public init(
        maxReconnectAttempts: Int = 10,
        reconnectDelayMs: Double = 1_000,
        jitterMs: Double = 200
    ) {
        self.maxReconnectAttempts = maxReconnectAttempts
        self.reconnectDelayMs = reconnectDelayMs
        self.jitterMs = jitterMs
    }

    deinit {
        dispose()
    }

    public func connect(
        url: URL,
        onOpen: @escaping (SocialRealtimeOpenInfo) -> Void,
        onEvent: @escaping (SocialLiveEvent) -> Void
    ) {
        lock.lock()
        self.url = url
        self.onOpen = onOpen
        self.onEvent = onEvent
        self.disposed = false
        self.hasOpenedOnce = false
        self.reconnectAttempts = 0
        lock.unlock()

        openConnection()
    }

    public func disconnect() {
        lock.lock()
        disposed = true
        lock.unlock()

        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil

        lock.lock()
        let task = self.task
        let session = self.session
        self.task = nil
        self.session = nil
        lock.unlock()

        task?.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()
    }

    // MARK: - Internals

    private func openConnection() {
        lock.lock()
        let shouldProceed = !disposed
        let url = self.url
        lock.unlock()
        guard shouldProceed, let url else { return }

        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: url)

        lock.lock()
        self.session = session
        self.task = task
        let onOpen = self.onOpen
        let hasOpenedOnce = self.hasOpenedOnce
        lock.unlock()

        // The socket opening is asynchronous; report it here so reconnects
        // (and only reconnects) can trigger gap-detection/backfill. We set
        // the flag optimistically before resume — WebSocketTask has no
        // on-open callback, so the first open is assumed successful and any
        // failure is funneled through the receive loop's disconnect path.
        if !hasOpenedOnce {
            lock.lock()
            self.hasOpenedOnce = true
            lock.unlock()
        } else {
            onOpen?(SocialRealtimeOpenInfo(isReconnect: true))
        }

        task.resume()
        receiveLoop(on: task)
    }

    private func receiveLoop(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                let event: SocialLiveEvent?
                switch message {
                case .string(let text):
                    event = self.decoder.decode(text)
                case .data(let data):
                    event = self.decoder.decode(String(decoding: data, as: UTF8.self))
                @unknown default:
                    event = nil
                }

                if let event {
                    self.lock.lock()
                    let handler = self.onEvent
                    self.lock.unlock()
                    handler?(event)
                }

                self.receiveLoop(on: task)

            case .failure:
                self.handleDisconnect()
            }
        }
    }

    private func handleDisconnect() {
        lock.lock()
        let shouldReconnect = !disposed && reconnectAttempts < maxReconnectAttempts
        lock.unlock()

        if !shouldReconnect { return }

        lock.lock()
        reconnectAttempts += 1
        let attempt = reconnectAttempts
        lock.unlock()

        // Capped exponential backoff with jitter, mirroring the JS transport
        // and the Rust `Backoff` strategy.
        let capped = min(attempt, 5)
        let multiplier = pow(2.0, Double(capped - 1))
        let base = reconnectDelayMs * multiplier
        let jitter = Double.random(in: 0..<jitterMs)
        let delayMs = base + jitter

        let workItem = DispatchWorkItem { [weak self] in
            self?.reconnectWorkItem = nil
            self?.openConnection()
        }
        lock.lock()
        reconnectWorkItem = workItem
        lock.unlock()

        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(Int(delayMs)), execute: workItem)
    }

    private func dispose() {
        disconnect()
    }
}

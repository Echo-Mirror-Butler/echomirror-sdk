import Foundation

/// Manager for real-time social updates, surfaced as an `AsyncSequence` of
/// `SocialLiveEvent` that consumers iterate with `for await`. Mirrors the JS
/// `SocialSubscription`.
///
/// The subscription wraps a `SocialRealtimeTransport`. After a genuine
/// reconnect (not the initial connect), it runs the configured backfill to
/// recover any `feed:new_entry` events missed while disconnected; if no
/// backfill is configured, has no anchor to backfill from, or the backfill
/// fails, subscribers instead receive a `connectionGap` so they know to treat
/// their state as possibly stale.
public final class SocialSubscription {
    private let transport: any SocialRealtimeTransport
    private let url: URL
    private let backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])?

    private let lock = NSLock()
    private var continuations: [UUID: AsyncStream<SocialLiveEvent>.Continuation] = [:]
    private var lastFeedEntryId: String?
    private var isConnected = false

    /// - Parameters:
    ///   - transport: The transport to use. Defaults to a `WebSocketSocialTransport`.
    ///   - wsURL: The WebSocket endpoint. Defaults to
    ///     `wss://api.echomirror.dev/v1/social/ws` (see `WebSocketSocialTransport`
    ///     for the ASSUMPTION — NOT CONFIRMED caveat).
    ///   - backfill: Optional async re-fetcher given the last seen feed-entry
    ///     id, returning entries published since that id (entries are replayed
    ///     oldest-first). When omitted (or when no anchor exists, or the call
    ///     throws), a reconnect yields `connectionGap` instead.
    public init(
        transport: any SocialRealtimeTransport = WebSocketSocialTransport(),
        wsURL: URL = URL(string: "wss://api.echomirror.dev/v1/social/ws")!,
        backfill: (@Sendable (String) async throws -> [GlobalFeedEntry])? = nil
    ) {
        self.transport = transport
        self.url = wsURL
        self.backfill = backfill
    }

    deinit {
        transport.disconnect()
    }

    /// The real-time event stream. Each call yields a fresh stream that starts
    /// the transport on first iteration and tears it down when the stream's
    /// consumer stops iterating.
    public func events() -> AsyncStream<SocialLiveEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            lock.lock()
            continuations[id] = continuation
            let shouldConnect = !isConnected
            if shouldConnect { isConnected = true }
            lock.unlock()

            if shouldConnect {
                transport.connect(url: url, onOpen: { [weak self] info in
                    guard info.isReconnect else { return }
                    self?.handleReconnect()
                }, onEvent: { [weak self] event in
                    self?.handleEvent(event)
                })
            }

            continuation.onTermination = { [weak self] _ in
                guard let self else { return }
                self.lock.lock()
                self.continuations.removeValue(forKey: id)
                let isEmpty = self.continuations.isEmpty
                self.lock.unlock()
                if isEmpty {
                    self.isConnected = false
                    self.transport.disconnect()
                }
            }
        }
    }

    // MARK: - Internals

    private func handleEvent(_ event: SocialLiveEvent) {
        if case .feedNewEntry(let entry) = event {
            lock.lock()
            lastFeedEntryId = entry.id
            lock.unlock()
        }
        emit(event)
    }

    private func handleReconnect() {
        lock.lock()
        let anchor = lastFeedEntryId
        let backfill = self.backfill
        lock.unlock()

        guard let anchor, let backfill else {
            emit(.connectionGap(since: anchor))
            return
        }

        Task { [weak self] in
            await self?.runBackfill(since: anchor, backfill: backfill)
        }
    }

    private func runBackfill(since: String, backfill: @Sendable (String) async throws -> [GlobalFeedEntry]) async {
        do {
            let entries = try await backfill(since)
            for entry in entries {
                lock.lock()
                lastFeedEntryId = entry.id
                lock.unlock()
                emit(.feedNewEntry(entry))
            }
        } catch {
            emit(.connectionGap(since: since))
        }
    }

    private func emit(_ event: SocialLiveEvent) {
        lock.lock()
        let continuations = Array(self.continuations.values)
        lock.unlock()
        for continuation in continuations {
            continuation.yield(event)
        }
    }
}

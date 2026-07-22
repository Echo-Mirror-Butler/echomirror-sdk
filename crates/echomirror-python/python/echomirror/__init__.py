"""EchoMirror Python SDK.

Async Python bindings for the EchoMirror API — mood tracking, Stellar wallet
operations, and social features — powered by native Rust (PyO3) bindings over
the same `echomirror-core` / `echomirror-stellar` crates used by the Rust,
JS, and Flutter SDKs.

Quickstart:

    import asyncio
    from echomirror import EchoMirror, StellarNetwork

    async def main():
        app = EchoMirror(api_key="your_api_key", network=StellarNetwork.Testnet)
        entry = await app.mood.log(score=8, note="Great day", tags=["work"])
        print(entry.id, entry.score)

    asyncio.run(main())
"""

from ._echomirror import (
    AiReflection,
    AuthError,
    ConfigError,
    EchoMirror,
    EchoMirrorClient,
    EchoMirrorException,
    GlobalFeedEntry,
    LeaderboardEntry,
    MoodClient,
    MoodEntry,
    MoodHistoryPage,
    MoodStreak,
    MoodSummary,
    NetworkError,
    NotFoundError,
    RateLimitError,
    SocialClient,
    StellarBalance,
    StellarClient,
    StellarNetwork,
    StellarTransaction,
    TransactionHistoryPage,
    UnsignedTransaction,
    UserProfile,
    __version__,
)

__all__ = [
    "AiReflection",
    "AuthError",
    "ConfigError",
    "EchoMirror",
    "EchoMirrorClient",
    "EchoMirrorException",
    "GlobalFeedEntry",
    "LeaderboardEntry",
    "MoodClient",
    "MoodEntry",
    "MoodHistoryPage",
    "MoodStreak",
    "MoodSummary",
    "NetworkError",
    "NotFoundError",
    "RateLimitError",
    "SocialClient",
    "StellarBalance",
    "StellarClient",
    "StellarNetwork",
    "StellarTransaction",
    "TransactionHistoryPage",
    "UnsignedTransaction",
    "UserProfile",
    "__version__",
]

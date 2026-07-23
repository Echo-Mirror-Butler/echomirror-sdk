"""Type stubs for the `echomirror` package (native PyO3 extension)."""

from enum import Enum
from typing import List, Optional

__version__: str

class StellarNetwork(Enum):
    Mainnet = ...
    Testnet = ...

# ── Exceptions ────────────────────────────────────────────────────────────────

class EchoMirrorException(Exception): ...
class AuthError(EchoMirrorException): ...
class NetworkError(EchoMirrorException): ...
class RateLimitError(EchoMirrorException): ...
class NotFoundError(EchoMirrorException): ...
class ConfigError(EchoMirrorException): ...

# ── Mood ──────────────────────────────────────────────────────────────────────

class AiReflection:
    id: str
    entry_id: str
    content: str
    sentiment: str
    themes: List[str]
    generated_at: str

class MoodEntry:
    id: str
    user_id: str
    score: int
    note: Optional[str]
    tags: List[str]
    ai_reflection: Optional[AiReflection]
    created_at: str
    updated_at: str

class MoodStreak:
    current: int
    longest: int
    last_logged_at: Optional[str]
    is_active_today: bool

class MoodSummary:
    period: str
    average: float
    min: int
    max: int
    total_entries: int
    trend: str

class MoodHistoryPage:
    entries: List[MoodEntry]
    total: int

class MoodClient:
    def __init__(self, client: "EchoMirrorClient") -> None: ...
    async def log(
        self,
        score: int,
        note: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> MoodEntry: ...
    async def get_history(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        tags: Optional[List[str]] = None,
        min_score: Optional[int] = None,
        max_score: Optional[int] = None,
    ) -> MoodHistoryPage: ...
    async def get_entry(self, entry_id: str) -> MoodEntry: ...
    async def delete_entry(self, entry_id: str) -> None: ...
    async def get_streak(self) -> MoodStreak: ...
    async def get_summary(self, period: str = "week") -> MoodSummary: ...
    async def request_reflection(self, entry_id: str) -> AiReflection: ...
    async def get_reflection(self, entry_id: str) -> Optional[AiReflection]: ...

# ── Stellar ───────────────────────────────────────────────────────────────────

class StellarBalance:
    xlm: str
    echo: str
    public_key: str
    network: str
    last_fetched: str

class StellarTransaction:
    id: str
    tx_type: str
    asset: str
    amount: str
    from_address: str
    to_address: str
    memo: Optional[str]
    created_at: str
    stellar_tx_hash: str
    ledger_sequence: Optional[int]

class UnsignedTransaction:
    xdr: str
    fee: int
    sequence: str

class TransactionHistoryPage:
    transactions: List[StellarTransaction]
    cursor: Optional[str]

class StellarClient:
    def __init__(self, client: "EchoMirrorClient") -> None: ...
    async def get_balance(self, public_key: str) -> StellarBalance: ...
    async def build_transfer(
        self,
        from_address: str,
        to_address: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> UnsignedTransaction: ...
    async def submit_transaction(self, signed_xdr: str) -> StellarTransaction: ...
    async def get_transaction_history(
        self,
        public_key: str,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> TransactionHistoryPage: ...
    async def fund_testnet_account(self, public_key: str) -> None: ...

# ── Social ────────────────────────────────────────────────────────────────────

class UserProfile:
    id: str
    username: str
    display_name: str
    avatar_url: Optional[str]
    echo_balance: str
    current_streak: int
    total_entries: int
    joined_at: str

class LeaderboardEntry:
    rank: int
    user_id: str
    display_name: str
    avatar_url: Optional[str]
    streak: int
    total_entries: int
    echo_balance: str
    weekly_score: float

class GlobalFeedEntry:
    id: str
    score: int
    tags: List[str]
    country: Optional[str]
    city: Optional[str]
    created_at: str

class SocialClient:
    def __init__(self, client: "EchoMirrorClient") -> None: ...
    async def get_global_feed(self, limit: int = 50) -> List[GlobalFeedEntry]: ...
    async def get_leaderboard(self, limit: int = 100) -> List[LeaderboardEntry]: ...

# ── Client ────────────────────────────────────────────────────────────────────

class EchoMirrorClient:
    network: StellarNetwork
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        network: StellarNetwork = StellarNetwork.Mainnet,
        timeout_secs: int = 10,
        horizon_url: Optional[str] = None,
        friendbot_url: Optional[str] = None,
    ) -> None: ...
    async def set_auth_token(self, token: Optional[str]) -> None: ...

class EchoMirror:
    mood: MoodClient
    stellar: StellarClient
    social: SocialClient
    client: EchoMirrorClient
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        network: StellarNetwork = StellarNetwork.Mainnet,
        timeout_secs: int = 10,
        horizon_url: Optional[str] = None,
        friendbot_url: Optional[str] = None,
    ) -> None: ...
    async def set_auth_token(self, token: Optional[str]) -> None: ...

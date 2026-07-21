# echomirror-sdk (Python)

Official Python SDK for [EchoMirror](https://echomirror.dev) — mood tracking with Stellar-powered rewards.

Native bindings (PyO3 + maturin) over the same Rust core that powers the JS and Flutter SDKs — every call is real native code and returns a proper `asyncio` coroutine, so nothing blocks the event loop.

## Install

```bash
pip install echomirror-sdk
```

Wheels are published for macOS, Linux, and Windows, Python 3.9–3.12. If no matching wheel is available for your platform, `pip` will build from source, which requires a [Rust toolchain](https://rustup.rs).

## Quickstart

```python
import asyncio
from echomirror import EchoMirror, StellarNetwork

async def main():
    app = EchoMirror(api_key="your_api_key", network=StellarNetwork.Testnet)

    entry = await app.mood.log(score=8, note="Great day", tags=["work", "proud"])
    print(f"Logged mood {entry.score}/10")

    streak = await app.mood.get_streak()
    if not streak.is_active_today:
        print("Don't forget to check in today!")

    balance = await app.stellar.get_balance("GPUBLIC_KEY")
    print(f"{balance.xlm} XLM • {balance.echo} ECHO")

    feed = await app.social.get_global_feed(limit=20)
    print(f"{len(feed)} entries in the global feed")

asyncio.run(main())
```

## Sub-clients

Each sub-client also works standalone against a shared `EchoMirrorClient` — handy if you only need one slice of the API:

```python
from echomirror import EchoMirrorClient, MoodClient, StellarClient, SocialClient, StellarNetwork

client = EchoMirrorClient("your_api_key", network=StellarNetwork.Mainnet)
mood = MoodClient(client)
stellar = StellarClient(client)
social = SocialClient(client)
```

## Error handling

All errors inherit from `EchoMirrorException`:

```python
from echomirror import AuthError, RateLimitError, NotFoundError, EchoMirrorException

try:
    await app.mood.get_streak()
except AuthError:
    ...  # invalid or expired API key
except RateLimitError:
    ...  # back off and retry
except NotFoundError:
    ...
except EchoMirrorException as e:
    ...  # anything else
```

## Testnet

```python
app = EchoMirror(api_key="your_api_key", network=StellarNetwork.Testnet)
await app.stellar.fund_testnet_account("GPUBLIC_KEY")  # Friendbot: 10,000 XLM
```

## Development

```bash
pip install maturin pytest pytest-asyncio
maturin develop --release
pytest
```

## License

MIT

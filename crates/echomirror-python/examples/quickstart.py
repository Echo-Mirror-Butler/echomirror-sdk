"""Run the EchoMirror Python SDK against the shared contract-test fixture.

Pass ``--start-fixture`` to run the repository's API and Horizon fixtures in
process. The defaults are deterministic and never broadcast to Stellar;
environment variables can point the same example at another test deployment.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import os
import threading
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import ModuleType
from typing import Iterator

from echomirror import EchoMirror, NotFoundError, StellarNetwork


DEFAULT_PUBLIC_KEY = "GDKUJHNOCQ6NOFJCSPE5IZMFFRZ6U4VO3EEFJQKJSDK5B4VZTH4XKSKD"
DEFAULT_DESTINATION = "GDD6NGUJ3W5OWKX4ZP3JVPQF3T7YNONI3B4QJ6WY2XQKJRBZDK7G4T5A"
MISSING_FIXTURE_ACCOUNT = "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"


def _load_fixture_module() -> ModuleType:
    fixture_path = (
        Path(__file__).resolve().parents[3] / "contract-tests" / "fixture" / "server.py"
    )
    spec = importlib.util.spec_from_file_location("echomirror_fixture", fixture_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load fixture server from {fixture_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@contextmanager
def fixture_servers() -> Iterator[tuple[str, str]]:
    """Run both repository fixture roles in-process for this example."""
    fixture = _load_fixture_module()
    contract_spec = fixture.load_spec()

    api = ThreadingHTTPServer(("127.0.0.1", 0), fixture.FixtureHandler)
    api.routes = fixture.build_routes(contract_spec, role="api")  # type: ignore[attr-defined]

    horizon = ThreadingHTTPServer(("127.0.0.1", 0), fixture.FixtureHandler)
    horizon.routes = fixture.build_routes(  # type: ignore[attr-defined]
        contract_spec, role="horizon"
    )

    threads = [
        threading.Thread(target=api.serve_forever, daemon=True),
        threading.Thread(target=horizon.serve_forever, daemon=True),
    ]
    for thread in threads:
        thread.start()
    try:
        yield (
            f"http://127.0.0.1:{api.server_port}",
            f"http://127.0.0.1:{horizon.server_port}",
        )
    finally:
        api.shutdown()
        horizon.shutdown()
        for thread in threads:
            thread.join()
        api.server_close()
        horizon.server_close()


async def run_example() -> None:
    api_base = os.getenv("ECHOMIRROR_API_BASE", "http://127.0.0.1:18080")
    fixture_default = "1" if api_base.startswith("http://127.0.0.1:") else "0"
    fixture_mode = os.getenv("ECHOMIRROR_FIXTURE_MODE", fixture_default) == "1"

    app = EchoMirror(
        api_key=os.getenv("ECHOMIRROR_API_KEY", "contract-test-key"),
        base_url=api_base,
        horizon_url=os.getenv(
            "ECHOMIRROR_HORIZON_BASE", "http://127.0.0.1:18081"
        ),
        network=StellarNetwork.Testnet,
    )

    # Optional bearer authentication for deployments that issue user tokens.
    if token := os.getenv("ECHOMIRROR_AUTH_TOKEN"):
        await app.set_auth_token(token)

    entry = await app.mood.log(
        score=8,
        note="Great day",
        tags=["work", "proud"],
    )
    print(f"Mood: {entry.id} ({entry.score}/10)")

    public_key = os.getenv("STELLAR_PUBLIC_KEY", DEFAULT_PUBLIC_KEY)
    destination = os.getenv("STELLAR_DESTINATION", DEFAULT_DESTINATION)
    balance = await app.stellar.get_balance(public_key)
    print(f"Balance: {balance.xlm} XLM, {balance.echo} ECHO")

    unsigned = await app.stellar.build_transfer(
        from_address=public_key,
        to_address=destination,
        amount=5.0,
        memo="Great energy today",
    )
    print(f"Unsigned payment: fee={unsigned.fee}, sequence={unsigned.sequence}")

    # The fixture accepts its canned XDR as the signed response. Do not do this
    # against a live deployment: sign the XDR with the account owner's signer.
    if fixture_mode:
        transaction = await app.stellar.submit_transaction(unsigned.xdr)
        print(f"Fixture payment: {transaction.id} ({transaction.amount} {transaction.asset})")

    feed = await app.social.get_global_feed(limit=10)
    first_feed_id = feed[0].id if feed else "n/a"
    print(f"Social feed: {len(feed)} entries; first id={first_feed_id}")

    if fixture_mode:
        try:
            await app.stellar.get_balance(MISSING_FIXTURE_ACCOUNT)
        except NotFoundError as error:
            print(f"Expected typed error: {type(error).__name__}: {error}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--start-fixture",
        action="store_true",
        help="start the repository's API and Horizon fixtures for this run",
    )
    args = parser.parse_args()

    if args.start_fixture:
        with fixture_servers() as (api_base, horizon_base):
            os.environ["ECHOMIRROR_API_BASE"] = api_base
            os.environ["ECHOMIRROR_HORIZON_BASE"] = horizon_base
            os.environ["ECHOMIRROR_FIXTURE_MODE"] = "1"
            asyncio.run(run_example())
    else:
        asyncio.run(run_example())

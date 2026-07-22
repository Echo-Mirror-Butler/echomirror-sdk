import json

import pytest

import echomirror
from conftest import route


@pytest.mark.asyncio
async def test_get_balance(mock_server, base_url):
    # get_balance queries Horizon directly (no EchoMirror API round-trip), so
    # we point horizon_url at the mock server and return a Horizon-shaped
    # /accounts/{id} response.
    route(
        mock_server,
        "GET",
        "/accounts/GABC123",
        200,
        {
            "balances": [
                {"balance": "125.5000000", "asset_type": "native"},
                {
                    "balance": "42.0000000",
                    "asset_type": "credit_alphanum4",
                    "asset_code": "ECHO",
                    "asset_issuer": "GISSUER",
                },
            ]
        },
    )
    client = echomirror.EchoMirrorClient(
        "test-key",
        network=echomirror.StellarNetwork.Testnet,
        horizon_url=base_url,
    )
    stellar = echomirror.StellarClient(client)

    balance = await stellar.get_balance("GABC123")

    assert balance.xlm == "125.5000000"
    assert balance.echo == "42.0000000"
    assert balance.public_key == "GABC123"


@pytest.mark.asyncio
async def test_get_balance_account_not_found(mock_server, base_url):
    route(mock_server, "GET", "/accounts/GMISSING", 404, {"message": "not found"})
    client = echomirror.EchoMirrorClient("test-key", horizon_url=base_url)
    stellar = echomirror.StellarClient(client)

    with pytest.raises(echomirror.NotFoundError):
        await stellar.get_balance("GMISSING")


@pytest.mark.asyncio
async def test_build_transfer_and_submit(mock_server, base_url):
    route(
        mock_server,
        "POST",
        "/stellar/build-transfer",
        200,
        {"xdr": "AAAAAgAAAA...", "fee": 100, "sequence": "123456789"},
    )
    route(
        mock_server,
        "POST",
        "/stellar/submit",
        200,
        {
            "id": "tx1",
            "type": "send",
            "asset": "ECHO",
            "amount": "10.0000000",
            "from": "GFROM",
            "to": "GTO",
            "memo": "gift",
            "created_at": "2026-07-20T10:00:00Z",
            "stellar_tx_hash": "hash123",
            "ledger_sequence": 42,
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    stellar = echomirror.StellarClient(client)

    unsigned = await stellar.build_transfer("GFROM", "GTO", 10.0, memo="gift")
    assert unsigned.xdr == "AAAAAgAAAA..."
    assert unsigned.fee == 100

    build_req = mock_server.received[-1]
    assert json.loads(build_req["body"]) == {
        "from": "GFROM",
        "to": "GTO",
        "amount": 10.0,
        "memo": "gift",
    }

    tx = await stellar.submit_transaction("signed-xdr-here")
    assert tx.id == "tx1"
    assert tx.tx_type == "send"
    assert tx.from_address == "GFROM"
    assert tx.to_address == "GTO"
    assert tx.ledger_sequence == 42


@pytest.mark.asyncio
async def test_get_transaction_history(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/stellar/transactions",
        200,
        {
            "transactions": [
                {
                    "id": "tx1",
                    "type": "receive",
                    "asset": "XLM",
                    "amount": "5.0000000",
                    "from": "GA",
                    "to": "GB",
                    "memo": None,
                    "created_at": "2026-07-20T10:00:00Z",
                    "stellar_tx_hash": "hash1",
                    "ledger_sequence": None,
                }
            ],
            "cursor": "next-page-token",
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    stellar = echomirror.StellarClient(client)

    page = await stellar.get_transaction_history("GB", limit=10)

    assert len(page.transactions) == 1
    assert page.transactions[0].tx_type == "receive"
    assert page.cursor == "next-page-token"


@pytest.mark.asyncio
async def test_fund_testnet_account(mock_server, base_url):
    # Friendbot is a plain `GET {friendbot_url}?addr=...` call, no EchoMirror
    # API round-trip, so we point friendbot_url at the mock server directly.
    route(mock_server, "GET", "/", 200, {"ok": True})
    client = echomirror.EchoMirrorClient(
        "test-key",
        network=echomirror.StellarNetwork.Testnet,
        friendbot_url=base_url,
    )
    stellar = echomirror.StellarClient(client)

    await stellar.fund_testnet_account("GABC123")

    req = mock_server.received[-1]
    assert req["method"] == "GET"
    assert "addr=GABC123" in req["path"]


@pytest.mark.asyncio
async def test_fund_testnet_account_rejects_mainnet(mock_server, base_url):
    client = echomirror.EchoMirrorClient(
        "test-key", network=echomirror.StellarNetwork.Mainnet
    )
    stellar = echomirror.StellarClient(client)

    with pytest.raises(echomirror.ConfigError):
        await stellar.fund_testnet_account("GABC123")


@pytest.mark.asyncio
async def test_get_balance_network_error(mock_server, base_url):
    route(mock_server, "GET", "/accounts/GABC123", 500, {"message": "horizon unavailable"})
    client = echomirror.EchoMirrorClient("test-key", horizon_url=base_url)
    stellar = echomirror.StellarClient(client)

    with pytest.raises(echomirror.EchoMirrorException):
        await stellar.get_balance("GABC123")

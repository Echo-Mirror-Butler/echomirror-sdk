import pytest

import echomirror
from conftest import route


def test_exception_hierarchy():
    """Verify the exported exception inheritance hierarchy."""
    assert issubclass(echomirror.EchoMirrorException, Exception)
    assert issubclass(echomirror.AuthError, echomirror.EchoMirrorException)
    assert issubclass(echomirror.NetworkError, echomirror.EchoMirrorException)
    assert issubclass(echomirror.RateLimitError, echomirror.EchoMirrorException)
    assert issubclass(echomirror.NotFoundError, echomirror.EchoMirrorException)
    assert issubclass(echomirror.ConfigError, echomirror.EchoMirrorException)


def test_exception_instantiation_and_catch():
    """Verify that every exception in errors.rs can be instantiated and caught."""
    exceptions = [
        echomirror.AuthError("invalid credentials"),
        echomirror.NetworkError("connection refused"),
        echomirror.RateLimitError("Rate limit exceeded — retry after 30s"),
        echomirror.NotFoundError("resource not found"),
        echomirror.ConfigError("invalid base_url"),
        echomirror.EchoMirrorException("unexpected error"),
    ]

    for exc in exceptions:
        with pytest.raises(echomirror.EchoMirrorException) as exc_info:
            raise exc
        assert issubclass(type(exc_info.value), echomirror.EchoMirrorException)
        assert str(exc) in str(exc_info.value)


def test_client_construction_defaults():
    """Verify client construction with default arguments."""
    client = echomirror.EchoMirrorClient("test-key")
    assert client.network == echomirror.StellarNetwork.Mainnet
    assert "EchoMirrorClient" in repr(client)


def test_client_construction_custom():
    """Verify client construction with explicit configuration parameters."""
    client = echomirror.EchoMirrorClient(
        api_key="custom-key",
        base_url="https://custom.api.test",
        network=echomirror.StellarNetwork.Testnet,
        timeout_secs=30,
        horizon_url="https://horizon.custom.test",
        friendbot_url="https://friendbot.custom.test",
    )
    assert client.network == echomirror.StellarNetwork.Testnet
    assert "EchoMirrorClient" in repr(client)


def test_echomirror_wrapper_construction(base_url):
    """Verify the EchoMirror convenience class bundles all sub-clients."""
    app = echomirror.EchoMirror(
        api_key="test-app-key",
        base_url=base_url,
        network=echomirror.StellarNetwork.Testnet,
    )
    assert isinstance(app.mood, echomirror.MoodClient)
    assert isinstance(app.stellar, echomirror.StellarClient)
    assert isinstance(app.social, echomirror.SocialClient)
    assert isinstance(app.client, echomirror.EchoMirrorClient)
    assert app.client.network == echomirror.StellarNetwork.Testnet


@pytest.mark.asyncio
async def test_auth_token_handling(mock_server, base_url):
    """Verify that setting and clearing auth tokens updates request Authorization header."""
    route(
        mock_server,
        "GET",
        "/mood/streak",
        200,
        {
            "current": 1,
            "longest": 1,
            "last_logged_at": "2026-07-19T09:00:00Z",
            "is_active_today": True,
        },
    )

    client = echomirror.EchoMirrorClient("test-api-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    # Initial call without auth token
    await mood.get_streak()
    req1 = mock_server.received[-1]
    assert req1["headers"]["x-api-key"] == "test-api-key"
    assert "authorization" not in req1["headers"]

    # Set auth token
    await client.set_auth_token("jwt-session-token-123")
    await mood.get_streak()
    req2 = mock_server.received[-1]
    assert req2["headers"]["x-api-key"] == "test-api-key"
    assert req2["headers"]["authorization"] == "Bearer jwt-session-token-123"

    # Clear auth token
    await client.set_auth_token(None)
    await mood.get_streak()
    req3 = mock_server.received[-1]
    assert req3["headers"]["x-api-key"] == "test-api-key"
    assert "authorization" not in req3["headers"]


@pytest.mark.asyncio
async def test_echomirror_app_set_auth_token(mock_server, base_url):
    """Verify app.set_auth_token propagates to sub-clients."""
    route(
        mock_server,
        "GET",
        "/mood/streak",
        200,
        {
            "current": 3,
            "longest": 3,
            "last_logged_at": "2026-07-19T09:00:00Z",
            "is_active_today": True,
        },
    )

    app = echomirror.EchoMirror("test-key", base_url=base_url)
    await app.set_auth_token("bearer-token-xyz")
    await app.mood.get_streak()

    req = mock_server.received[-1]
    assert req["headers"]["authorization"] == "Bearer bearer-token-xyz"


@pytest.mark.asyncio
async def test_error_mapping_auth_error(mock_server, base_url):
    """401 responses map to AuthError and are catchable as EchoMirrorException."""
    route(mock_server, "GET", "/mood/streak", 401, {"message": "Invalid API key"})
    client = echomirror.EchoMirrorClient("bad-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.AuthError) as exc_info:
        await mood.get_streak()
    assert issubclass(type(exc_info.value), echomirror.EchoMirrorException)


@pytest.mark.asyncio
async def test_error_mapping_not_found_error(mock_server, base_url):
    """404 responses map to NotFoundError and are catchable as EchoMirrorException."""
    route(mock_server, "GET", "/mood/entries/nonexistent", 404, {"message": "Entry not found"})
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.NotFoundError) as exc_info:
        await mood.get_entry("nonexistent")
    assert issubclass(type(exc_info.value), echomirror.EchoMirrorException)


@pytest.mark.asyncio
async def test_error_mapping_rate_limit_error(mock_server, base_url):
    """429 responses map to RateLimitError and are catchable as EchoMirrorException."""
    route(
        mock_server,
        "GET",
        "/mood/streak",
        429,
        {"message": "Rate limit exceeded"},
        headers={"retry-after": "15"},
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.RateLimitError) as exc_info:
        await mood.get_streak()
    assert issubclass(type(exc_info.value), echomirror.EchoMirrorException)


@pytest.mark.asyncio
async def test_error_mapping_network_error():
    """Unreachable connection maps to NetworkError and is catchable as EchoMirrorException."""
    # Point to a dead/closed local port with timeout=1
    client = echomirror.EchoMirrorClient(
        "test-key",
        base_url="http://127.0.0.1:1",
        timeout_secs=1,
    )
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.NetworkError) as exc_info:
        await mood.get_streak()
    assert issubclass(type(exc_info.value), echomirror.EchoMirrorException)


@pytest.mark.asyncio
async def test_error_mapping_server_error(mock_server, base_url):
    """500 server error maps to base EchoMirrorException."""
    route(mock_server, "GET", "/mood/streak", 500, {"message": "Internal server error"})
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.EchoMirrorException):
        await mood.get_streak()

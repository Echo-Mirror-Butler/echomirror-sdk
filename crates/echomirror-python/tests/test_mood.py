import json

import pytest

import echomirror
from conftest import route


@pytest.mark.asyncio
async def test_log_mood(mock_server, base_url):
    route(
        mock_server,
        "POST",
        "/mood/entries",
        200,
        {
            "id": "m1",
            "user_id": "u1",
            "score": 8,
            "note": "Great day",
            "tags": ["work"],
            "ai_reflection": None,
            "created_at": "2026-07-20T10:00:00Z",
            "updated_at": "2026-07-20T10:00:00Z",
        },
    )
    client = echomirror.EchoMirrorClient(
        "test-key", base_url=base_url, network=echomirror.StellarNetwork.Testnet
    )
    mood = echomirror.MoodClient(client)

    entry = await mood.log(score=8, note="Great day", tags=["work"])

    assert entry.id == "m1"
    assert entry.score == 8
    assert entry.tags == ["work"]
    assert entry.ai_reflection is None

    req = mock_server.received[-1]
    assert req["headers"]["x-api-key"] == "test-key"
    assert json.loads(req["body"]) == {"score": 8, "note": "Great day", "tags": ["work"]}


@pytest.mark.asyncio
async def test_log_mood_rejects_invalid_score(mock_server, base_url):
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(ValueError):
        await mood.log(score=11)
    with pytest.raises(ValueError):
        await mood.log(score=0)


@pytest.mark.asyncio
async def test_get_history(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/mood/entries",
        200,
        {
            "entries": [
                {
                    "id": "m1",
                    "user_id": "u1",
                    "score": 6,
                    "note": None,
                    "tags": [],
                    "ai_reflection": None,
                    "created_at": "2026-07-20T10:00:00Z",
                    "updated_at": "2026-07-20T10:00:00Z",
                }
            ],
            "total": 1,
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    page = await mood.get_history(limit=10)

    assert page.total == 1
    assert len(page.entries) == 1
    assert page.entries[0].id == "m1"


@pytest.mark.asyncio
async def test_get_streak(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/mood/streak",
        200,
        {
            "current": 5,
            "longest": 12,
            "last_logged_at": "2026-07-19T09:00:00Z",
            "is_active_today": True,
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    streak = await mood.get_streak()

    assert streak.current == 5
    assert streak.longest == 12
    assert streak.is_active_today is True


@pytest.mark.asyncio
async def test_delete_entry(mock_server, base_url):
    route(mock_server, "DELETE", "/mood/entries/m1", 204, None)
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    await mood.delete_entry("m1")

    assert mock_server.received[-1]["method"] == "DELETE"


@pytest.mark.asyncio
async def test_get_reflection_not_ready(mock_server, base_url):
    route(mock_server, "GET", "/mood/entries/m1/reflection", 200, None)
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    reflection = await mood.get_reflection("m1")

    assert reflection is None


# ── Error paths ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auth_error(mock_server, base_url):
    route(mock_server, "GET", "/mood/streak", 401, {"message": "nope"})
    client = echomirror.EchoMirrorClient("bad-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.AuthError):
        await mood.get_streak()


@pytest.mark.asyncio
async def test_rate_limit_error(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/mood/streak",
        429,
        {"message": "slow down"},
        headers={"retry-after": "30"},
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.RateLimitError):
        await mood.get_streak()


@pytest.mark.asyncio
async def test_not_found_error(mock_server, base_url):
    route(mock_server, "GET", "/mood/entries/missing", 404, {"message": "no such entry"})
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.NotFoundError):
        await mood.get_entry("missing")


@pytest.mark.asyncio
async def test_server_error_raises_base_exception(mock_server, base_url):
    route(mock_server, "GET", "/mood/streak", 500, {"message": "boom"})
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    mood = echomirror.MoodClient(client)

    with pytest.raises(echomirror.EchoMirrorException):
        await mood.get_streak()

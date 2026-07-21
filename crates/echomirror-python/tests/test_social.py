import pytest

import echomirror
from conftest import route


@pytest.mark.asyncio
async def test_get_global_feed(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/social/feed",
        200,
        {
            "entries": [
                {
                    "id": "f1",
                    "score": 9,
                    "tags": ["gratitude"],
                    "country": "KE",
                    "city": "Nairobi",
                    "created_at": "2026-07-20T10:00:00Z",
                }
            ]
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    social = echomirror.SocialClient(client)

    feed = await social.get_global_feed(limit=20)

    assert len(feed) == 1
    assert feed[0].id == "f1"
    assert feed[0].score == 9
    assert feed[0].country == "KE"

    req = mock_server.received[-1]
    assert "limit=20" in req["path"]


@pytest.mark.asyncio
async def test_get_leaderboard(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/social/leaderboard",
        200,
        {
            "entries": [
                {
                    "rank": 1,
                    "user_id": "u1",
                    "display_name": "Jojo",
                    "avatar_url": None,
                    "streak": 30,
                    "total_entries": 120,
                    "echo_balance": "500.0000000",
                    "weekly_score": 87.5,
                }
            ]
        },
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    social = echomirror.SocialClient(client)

    leaderboard = await social.get_leaderboard()

    assert len(leaderboard) == 1
    assert leaderboard[0].rank == 1
    assert leaderboard[0].display_name == "Jojo"
    assert leaderboard[0].weekly_score == 87.5


@pytest.mark.asyncio
async def test_get_global_feed_empty(mock_server, base_url):
    route(mock_server, "GET", "/social/feed", 200, {"entries": []})
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    social = echomirror.SocialClient(client)

    feed = await social.get_global_feed()

    assert feed == []


@pytest.mark.asyncio
async def test_get_leaderboard_rate_limited(mock_server, base_url):
    route(
        mock_server,
        "GET",
        "/social/leaderboard",
        429,
        {"message": "slow down"},
        headers={"retry-after": "10"},
    )
    client = echomirror.EchoMirrorClient("test-key", base_url=base_url)
    social = echomirror.SocialClient(client)

    with pytest.raises(echomirror.RateLimitError):
        await social.get_leaderboard()

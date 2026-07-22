use crate::{EchoMirrorClient, GlobalFeedEntry, LeaderboardEntry, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct GlobalFeedPage {
    pub entries: Vec<GlobalFeedEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LeaderboardPage {
    pub entries: Vec<LeaderboardEntry>,
}

/// Get the global mood feed — anonymized entries from across the EchoMirror network.
pub async fn get_global_feed(
    client: &EchoMirrorClient,
    limit: u32,
) -> Result<Vec<GlobalFeedEntry>> {
    let page: GlobalFeedPage = client.get(&format!("/social/feed?limit={limit}")).await?;
    Ok(page.entries)
}

/// Get the weekly leaderboard.
pub async fn get_leaderboard(
    client: &EchoMirrorClient,
    limit: u32,
) -> Result<Vec<LeaderboardEntry>> {
    let page: LeaderboardPage = client
        .get(&format!("/social/leaderboard?limit={limit}"))
        .await?;
    Ok(page.entries)
}

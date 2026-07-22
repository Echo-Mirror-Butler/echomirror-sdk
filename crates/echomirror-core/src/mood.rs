use crate::{AiReflection, EchoMirrorClient, MoodEntry, MoodStreak, MoodSummary, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct LogMoodPayload {
    /// 1 (very low) – 10 (excellent)
    pub score: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct GetMoodHistoryOptions {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub tags: Vec<String>,
    pub min_score: Option<u8>,
    pub max_score: Option<u8>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MoodHistoryPage {
    pub entries: Vec<MoodEntry>,
    pub total: u32,
}

/// Log a mood entry for the authenticated user.
///
/// ```rust,no_run
/// use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
/// use echomirror_core::mood::{log_mood, LogMoodPayload};
///
/// #[tokio::main]
/// async fn main() {
///     let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("api_key")).unwrap();
///     let entry = log_mood(&client, LogMoodPayload {
///         score: 8,
///         note: Some("Great day".into()),
///         tags: vec!["work".into()],
///     }).await.unwrap();
///     println!("Logged mood {}", entry.score);
/// }
/// ```
pub async fn log_mood(client: &EchoMirrorClient, payload: LogMoodPayload) -> Result<MoodEntry> {
    client.post("/mood/entries", &payload).await
}

/// Get paginated mood history for the authenticated user.
pub async fn get_mood_history(
    client: &EchoMirrorClient,
    options: GetMoodHistoryOptions,
) -> Result<MoodHistoryPage> {
    let mut query = Vec::new();
    if let Some(v) = options.limit {
        query.push(format!("limit={v}"));
    }
    if let Some(v) = options.offset {
        query.push(format!("offset={v}"));
    }
    if let Some(v) = &options.from {
        query.push(format!("from={v}"));
    }
    if let Some(v) = &options.to {
        query.push(format!("to={v}"));
    }
    if let Some(v) = options.min_score {
        query.push(format!("min_score={v}"));
    }
    if let Some(v) = options.max_score {
        query.push(format!("max_score={v}"));
    }
    if !options.tags.is_empty() {
        query.push(format!("tags={}", options.tags.join(",")));
    }

    let path = if query.is_empty() {
        "/mood/entries".to_string()
    } else {
        format!("/mood/entries?{}", query.join("&"))
    };
    client.get(&path).await
}

/// Get a single mood entry by ID.
pub async fn get_mood_entry(client: &EchoMirrorClient, entry_id: &str) -> Result<MoodEntry> {
    client.get(&format!("/mood/entries/{entry_id}")).await
}

/// Delete a mood entry.
pub async fn delete_mood_entry(client: &EchoMirrorClient, entry_id: &str) -> Result<()> {
    client.delete(&format!("/mood/entries/{entry_id}")).await
}

/// Get the user's current and longest streak.
pub async fn get_mood_streak(client: &EchoMirrorClient) -> Result<MoodStreak> {
    client.get("/mood/streak").await
}

/// Get aggregated mood statistics for a time period ("week" | "month" | "year" | "all").
pub async fn get_mood_summary(client: &EchoMirrorClient, period: &str) -> Result<MoodSummary> {
    client.get(&format!("/mood/summary?period={period}")).await
}

/// Request an AI reflection for a specific mood entry.
/// Reflections are generated asynchronously — poll `get_ai_reflection` or use webhooks.
pub async fn request_ai_reflection(
    client: &EchoMirrorClient,
    entry_id: &str,
) -> Result<AiReflection> {
    client
        .post_empty(&format!("/mood/entries/{entry_id}/reflect"))
        .await
}

/// Get the AI reflection for a mood entry, once generated (`None` if not ready yet).
pub async fn get_ai_reflection(
    client: &EchoMirrorClient,
    entry_id: &str,
) -> Result<Option<AiReflection>> {
    client
        .get(&format!("/mood/entries/{entry_id}/reflection"))
        .await
}

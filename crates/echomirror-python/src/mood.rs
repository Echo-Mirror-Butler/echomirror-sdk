use echomirror_core::mood::{self, GetMoodHistoryOptions, LogMoodPayload};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyAny;

use crate::client::PyEchoMirrorClient;
use crate::errors::to_py_err;
use crate::types::{PyAiReflection, PyMoodEntry, PyMoodHistoryPage, PyMoodStreak, PyMoodSummary};

/// Mood logging, history, streaks, summaries, and AI reflections.
///
/// ```python
/// mood = MoodClient(client)
/// entry = await mood.log(score=8, note="Great day", tags=["work"])
/// ```
#[pyclass(name = "MoodClient")]
#[derive(Clone)]
pub struct PyMoodClient {
    client: PyEchoMirrorClient,
}

#[pymethods]
impl PyMoodClient {
    #[new]
    pub fn new(client: PyEchoMirrorClient) -> Self {
        Self { client }
    }

    /// Log a mood entry for the authenticated user. `score` must be 1-10.
    #[pyo3(signature = (score, note=None, tags=None))]
    fn log<'py>(
        &self,
        py: Python<'py>,
        score: u8,
        note: Option<String>,
        tags: Option<Vec<String>>,
    ) -> PyResult<Bound<'py, PyAny>> {
        if !(1..=10).contains(&score) {
            return Err(PyValueError::new_err("score must be between 1 and 10"));
        }
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let payload = LogMoodPayload {
                score,
                note,
                tags: tags.unwrap_or_default(),
            };
            let entry = mood::log_mood(&inner, payload).await.map_err(to_py_err)?;
            Ok(PyMoodEntry::from(entry))
        })
    }

    /// Get paginated mood history for the authenticated user.
    #[pyo3(signature = (limit=None, offset=None, from_date=None, to_date=None, tags=None, min_score=None, max_score=None))]
    #[allow(clippy::too_many_arguments)]
    fn get_history<'py>(
        &self,
        py: Python<'py>,
        limit: Option<u32>,
        offset: Option<u32>,
        from_date: Option<String>,
        to_date: Option<String>,
        tags: Option<Vec<String>>,
        min_score: Option<u8>,
        max_score: Option<u8>,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let options = GetMoodHistoryOptions {
                limit,
                offset,
                from: from_date,
                to: to_date,
                tags: tags.unwrap_or_default(),
                min_score,
                max_score,
            };
            let page = mood::get_mood_history(&inner, options)
                .await
                .map_err(to_py_err)?;
            Ok(PyMoodHistoryPage {
                entries: page.entries.into_iter().map(Into::into).collect(),
                total: page.total,
            })
        })
    }

    /// Get a single mood entry by ID.
    fn get_entry<'py>(&self, py: Python<'py>, entry_id: String) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let entry = mood::get_mood_entry(&inner, &entry_id)
                .await
                .map_err(to_py_err)?;
            Ok(PyMoodEntry::from(entry))
        })
    }

    /// Delete a mood entry.
    fn delete_entry<'py>(&self, py: Python<'py>, entry_id: String) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            mood::delete_mood_entry(&inner, &entry_id)
                .await
                .map_err(to_py_err)?;
            Ok(())
        })
    }

    /// Get the user's current and longest streak.
    fn get_streak<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let streak = mood::get_mood_streak(&inner).await.map_err(to_py_err)?;
            Ok(PyMoodStreak::from(streak))
        })
    }

    /// Get aggregated mood statistics for a time period ("week" | "month" | "year" | "all").
    #[pyo3(signature = (period="week".to_string()))]
    fn get_summary<'py>(&self, py: Python<'py>, period: String) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let summary = mood::get_mood_summary(&inner, &period)
                .await
                .map_err(to_py_err)?;
            Ok(PyMoodSummary::from(summary))
        })
    }

    /// Request an AI reflection for a mood entry. Reflections are generated
    /// asynchronously — poll `get_reflection` until it returns non-`None`.
    fn request_reflection<'py>(
        &self,
        py: Python<'py>,
        entry_id: String,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let reflection = mood::request_ai_reflection(&inner, &entry_id)
                .await
                .map_err(to_py_err)?;
            Ok(PyAiReflection::from(reflection))
        })
    }

    /// Get the AI reflection for a mood entry, once generated (`None` if not ready yet).
    fn get_reflection<'py>(
        &self,
        py: Python<'py>,
        entry_id: String,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let reflection = mood::get_ai_reflection(&inner, &entry_id)
                .await
                .map_err(to_py_err)?;
            Ok(reflection.map(PyAiReflection::from))
        })
    }
}

use echomirror_core::social;
use pyo3::prelude::*;
use pyo3::types::PyAny;

use crate::client::PyEchoMirrorClient;
use crate::errors::to_py_err;
use crate::types::{PyGlobalFeedEntry, PyLeaderboardEntry};

/// Global feed and leaderboard.
///
/// ```python
/// social = SocialClient(client)
/// feed = await social.get_global_feed(limit=20)
/// ```
#[pyclass(name = "SocialClient")]
#[derive(Clone)]
pub struct PySocialClient {
    client: PyEchoMirrorClient,
}

#[pymethods]
impl PySocialClient {
    #[new]
    pub fn new(client: PyEchoMirrorClient) -> Self {
        Self { client }
    }

    /// Get the global mood feed — anonymized entries from across the EchoMirror network.
    #[pyo3(signature = (limit=50))]
    fn get_global_feed<'py>(&self, py: Python<'py>, limit: u32) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let entries = social::get_global_feed(&inner, limit)
                .await
                .map_err(to_py_err)?;
            Ok(entries
                .into_iter()
                .map(PyGlobalFeedEntry::from)
                .collect::<Vec<_>>())
        })
    }

    /// Get the weekly leaderboard.
    #[pyo3(signature = (limit=100))]
    fn get_leaderboard<'py>(&self, py: Python<'py>, limit: u32) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let entries = social::get_leaderboard(&inner, limit)
                .await
                .map_err(to_py_err)?;
            Ok(entries
                .into_iter()
                .map(PyLeaderboardEntry::from)
                .collect::<Vec<_>>())
        })
    }
}

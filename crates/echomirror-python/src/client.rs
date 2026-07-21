use std::time::Duration;

use echomirror_core::config::StellarNetwork as CoreNetwork;
use echomirror_core::{EchoMirrorClient as CoreClient, EchoMirrorConfig as CoreConfig};
use pyo3::prelude::*;
use pyo3::types::PyAny;

use crate::errors::to_py_err;

/// Stellar network to connect to.
#[pyclass(name = "StellarNetwork", eq, eq_int)]
#[derive(Clone, Copy, PartialEq)]
pub enum PyStellarNetwork {
    Mainnet,
    Testnet,
}

impl From<PyStellarNetwork> for CoreNetwork {
    fn from(n: PyStellarNetwork) -> Self {
        match n {
            PyStellarNetwork::Mainnet => CoreNetwork::Mainnet,
            PyStellarNetwork::Testnet => CoreNetwork::Testnet,
        }
    }
}

impl From<CoreNetwork> for PyStellarNetwork {
    fn from(n: CoreNetwork) -> Self {
        match n {
            CoreNetwork::Mainnet => PyStellarNetwork::Mainnet,
            CoreNetwork::Testnet => PyStellarNetwork::Testnet,
        }
    }
}

/// Low-level API client shared by `MoodClient`, `StellarClient`, and `SocialClient`.
///
/// Most users should reach for the `EchoMirror` convenience class instead, which
/// constructs one of these plus all three sub-clients together.
#[pyclass(name = "EchoMirrorClient")]
#[derive(Clone)]
pub struct PyEchoMirrorClient {
    pub(crate) inner: CoreClient,
}

#[pymethods]
impl PyEchoMirrorClient {
    #[new]
    #[pyo3(signature = (api_key, base_url=None, network=PyStellarNetwork::Mainnet, timeout_secs=10, horizon_url=None, friendbot_url=None))]
    pub fn new(
        api_key: String,
        base_url: Option<String>,
        network: PyStellarNetwork,
        timeout_secs: u64,
        horizon_url: Option<String>,
        friendbot_url: Option<String>,
    ) -> PyResult<Self> {
        let mut config = CoreConfig::new(api_key);
        config.network = network.into();
        if let Some(url) = base_url {
            config = config.with_base_url(url);
        }
        config = config.with_timeout(Duration::from_secs(timeout_secs));
        if let Some(url) = horizon_url {
            config = config.with_horizon_url(url);
        }
        if let Some(url) = friendbot_url {
            config = config.with_friendbot_url(url);
        }

        let inner = CoreClient::new(config).map_err(to_py_err)?;
        Ok(Self { inner })
    }

    /// Set (or clear, with `None`) the bearer auth token used for authenticated requests.
    #[pyo3(signature = (token=None))]
    pub fn set_auth_token<'py>(
        &self,
        py: Python<'py>,
        token: Option<String>,
    ) -> PyResult<Bound<'py, PyAny>> {
        let client = self.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            client.set_auth_token(token).await;
            Ok(())
        })
    }

    #[getter]
    fn network(&self) -> PyStellarNetwork {
        self.inner.config().network.into()
    }

    fn __repr__(&self) -> String {
        format!(
            "EchoMirrorClient(network={:?})",
            self.inner.config().network
        )
    }
}

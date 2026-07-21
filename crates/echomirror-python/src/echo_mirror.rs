use pyo3::prelude::*;
use pyo3::types::PyAny;

use crate::client::{PyEchoMirrorClient, PyStellarNetwork};
use crate::mood::PyMoodClient;
use crate::social::PySocialClient;
use crate::stellar::PyStellarClient;

/// Main entry point for the EchoMirror SDK — bundles a shared `EchoMirrorClient`
/// with `mood`, `stellar`, and `social` sub-clients, mirroring the ergonomics of
/// the Flutter (`EchoMirror.instance`) and JS SDKs.
///
/// ```python
/// app = EchoMirror(api_key="your_api_key", network=StellarNetwork.Testnet)
/// entry = await app.mood.log(score=8, note="Great day", tags=["work"])
/// balance = await app.stellar.get_balance(public_key)
/// feed = await app.social.get_global_feed()
/// ```
#[pyclass(name = "EchoMirror")]
pub struct PyEchoMirror {
    #[pyo3(get)]
    pub mood: Py<PyMoodClient>,
    #[pyo3(get)]
    pub stellar: Py<PyStellarClient>,
    #[pyo3(get)]
    pub social: Py<PySocialClient>,
    client: PyEchoMirrorClient,
}

#[pymethods]
impl PyEchoMirror {
    #[new]
    #[pyo3(signature = (api_key, base_url=None, network=PyStellarNetwork::Mainnet, timeout_secs=10, horizon_url=None, friendbot_url=None))]
    #[allow(clippy::too_many_arguments)]
    fn new(
        py: Python<'_>,
        api_key: String,
        base_url: Option<String>,
        network: PyStellarNetwork,
        timeout_secs: u64,
        horizon_url: Option<String>,
        friendbot_url: Option<String>,
    ) -> PyResult<Self> {
        let client = PyEchoMirrorClient::new(
            api_key,
            base_url,
            network,
            timeout_secs,
            horizon_url,
            friendbot_url,
        )?;
        let mood = Py::new(py, PyMoodClient::new(client.clone()))?;
        let stellar = Py::new(py, PyStellarClient::new(client.clone()))?;
        let social = Py::new(py, PySocialClient::new(client.clone()))?;
        Ok(Self {
            mood,
            stellar,
            social,
            client,
        })
    }

    /// Set the auth token used by all three sub-clients for authenticated calls.
    fn set_auth_token<'py>(
        &self,
        py: Python<'py>,
        token: Option<String>,
    ) -> PyResult<Bound<'py, PyAny>> {
        self.client.set_auth_token(py, token)
    }

    #[getter]
    fn client(&self) -> PyEchoMirrorClient {
        self.client.clone()
    }
}

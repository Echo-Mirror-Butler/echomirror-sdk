use echomirror_stellar as stellar;
use pyo3::prelude::*;
use pyo3::types::PyAny;

use crate::client::PyEchoMirrorClient;
use crate::errors::to_py_err;
use crate::types::{
    PyStellarBalance, PyStellarTransaction, PyTransactionHistoryPage, PyUnsignedTransaction,
};

/// Stellar balance lookups, ECHO transfers, transaction history, and testnet funding.
///
/// ```python
/// stellar = StellarClient(client)
/// balance = await stellar.get_balance(public_key)
/// ```
#[pyclass(name = "StellarClient")]
#[derive(Clone)]
pub struct PyStellarClient {
    client: PyEchoMirrorClient,
}

#[pymethods]
impl PyStellarClient {
    #[new]
    pub fn new(client: PyEchoMirrorClient) -> Self {
        Self { client }
    }

    /// Get the XLM and ECHO token balance for a Stellar public key.
    fn get_balance<'py>(&self, py: Python<'py>, public_key: String) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let balance = stellar::get_balance(&inner, &public_key)
                .await
                .map_err(to_py_err)?;
            Ok(PyStellarBalance::from(balance))
        })
    }

    /// Build an unsigned ECHO transfer. Sign the returned `xdr` (e.g. with a
    /// wallet or a secret key), then pass it to `submit_transaction`.
    #[pyo3(signature = (from_address, to_address, amount, memo=None))]
    fn build_transfer<'py>(
        &self,
        py: Python<'py>,
        from_address: String,
        to_address: String,
        amount: f64,
        memo: Option<String>,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let params = stellar::EchoTransferParams {
                from: from_address,
                to: to_address,
                amount,
                memo,
            };
            let unsigned = stellar::build_echo_transfer(&inner, params)
                .await
                .map_err(to_py_err)?;
            Ok(PyUnsignedTransaction::from(unsigned))
        })
    }

    /// Submit a pre-signed XDR transaction envelope.
    fn submit_transaction<'py>(
        &self,
        py: Python<'py>,
        signed_xdr: String,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let tx = stellar::submit_transaction(&inner, &signed_xdr)
                .await
                .map_err(to_py_err)?;
            Ok(PyStellarTransaction::from(tx))
        })
    }

    /// Get paginated Stellar transaction history for a public key.
    #[pyo3(signature = (public_key, limit=20, cursor=None))]
    fn get_transaction_history<'py>(
        &self,
        py: Python<'py>,
        public_key: String,
        limit: u32,
        cursor: Option<String>,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let page =
                stellar::get_transaction_history(&inner, &public_key, limit, cursor.as_deref())
                    .await
                    .map_err(to_py_err)?;
            Ok(PyTransactionHistoryPage {
                transactions: page.transactions.into_iter().map(Into::into).collect(),
                cursor: page.cursor,
            })
        })
    }

    /// Fund a testnet account using Stellar Friendbot (gives 10,000 XLM).
    /// Raises `ConfigError` if the client is configured for mainnet.
    fn fund_testnet_account<'py>(
        &self,
        py: Python<'py>,
        public_key: String,
    ) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.client.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            stellar::fund_testnet_account(&inner, &public_key)
                .await
                .map_err(to_py_err)?;
            Ok(())
        })
    }
}

//! Reuses the scriptable Horizon stand-in and fixtures from the integration
//! tests so the end-to-end benchmark exercises the exact same mock server
//! (`tests/common/horizon_fixture.rs`) the correctness tests already trust,
//! instead of a second bespoke mock that could drift from it.
#![allow(dead_code)]

#[path = "../tests/common/mod.rs"]
pub mod common;

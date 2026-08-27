"""Pytest configuration for the EchoMirror Python contract-test runner.

Reads the shared ``contract-spec.json`` and wires up fixtures that the
``test_contract.py`` tests consume. Follows the same conventions the
Rust / JS / Flutter / Swift runners already establish:

* When ``ECHOMIRROR_CONTRACT_SPEC`` is set (as in CI), a missing spec file or
  an unreachable fixture server is a **hard failure** — tests cannot vacuously
  pass by silently skipping.
* When ``ECHOMIRROR_CONTRACT_SPEC`` is *not* set (normal local test run
  without the docker-compose fixture), all contract tests are skipped so the
  regular ``pytest`` invocation stays green.

Environment variables:

    ECHOMIRROR_CONTRACT_SPEC        Path to contract-spec.json (required in CI)
    ECHOMIRROR_CONTRACT_API_BASE    Default: http://127.0.0.1:18080
    ECHOMIRROR_CONTRACT_HORIZON_BASE Default: http://127.0.0.1:18081
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

import pytest


# ---------------------------------------------------------------------------
# Env / spec loading
# ---------------------------------------------------------------------------

_SPEC_PATH = os.environ.get("ECHOMIRROR_CONTRACT_SPEC")
_API_BASE = os.environ.get("ECHOMIRROR_CONTRACT_API_BASE", "http://127.0.0.1:18080")
_HORIZON_BASE = os.environ.get("ECHOMIRROR_CONTRACT_HORIZON_BASE", "http://127.0.0.1:18081")

# When the spec env var is present we are running in contract mode.  Any
# configuration or connectivity problem is a hard failure.
_CONTRACT_MODE = _SPEC_PATH is not None

_SKIP_REASON = (
    "ECHOMIRROR_CONTRACT_SPEC not set — contract tests require the shared fixture "
    "(docker compose -f contract-tests/docker-compose.yml up -d --build)"
)


def _load_spec() -> dict[str, Any]:
    """Load and return the parsed contract spec."""
    if not _SPEC_PATH:
        # Not in contract mode — callers should have already skipped.
        return {}

    try:
        with open(_SPEC_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        pytest.fail(
            f"ECHOMIRROR_CONTRACT_SPEC is set to {_SPEC_PATH!r} but the file "
            "does not exist. Ensure the path is correct and the repo is checked out."
        )
    except json.JSONDecodeError as exc:
        pytest.fail(f"Failed to parse {_SPEC_PATH!r}: {exc}")


def _check_fixture_reachable() -> None:
    """Hard-fail (not skip) if the fixture isn't responding."""
    for label, url in [
        ("fixture-api", f"{_API_BASE}/mood/streak"),
        (
            "fixture-horizon",
            f"{_HORIZON_BASE}/accounts/"
            "GDKUJHNOCQ6NOFJCSPE5IZMFFRZ6U4VO3EEFJQKJSDK5B4VZTH4XKSKD",
        ),
    ]:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                resp.read()
        except Exception as exc:  # noqa: BLE001
            pytest.fail(
                f"{label} unreachable at {url}: {exc}\n"
                "Start the fixture with:\n"
                "  docker compose -f contract-tests/docker-compose.yml up -d --build"
            )


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def contract_mode() -> bool:
    """True when running in CI contract mode (ECHOMIRROR_CONTRACT_SPEC is set)."""
    return _CONTRACT_MODE


@pytest.fixture(scope="session")
def spec() -> dict[str, Any]:
    """The full parsed contract-spec.json (session-scoped — loaded once)."""
    if not _CONTRACT_MODE:
        pytest.skip(_SKIP_REASON)
    _check_fixture_reachable()
    return _load_spec()


@pytest.fixture(scope="session")
def fixture_config(spec: dict[str, Any]) -> dict[str, Any]:
    """The ``fixture`` section of the spec (users, api_key, network)."""
    return spec["fixture"]


@pytest.fixture(scope="session")
def api_base() -> str:
    return _API_BASE


@pytest.fixture(scope="session")
def horizon_base() -> str:
    return _HORIZON_BASE


def ops_for(spec: dict[str, Any], binding: str = "python") -> list[dict[str, Any]]:
    """Return only the operations that include ``binding`` in their binding list."""
    return [
        op
        for op in spec.get("operations", [])
        if binding in op.get("binding", [])
    ]


def op_by_id(spec: dict[str, Any], op_id: str) -> dict[str, Any]:
    """Look up a single operation by its ``id`` field. Raises if not found."""
    for op in spec.get("operations", []):
        if op["id"] == op_id:
            return op
    pytest.fail(f"Operation {op_id!r} not found in contract spec")


# ---------------------------------------------------------------------------
# Helpers re-exported for test modules
# ---------------------------------------------------------------------------


def navigate(obj: Any, path: str) -> Any:
    """Resolve a dotted path like ``entries.0.score`` into ``obj``."""
    for part in path.split("."):
        if isinstance(obj, dict):
            obj = obj[part]
        elif isinstance(obj, (list, tuple)):
            obj = obj[int(part)]
        else:
            raise KeyError(f"Cannot navigate into {type(obj).__name__} with key {part!r}")
    return obj

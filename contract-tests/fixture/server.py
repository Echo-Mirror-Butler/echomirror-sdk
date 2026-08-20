"""EchoMirror contract-test fixture.

Reads ``contract-spec.json`` and serves the exact canned responses declared
there. One process serves either the EchoMirror API routes or the Horizon
routes depending on the ``FIXTURE_ROLE`` env var (``api`` | ``horizon``),
so every binding tested by ``contract-tests`` talks to the *same* spec file
instead of its own bespoke mocks.

Uses only the Python standard library so it runs anywhere (docker-compose in
CI, plain ``python fixture/server.py`` locally).
"""
from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROLE = os.environ.get("FIXTURE_ROLE", "api")
SPEC_PATH = os.environ.get(
    "FIXTURE_SPEC_PATH",
    os.path.join(os.path.dirname(__file__), "..", "contract-spec.json"),
)
PORT = int(os.environ.get("FIXTURE_PORT", "18080" if ROLE == "api" else "18081"))


class FixtureHandler(BaseHTTPRequestHandler):
    """Serve canned responses for every operation whose ``target`` matches ours."""

    def _handle(self, method: str) -> None:
        parsed = urlparse(self.path)
        key = f"{method} {parsed.path}"
        if parsed.query:
            key = f"{method} {parsed.path}?{parsed.query}"

        op = self.server.routes.get(key)  # type: ignore[attr-defined]

        if op is not None:
            status, body = op
        else:
            # Unknown route: help the runner author with a 404 listing.
            status = 404
            body = {
                "message": f"no fixture route for {key}",
                "known_routes": sorted(self.server.routes.keys()),  # type: ignore[attr-defined]
            }

        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle("DELETE")

    def log_message(self, fmt: str, *args) -> None:  # silence access logging
        pass


def load_spec() -> dict:
    with open(SPEC_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def build_routes(spec: dict) -> dict[str, tuple[int, dict]]:
    routes: dict[str, tuple[int, dict]] = {}
    for op in spec.get("operations", []):
        if op.get("target") != ROLE:
            continue
        method = op["method"]
        path = op["path"]
        status = op["response"]["status"]
        body = op["response"]["body"]
        routes[f"{method} {path}"] = (status, body)
    return routes


def main() -> None:
    spec = load_spec()
    routes = build_routes(spec)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), FixtureHandler)
    server.routes = routes  # type: ignore[attr-defined]
    print(
        f"fixture[{ROLE}] serving {len(routes)} routes on http://0.0.0.0:{PORT}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
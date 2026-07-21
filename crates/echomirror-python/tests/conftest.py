"""Shared pytest fixtures.

Since the SDK makes real HTTP calls from Rust (via `reqwest`), Python-level
mocking (`unittest.mock`) can't intercept them. Instead we spin up a tiny local
HTTP server per-test and point `base_url` at it, then queue canned JSON
responses per (method, path).
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import pytest


class _Handler(BaseHTTPRequestHandler):
    def _handle(self, method: str) -> None:
        parsed = urlparse(self.path)
        route = self.server.routes.get((method, parsed.path))  # type: ignore[attr-defined]

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        self.server.received.append(  # type: ignore[attr-defined]
            {
                "method": method,
                "path": self.path,
                "headers": dict(self.headers),
                "body": raw.decode() if raw else None,
            }
        )

        if route is None:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"message": "not found"}).encode())
            return

        status, body, headers = route
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if status != 204:
            self.wfile.write(json.dumps(body).encode())

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle("DELETE")

    def log_message(self, fmt: str, *args) -> None:  # silence default access logging
        pass


@pytest.fixture
def mock_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.routes = {}  # type: ignore[attr-defined]
    server.received = []  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join()


@pytest.fixture
def base_url(mock_server) -> str:
    return f"http://127.0.0.1:{mock_server.server_port}"


def route(server, method: str, path: str, status: int, body=None, headers=None) -> None:
    """Queue a canned response for `method path` on the mock server."""
    server.routes[(method, path)] = (status, body, headers)

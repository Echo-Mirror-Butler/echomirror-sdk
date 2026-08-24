#!/bin/sh
# scripts/bootstrap.sh — one-command local dev setup for the EchoMirror SDK.
#
# POSIX sh, targets macOS and Linux. Windows contributors: run this from
# WSL — the rest of this repo's tooling (cargo, flutter, npm) already
# assumes a Unix-like shell.
#
# What it does:
#   1. Checks for Node >=18, Rust (stable), Flutter (stable), Python >=3.9.
#      Missing toolchains are warnings, not failures — not every
#      contributor touches every language.
#   2. Installs wasm-pack (needs Rust) and maturin (needs Rust + Python)
#      if not already present.
#   3. Installs/builds each ecosystem present: npm install, cargo build
#      --workspace, flutter pub get (packages/flutter), and a venv +
#      `maturin develop` dev install for crates/echomirror-python (a
#      native PyO3 extension, so it also needs Rust).
#   4. Runs a fast self-check per ecosystem and prints a pass/fail/skipped
#      summary.
#
# Usage: ./scripts/bootstrap.sh

set -u

SCRIPT_DIR=$(dirname "$0")
ROOT_DIR=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
cd "$ROOT_DIR" || exit 1

NODE_MIN_MAJOR=18
PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=9
PYTHON_PKG_DIR="crates/echomirror-python"

HAVE_NODE=no
HAVE_RUST=no
HAVE_FLUTTER=no
HAVE_PYTHON=no
PYTHON_BIN=""

JS_STATUS=skip
RUST_STATUS=skip
FLUTTER_STATUS=skip
PYTHON_STATUS=skip

info() { printf '    %s\n' "$*"; }
warn() { printf '    [warn] %s\n' "$*"; }
ok()   { printf '    [ok] %s\n' "$*"; }
err()  { printf '    [error] %s\n' "$*" >&2; }
step() { printf '\n==> %s\n' "$*"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

check_node() {
  step "Node.js"
  if ! have_cmd node; then
    warn "node not found — skipping JS setup (needed for packages/js/*)"
    return
  fi
  node_version=$(node --version | sed 's/^v//')
  node_major=$(printf '%s' "$node_version" | cut -d. -f1)
  if [ "$node_major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    ok "node $node_version"
    HAVE_NODE=yes
  else
    warn "node $node_version found, but >=${NODE_MIN_MAJOR} is required — skipping JS setup"
  fi
}

check_rust() {
  step "Rust"
  if ! have_cmd cargo; then
    warn "cargo not found — skipping Rust workspace setup"
    return
  fi
  rust_version=$(rustc --version 2>/dev/null | awk '{print $2}')
  ok "rustc $rust_version"
  if have_cmd rustup; then
    active_toolchain=$(rustup show active-toolchain 2>/dev/null | awk '{print $1}')
    case "$active_toolchain" in
      *stable*|"") : ;;
      *) warn "active Rust toolchain is '$active_toolchain', not stable — continuing anyway" ;;
    esac
  fi
  HAVE_RUST=yes
}

check_flutter() {
  step "Flutter"
  if ! have_cmd flutter; then
    warn "flutter not found — skipping Flutter package setup (packages/flutter)"
    return
  fi
  version_line=$(flutter --version 2>/dev/null | head -n1)
  flutter_version=$(printf '%s' "$version_line" | awk '{print $2}')
  channel=$(printf '%s' "$version_line" | sed -n 's/.*channel \([a-zA-Z]*\).*/\1/p')
  ok "flutter ${flutter_version:-unknown} (channel: ${channel:-unknown})"
  if [ -n "$channel" ] && [ "$channel" != "stable" ]; then
    warn "Flutter channel is '$channel', not 'stable' — continuing anyway"
  fi
  HAVE_FLUTTER=yes
}

check_python() {
  step "Python"
  py=""
  if have_cmd python3; then
    py=python3
  elif have_cmd python; then
    py=python
  fi
  if [ -z "$py" ]; then
    warn "python3 not found — skipping Python setup ($PYTHON_PKG_DIR)"
    return
  fi
  py_version=$("$py" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null)
  py_major=$(printf '%s' "$py_version" | cut -d. -f1)
  py_minor=$(printf '%s' "$py_version" | cut -d. -f2)
  if { [ "$py_major" -gt "$PYTHON_MIN_MAJOR" ]; } 2>/dev/null || { [ "$py_major" -eq "$PYTHON_MIN_MAJOR" ] && [ "$py_minor" -ge "$PYTHON_MIN_MINOR" ]; } 2>/dev/null; then
    ok "python $py_version ($py)"
    HAVE_PYTHON=yes
    PYTHON_BIN=$py
  else
    warn "python $py_version found, but >=${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR} is required — skipping Python setup"
  fi
}

install_wasm_pack() {
  [ "$HAVE_RUST" = yes ] || return 0
  step "wasm-pack"
  if have_cmd wasm-pack; then
    ok "already installed ($(wasm-pack --version 2>/dev/null))"
    return 0
  fi
  info "installing wasm-pack (needed for @echomirror/wasm / crates/echomirror-wasm)"
  if cargo install wasm-pack >/dev/null 2>&1; then
    ok "wasm-pack installed"
  else
    warn "failed to install wasm-pack — install it manually if you plan to work on @echomirror/wasm"
  fi
}

install_maturin() {
  [ "$HAVE_RUST" = yes ] && [ "$HAVE_PYTHON" = yes ] || return 0
  step "maturin"
  if have_cmd maturin; then
    ok "already installed ($(maturin --version 2>/dev/null))"
    return 0
  fi
  info "installing maturin (needed for $PYTHON_PKG_DIR)"
  if "$PYTHON_BIN" -m pip install --user --quiet maturin >/dev/null 2>&1; then
    ok "maturin installed"
  else
    warn "failed to install maturin — install it manually if you plan to work on $PYTHON_PKG_DIR"
  fi
}

setup_js() {
  [ "$HAVE_NODE" = yes ] || return 0
  step "JS workspace setup"
  info "npm install"
  if ! npm install; then
    err "npm install failed"
    JS_STATUS=fail
    return 0
  fi
  info "npm run typecheck (self-check)"
  if npm run typecheck; then
    JS_STATUS=pass
  else
    JS_STATUS=fail
  fi
}

setup_rust() {
  [ "$HAVE_RUST" = yes ] || return 0
  step "Rust workspace setup"
  info "cargo build --workspace"
  if ! cargo build --workspace; then
    err "cargo build --workspace failed"
    RUST_STATUS=fail
    return 0
  fi
  info "cargo check --workspace (self-check)"
  if cargo check --workspace; then
    RUST_STATUS=pass
  else
    RUST_STATUS=fail
  fi
}

setup_flutter() {
  [ "$HAVE_FLUTTER" = yes ] || return 0
  step "Flutter package setup (packages/flutter)"
  if [ ! -d packages/flutter ]; then
    warn "packages/flutter not found — skipping"
    return 0
  fi
  info "flutter pub get"
  if ! (cd packages/flutter && flutter pub get); then
    err "flutter pub get failed"
    FLUTTER_STATUS=fail
    return 0
  fi
  info "flutter analyze (self-check)"
  if (cd packages/flutter && flutter analyze); then
    FLUTTER_STATUS=pass
  else
    FLUTTER_STATUS=fail
  fi
}

setup_python() {
  [ "$HAVE_PYTHON" = yes ] || return 0
  step "Python package setup ($PYTHON_PKG_DIR)"
  if [ ! -d "$PYTHON_PKG_DIR" ]; then
    warn "$PYTHON_PKG_DIR doesn't exist yet — nothing to install, skipping"
    return 0
  fi
  if [ "$HAVE_RUST" != yes ]; then
    warn "$PYTHON_PKG_DIR is a native (PyO3) extension and needs a Rust toolchain to build — skipping"
    return 0
  fi

  venv_dir="$PYTHON_PKG_DIR/.venv"
  if [ ! -d "$venv_dir" ]; then
    info "creating virtualenv at $venv_dir (maturin develop requires one)"
    if ! "$PYTHON_BIN" -m venv "$venv_dir"; then
      err "failed to create virtualenv"
      PYTHON_STATUS=fail
      return 0
    fi
  fi

  set +u
  # shellcheck disable=SC1091
  . "$venv_dir/bin/activate"
  set -u

  info "python -m pip install --upgrade maturin"
  if ! python -m pip install --quiet --upgrade maturin; then
    err "failed to install maturin into virtualenv"
    PYTHON_STATUS=fail
    deactivate 2>/dev/null || true
    return 0
  fi

  info "maturin develop --extras test (dev install, builds the native extension)"
  if ! (cd "$PYTHON_PKG_DIR" && maturin develop --extras test); then
    err "maturin develop failed"
    PYTHON_STATUS=fail
    deactivate 2>/dev/null || true
    return 0
  fi

  info "pytest (self-check)"
  if (cd "$PYTHON_PKG_DIR" && python -m pytest -q); then
    PYTHON_STATUS=pass
  else
    PYTHON_STATUS=fail
  fi
  deactivate 2>/dev/null || true
}

print_status_line() {
  name=$1
  have=$2
  status=$3
  if [ "$have" = no ]; then
    printf '  %-8s SKIPPED (toolchain not found)\n' "$name"
    return
  fi
  case "$status" in
    pass) printf '  %-8s OK\n' "$name" ;;
    fail) printf '  %-8s FAILED\n' "$name" ;;
    skip) printf '  %-8s SKIPPED\n' "$name" ;;
  esac
}

print_summary() {
  step "Bootstrap summary"
  print_status_line "JS" "$HAVE_NODE" "$JS_STATUS"
  print_status_line "Rust" "$HAVE_RUST" "$RUST_STATUS"
  print_status_line "Flutter" "$HAVE_FLUTTER" "$FLUTTER_STATUS"
  print_status_line "Python" "$HAVE_PYTHON" "$PYTHON_STATUS"
  echo
  case "$JS_STATUS $RUST_STATUS $FLUTTER_STATUS $PYTHON_STATUS" in
    *fail*)
      echo "One or more ecosystems failed their self-check — see output above."
      return 1
      ;;
    *)
      echo "Done. Ecosystems without a detected toolchain were skipped — install the"
      echo "missing toolchain and re-run this script if you need to work on them."
      return 0
      ;;
  esac
}

main() {
  printf 'EchoMirror SDK bootstrap — repo root: %s\n' "$ROOT_DIR"

  check_node
  check_rust
  check_flutter
  check_python

  install_wasm_pack
  install_maturin

  setup_js
  setup_rust
  setup_flutter
  setup_python

  print_summary
}

main
exit $?

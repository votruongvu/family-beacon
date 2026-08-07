#!/usr/bin/env bash
#
# Everything the project checks about itself, in one command.
#
#   tool/verify.sh              run every stage
#   tool/verify.sh --fast       skip the stages that need the emulator suite
#
# Continuous integration runs exactly these stages, so a green run here means a
# green run there. That is the point: the pipeline calls this script rather than
# maintaining a second, drifting copy of the same list.

set -euo pipefail

cd "$(dirname "$0")/.."

FAST=false
[[ "${1:-}" == "--fast" ]] && FAST=true

failed=()
passed=()

# Runs one stage, remembers the outcome, and keeps going.
#
# Stopping at the first failure would mean finding one problem per run. A
# developer would rather see all of them at once.
stage() {
  local name="$1"
  shift

  printf '\n\033[1m▸ %s\033[0m\n' "$name"

  if "$@"; then
    passed+=("$name")
  else
    failed+=("$name")
    printf '\033[31m✖ %s failed\033[0m\n' "$name"
  fi
}

stage "format"              dart format --set-exit-if-changed lib test tool integration_test
stage "analyze"             flutter analyze
stage "architecture"        dart run tool/check_architecture.dart
stage "unit tests"          dart test test/unit
stage "flutter tests"       flutter test
stage "backend typecheck"   npm --prefix functions run typecheck
stage "backend tests"       npm --prefix functions test

if [[ "$FAST" == false ]]; then
  # These start and stop an emulator suite of their own, so they need Java and
  # a free set of ports.
  stage "security rules"    npm run test:rules
  stage "callables"         npm run test:callables
else
  printf '\n\033[33m⚠ skipped: security rules, callables (--fast)\033[0m\n'
fi

printf '\n\033[1m── summary ──\033[0m\n'
for name in "${passed[@]}"; do printf '\033[32m✔\033[0m %s\n' "$name"; done
for name in "${failed[@]:-}"; do [[ -n "$name" ]] && printf '\033[31m✖\033[0m %s\n' "$name"; done

if [[ ${#failed[@]} -gt 0 ]]; then
  printf '\n\033[31m%d stage(s) failed.\033[0m\n' "${#failed[@]}"
  exit 1
fi

printf '\n\033[32mAll stages passed.\033[0m\n'

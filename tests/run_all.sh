#!/usr/bin/env bash
# PhysEd Pro v3.0 — full test run (Node unit tests + Python oracle cross-check)
set -e
cd "$(dirname "$0")/.."
echo "=== 1/3 Node unit tests ==="
node tests/run_tests.js
echo
echo "=== 2/3 JS engine output ==="
node tests/cross_check.js > tests/js_output.json
echo "wrote tests/js_output.json"
echo
echo "=== 3/3 Python oracle cross-check ==="
python3 tests/comment_oracle.py
echo

# Optional headless browser-ish tests (need: npm i jsdom fake-indexeddb,
# then set NODE_PATH to that node_modules)
if node -e "require('jsdom'); require('fake-indexeddb')" 2>/dev/null; then
  echo "=== extra: jsdom smoke test (full app boot + UI flows) ==="
  node tests/smoke_jsdom.js
  echo
  echo "=== extra: v2 -> v3 migration test ==="
  node tests/migration_test.js
  echo
  echo "=== extra: tests.html executes headlessly ==="
  node tests/run_tests_html.js
else
  echo "(skipping jsdom smoke/migration tests — npm i jsdom fake-indexeddb to enable)"
fi
echo
echo "ALL TEST SUITES PASSED. (For the in-browser suite, open tests.html via a local server.)"

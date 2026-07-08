#!/usr/bin/env bash
# Regression test for the code-scanning alert fixed in #106:
# actions/missing-workflow-permissions (ci.yml had no `permissions:` block,
# leaving its GITHUB_TOKEN with the broad, implicit default permissions).
# Every workflow file must declare an explicit top-level `permissions:` key
# so a future workflow can't silently reintroduce the same over-broad default.
set -euo pipefail
IFS=$'\n\t'

ERRORS=0

for workflow in .github/workflows/*.yml; do
  if ! grep -qE '^permissions:' "${workflow}"; then
    echo "❌ ${workflow} does not declare a top-level 'permissions:' key."
    ((ERRORS = ERRORS + 1))
  fi
done

if [[ "${ERRORS}" -gt 0 ]]; then
  echo "❌ ${ERRORS} workflow(s) missing an explicit top-level permissions block, please check the output above for more details."
  exit 1
else
  echo "🎉 All workflows declare an explicit top-level permissions block."
fi

#!/usr/bin/env bash
# Regression test for the bug fixed by scripts/fix-legacy-active-effect-mode.mjs:
# compendium pack YAML (src/packs/**) shipped ~90 ActiveEffect `changes[]`
# entries using the legacy Foundry V13 numeric `mode` field with no V14
# string `type` field. `system.*`-keyed changes (e.g. system.stats.int.value)
# bypass CPRMod's legacy-mode fallback and are applied directly by Foundry
# core, which does not handle a type-less `mode` -- this made stat increments
# behave like string concatenation instead of numeric addition.
set -euo pipefail
IFS=$'\n\t'

matches=$(grep -rlE '^\s+mode:\s*[0-9]' src/packs || true)

if [[ -n "${matches}" ]]; then
  echo "❌ Found legacy ActiveEffect 'mode:' fields (should be a string 'type:') in:"
  echo "${matches}"
  echo "❌ Convert these with scripts/fix-legacy-active-effect-mode.mjs (or by hand) before shipping."
  exit 1
else
  echo "🎉 No legacy ActiveEffect 'mode:' fields found in src/packs."
fi

#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Handlebars subexpressions cannot chain property access after a closing paren.
# Invalid: {{#unless (cprCompare (cprGetProp foo bar).length ">" 0)}}
# Valid:   {{#if (cprIsEmpty (cprGetProp foo bar))}}

ERRORS=0
HBS_LOCATION="src/templates"

if [[ ! -d "${HBS_LOCATION}" ]]; then
  echo "❌ Unable to find ${HBS_LOCATION}"
  exit 1
fi

while IFS= read -r -d '' file; do
  if grep -nE '\)\.[a-zA-Z_]' "${file}" >/tmp/hbs-subexpr-matches.txt 2>/dev/null; then
    echo "❌ ${file} chains a property after a subexpression (invalid Handlebars syntax):"
    sed 's/^/    /' /tmp/hbs-subexpr-matches.txt
    ((ERRORS += 1)) || true
  fi
done < <(find "${HBS_LOCATION}" -type f -name '*.hbs' -print0)

rm -f /tmp/hbs-subexpr-matches.txt

if [[ "${ERRORS}" -gt 0 ]]; then
  echo "❌ ${ERRORS} template(s) use invalid subexpression property chains."
  echo "   Use a helper (e.g. cprIsEmpty, cprSizeOf) instead of (helper ...).property."
  exit 1
fi

echo "🎉 All template subexpression syntax checks passed."

#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# This script is for uploading packages to the package registry manually.
#
# NOTE: This will only work from `v0.84.0` onwards
#       You will need to copy this script from the v0.89.0 tag to
#       run on earlier releases.
#
# It will:
#   1. Build the system.json
#   2. Build the system
#   3. Zip the system
#   4. Upload the system/zip to the package registry: "${REPO_URL}/${VERSION}/*"
#
# Process:
# 1. Create a Personal Access Token with API access (GitLab token if using GitLab Package
#    Registry, or configure `REPO_URL` / upload target for GitHub — see script body).
# 2. Export it as CI_JOB_TOKEN
#   * `export CI_JOB_TOKEN="your_token_here"`
# 3. Chekout the git tag you need to upload
#   * `git tag vX.X.X`
# 4. After checking out you may need to update npm
#   * `npm i`
# 4. Export the CI_COMMIT_TAG
#   * `export CI_COMMIT_TAG="vX.X.X"`
# 5. Run this script
#   * `./.github/workflows/pipeline_utils/local-publish.sh`
# 6. Check GitHub Releases for the uploaded files
#   * https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/releases
# 7. Repeat on all tags that need rebuilding
#
# To validate the upload:
#   * Open the Release on GitHub
#   * Download/Open the `system.json`
#   * Check the `version` key is correct
#   * Download the zip from the `download` key in the `system.json`
#
#   You could also take the `system.json` and install in Foundry
#
# A oneliner: export CI_COMMIT_TAG="v0.85.0" && git co "${CI_COMMIT_TAG}" && npm i && ./.github/workflows/pipeline_utils/local-publish.sh

# NOTE: DO NOT delete the "unused variables" here, they are used by the
#       build system!

export CI=1
export CI_COMMIT_TAG="${CI_COMMIT_TAG:-}"
export CI_API_V4_URL="https://gitlab.com/api/v4"
export CI_PROJECT_ID="22820629"

export SYSTEM_NAME="cyberpunk-red-core"
export SYSTEM_TITLE="Cyberpunk RED - CORE"
export SYSTEM_FILE="system.json"
export CHANGELOG_FILE="CHANGELOG.md"
export VERSION="${CI_COMMIT_TAG}"
export SYSTEM_VERSION="${CI_COMMIT_TAG}"

export PROJECT_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}"
export REPO_URL="${PROJECT_URL}/packages/generic/fvtt-${SYSTEM_NAME}"

export RELEASE_NAME="fvtt-${SYSTEM_NAME}-${VERSION}"
export ZIP_FILE="${RELEASE_NAME}.zip"

declare -a UPLOAD_FILES
export UPLOAD_FILES=(
  "${SYSTEM_FILE}"
  "${ZIP_FILE}"
)

# Build the system
if ! VERSION="${VERSION}" \
  REPO_URL="${REPO_URL}" \
  ZIP_FILE="${ZIP_FILE}" \
  npm run build; then
  echo "❌ Failed to build system using npm build"
  exit 1
else
  echo "✅ Built the system successfully!"
fi

# Copy the system.json so we can export it as an artifact
if ! cp "dist/${SYSTEM_FILE}" "${SYSTEM_FILE}"; then
  echo "❌ Failed to copy 'dist/${SYSTEM_FILE}'"
  exit 1
else
  echo "✅ Successfully copied 'dist/${SYSTEM_FILE}!"
fi

# Rename the dist dir so it's the correct name in the zip
if ! mv dist "${RELEASE_NAME}"; then
  echo "❌ Unable to rename 'dist/' to '${RELEASE_NAME}'"
  exit 1
else
  echo "✅ Moved 'dist/' '${RELEASE_NAME}'!"
fi

# Zip up the system directory to create the system artifact
if ! zip --quiet "${ZIP_FILE}" --recurse-paths "${RELEASE_NAME}"; then
  echo "❌ Unable to zip ${SYSTEM_NAME}"
  exit 1
else
  echo "✅ Successfully zipped ${SYSTEM_NAME}!"
fi

# Upload UPLOAD_FILES to generic repo
# Available at: https://gitlab.com/api/v4/projects/39692371/packages/generic/fvtt-cyberpunk-red-core/${version}/${file}.json

for file in "${UPLOAD_FILES[@]}"; do
  # Upload the file and grab the response from the api
  response=$(
    curl \
      --silent \
      --header "PRIVATE-TOKEN: ${CI_JOB_TOKEN}" \
      --upload-file "${file}" "${REPO_URL}/${VERSION}/${file}"
  )

  # Check the response
  if [[ "$(echo "${response}" | jq -r .message)" != "201 Created" ]]; then
    echo "❌ Uploading ${file} failed, please see the message below"
    echo "❌ ${response}"
    exit 1
  else
    echo "🎉 Uploaded ${file} sucesfully"
  fi
done

# Clean local dirs
rm -rf dist fvtt-cyberpunk-red-core-* system.json

#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${GITHUB_REPOSITORY:-}"
if [[ -z "${REPO_SLUG}" ]]; then
  origin_url="$(git remote get-url origin)"
  REPO_SLUG="$(printf '%s' "${origin_url}" | sed -E 's#(git@github.com:|https://github.com/)##; s#\\.git$##')"
fi

if [[ -z "${REPO_SLUG}" ]]; then
  echo "Cannot resolve repository slug. Set GITHUB_REPOSITORY=owner/repo."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login"
  exit 1
fi

DAILY_URL="${1:-${HUB_DAILY_ANCHOR_URL:-}}"
if [[ -z "${DAILY_URL}" ]]; then
  echo "Usage: bash scripts/setup_github_anchor_secrets.sh <daily-anchor-url>"
  echo "Example: bash scripts/setup_github_anchor_secrets.sh https://your-domain.com/api/graph/snapshots/anchor/daily"
  exit 1
fi

TOKEN_FILE=".keys/hub-daily-anchor-token.txt"
if [[ ! -f "${TOKEN_FILE}" ]]; then
  echo "Missing ${TOKEN_FILE}. Run local setup first."
  exit 1
fi

DAILY_TOKEN="$(cat "${TOKEN_FILE}")"
if [[ -z "${DAILY_TOKEN}" ]]; then
  echo "Daily token file is empty."
  exit 1
fi

echo "Setting repository secrets on ${REPO_SLUG} ..."
printf '%s' "${DAILY_URL}" | gh secret set HUB_DAILY_ANCHOR_URL -R "${REPO_SLUG}" -b-
printf '%s' "${DAILY_TOKEN}" | gh secret set HUB_DAILY_ANCHOR_TOKEN -R "${REPO_SLUG}" -b-
echo "Secrets updated: HUB_DAILY_ANCHOR_URL, HUB_DAILY_ANCHOR_TOKEN"

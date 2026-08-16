#!/usr/bin/env bash
#
# LinguaAI — Push from your local machine
#
# After unzipping LinguaAI-source-v1.1.0.zip:
#   cd LinguaAI-source-v1.1.0
#   bash push.sh
#
# This script will:
#   1. Ask for your GitHub username, repo name, and a FRESH PAT
#      (create one at https://github.com/settings/tokens/new — scopes: repo, workflow)
#   2. Initialize a fresh git repo
#   3. Commit all source
#   4. Push main + tag v1.1.0
#   5. Scrub the token from local config
#
# Your token is read with `read -s` — it is never echoed, never logged,
# never written to disk. After the push, the remote URL is rewritten
# to remove the token.

set -euo pipefail

echo "================================================"
echo "  LinguaAI — Push to GitHub"
echo "================================================"
echo ""
echo "Before continuing, make sure:"
echo "  1. You revoked the old token at https://github.com/settings/tokens"
echo "  2. You created a NEW token at https://github.com/settings/tokens/new"
echo "     with scopes: repo, workflow"
echo "  3. You created an EMPTY GitHub repo at https://github.com/new"
echo "     (do NOT add README / .gitignore / license)"
echo ""

read -r -p "GitHub username (or org): " GH_USER
read -r -p "Repo name (e.g. linguaai): " GH_REPO
read -r -s -p "Fresh GitHub PAT (input hidden): " GH_TOKEN
echo ""
echo ""

if [[ -z "$GH_USER" || -z "$GH_REPO" || -z "$GH_TOKEN" ]]; then
  echo "ERROR: All three values are required."
  exit 1
fi

# Initialize git
if [[ ! -d .git ]]; then
  git init
  git checkout -b main
fi

git add .
git -c user.name="LinguaAI Dev" -c user.email="dev@linguaai.local" commit -m "feat: LinguaAI v1.1.0 — native Android floating assistant + advanced web editor

- Web app (Next.js 16): advanced editor with writing goals, 7-dimension
  document scores, AI command box, 27 rewrite actions (tone, shorten,
  expand, simplify, translate to 12 languages), personal dictionary
- /api/grammar: robust LLM-powered analysis with offset validation
- /api/rewrite: 27 transformation actions
- Native Android APK: AccessibilityService + SYSTEM_ALERT_WINDOW floating
  assistant that works across WhatsApp, Gmail, Messages, Instagram,
  LinkedIn, Slack, Teams, Google Docs, and any app with editable text
- Chrome extension (Manifest V3): floating FAB + popup mini editor
- GitHub Actions workflow: builds web + APK + extension on push" 2>&1 | tail -3

# Add remote
REMOTE_URL="https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "→ Pushing main branch..."
git push -u origin main

echo "→ Pushing v1.1.0 tag (triggers release build)..."
git tag -f v1.1.0
git push -f origin v1.1.0

# Scrub token
git remote set-url origin "https://github.com/${GH_USER}/${GH_REPO}.git"
unset GH_TOKEN

echo ""
echo "================================================"
echo "  ✓ DONE"
echo "================================================"
echo ""
echo "Repo:    https://github.com/${GH_USER}/${GH_REPO}"
echo "Actions: https://github.com/${GH_USER}/${GH_REPO}/actions"
echo "Release: https://github.com/${GH_USER}/${GH_REPO}/releases/tag/v1.1.0"
echo ""
echo "The CI workflow will now:"
echo "  - lint + build the Next.js web app"
echo "  - build the Android APK"
echo "  - package the Chrome extension"
echo "  - create a GitHub Release with APK + extension attached"
echo ""
echo "Build time: ~5-10 minutes. Watch the Actions tab."
echo ""
echo "Token has been scrubbed from local git config."

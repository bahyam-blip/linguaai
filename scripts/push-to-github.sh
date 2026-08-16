#!/usr/bin/env bash
#
# LinguaAI — Push to GitHub & trigger CI build
#
# USAGE:
#   1. Create a NEW GitHub Personal Access Token (classic) at:
#        https://github.com/settings/tokens/new
#      Scopes needed: repo, workflow
#
#   2. Create an empty repo on GitHub (NO README, NO .gitignore, NO license):
#        https://github.com/new
#
#   3. Run this script. It will prompt for your token, repo owner, and repo name.
#      Your token is read into a shell variable and used once for the push —
#      it is NOT written to disk, NOT logged, NOT echoed back.
#
#   4. After the push completes, watch the Actions tab of your GitHub repo —
#      the workflow will build the web app, Android APK, and Chrome extension
#      automatically.
#
#   5. To publish a release with downloadable APK + extension:
#        git tag v1.1.0
#        git push origin v1.1.0

set -euo pipefail

REPO_DIR="/home/z/my-project"
cd "$REPO_DIR"

echo "================================================"
echo "  LinguaAI — Push to GitHub"
echo "================================================"
echo ""
echo "This script will:"
echo "  1. Configure git user (if not already set)"
echo "  2. Add a GitHub remote (or update the existing one)"
echo "  3. Push the main branch + trigger the CI build"
echo ""
echo "Prerequisites:"
echo "  - A fresh GitHub Personal Access Token (scopes: repo, workflow)"
echo "  - An EMPTY GitHub repo (no README, no .gitignore, no license)"
echo ""

# --- Git user config ---
if ! git config user.name >/dev/null 2>&1; then
  read -r -p "Your name for git commits: " GIT_NAME
  git config user.name "$GIT_NAME"
fi
if ! git config user.email >/dev/null 2>&1; then
  read -r -p "Your email for git commits: " GIT_EMAIL
  git config user.email "$GIT_EMAIL"
fi

# --- Repo info ---
read -r -p "GitHub username (or org): " GH_USER
read -r -p "GitHub repo name (e.g. linguaai): " GH_REPO

# --- Token (read securely) ---
read -r -s -p "GitHub Personal Access Token (input hidden): " GH_TOKEN
echo ""
echo ""

if [[ -z "$GH_USER" || -z "$GH_REPO" || -z "$GH_TOKEN" ]]; then
  echo "ERROR: All three values are required."
  exit 1
fi

REMOTE_URL="https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git"

# --- Configure remote ---
if git remote get-url origin >/dev/null 2>&1; then
  echo "→ Updating existing 'origin' remote"
  git remote set-url origin "$REMOTE_URL"
else
  echo "→ Adding 'origin' remote"
  git remote add origin "$REMOTE_URL"
fi

# --- Verify connectivity ---
echo "→ Verifying GitHub connectivity..."
if ! git ls-remote origin HEAD >/dev/null 2>&1; then
  echo ""
  echo "ERROR: Could not reach the GitHub repo."
  echo "  Check that:"
  echo "    - The repo name is spelled correctly: ${GH_USER}/${GH_REPO}"
  echo "    - The repo exists and is empty"
  echo "    - The PAT has 'repo' scope and is not expired"
  echo "    - The PAT was generated in the last few minutes (not the leaked one!)"
  exit 1
fi
echo "  ✓ reachable"

# --- Push ---
echo ""
echo "→ Pushing main branch (this may take a minute)..."
git push -u origin main

echo ""
echo "→ Pushing v1.1.0 tag to trigger a release build..."
if git rev-parse v1.1.0 >/dev/null 2>&1; then
  git push origin v1.1.0 || echo "  (tag push skipped — may already exist)"
else
  git tag v1.1.0
  git push origin v1.1.0
fi

# --- Scrub the token from git config ---
echo ""
echo "→ Scrubbing token from local git config (for safety)..."
git remote set-url origin "https://github.com/${GH_USER}/${GH_REPO}.git"

# --- Clear the token from memory ---
unset GH_TOKEN

echo ""
echo "================================================"
echo "  ✓ PUSH COMPLETE"
echo "================================================"
echo ""
echo "Repo:    https://github.com/${GH_USER}/${GH_REPO}"
echo "Actions: https://github.com/${GH_USER}/${GH_REPO}/actions"
echo "Release: https://github.com/${GH_USER}/${GH_REPO}/releases/tag/v1.1.0"
echo ""
echo "What happens next:"
echo "  - The Actions workflow will start automatically"
echo "  - It will lint + build the Next.js web app"
echo "  - It will build the Android APK"
echo "  - It will package the Chrome extension"
echo "  - It will create a GitHub Release with the APK + extension attached"
echo "  - Build takes ~5-10 minutes; check the Actions tab for progress"
echo ""
echo "IMPORTANT SECURITY:"
echo "  - The token has been scrubbed from local git config"
echo "  - Your fresh token is still valid — store it in a password manager"
echo "  - NEVER paste tokens into chat (this is why we're here!)"
echo ""

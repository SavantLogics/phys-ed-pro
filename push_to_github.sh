#!/usr/bin/env bash
# Pushes PhysEd Pro v3.1 to https://github.com/SavantLogics/phys-ed-pro
# preserving the existing v2 commit history.
#
# Run in Terminal:
#   bash "/Users/rodneyhawkins/Claude/Projects/Jessica's Physical Education App/push_to_github.sh"
#
# Auth: uses whatever GitHub credentials your Mac already has
# (osxkeychain / gh CLI). If prompted for a password, GitHub requires
# a Personal Access Token there, not your account password:
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

REPO="https://github.com/SavantLogics/phys-ed-pro.git"

# 1. Init repo here if needed (this folder becomes the working copy)
if [ ! -d .git ]; then
  git init -b main 2>/dev/null || { git init && git branch -M main; }
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO"

# 2. Identity (repo-local, only if not already configured)
git config user.name  >/dev/null 2>&1 || git config user.name  "SavantLogics"
git config user.email >/dev/null 2>&1 || git config user.email "r.savant.hawkins@gmail.com"

# 3. Adopt the existing v2 history WITHOUT touching local files,
#    then stage this folder as the next commit on top of it.
git fetch origin main
git update-ref refs/heads/main FETCH_HEAD
git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit — repo already matches this folder."
else
  git commit -m "v3.1: IndexedDB storage + migration, priority-ladder comments w/ Python test oracle, weekly overrides, editable comments, print, custom codes, backup-to-folder, full test suites"
fi

# 4. Push
git push origin main
echo
echo "Done: https://github.com/SavantLogics/phys-ed-pro"

#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Explicitly invoked by the owner to publish a PUBLIC source repo and release.
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$task_root"
gh auth status
gh auth setup-git --hostname github.com
test "$(git branch --show-current)" = main || { printf '%s\n' 'Switch to main first.' >&2; exit 1; }
test -z "$(git status --porcelain)" || { printf '%s\n' 'Commit source changes before publishing.' >&2; exit 1; }
make test
task_owner=$(gh api user --jq .login)
task_repo="$task_owner/clipnacre"
task_expected="https://github.com/$task_repo.git"
if gh repo view "$task_repo" --json nameWithOwner >/dev/null 2>&1; then
    test "$(gh repo view "$task_repo" --json visibility --jq .visibility)" = PUBLIC || {
        printf '%s\n' 'Existing repository is not public; refusing to change its visibility.' >&2; exit 1;
    }
    if git remote get-url origin >/dev/null 2>&1; then
        task_origin=$(git remote get-url origin)
        case "$task_origin" in "$task_expected"|"https://github.com/$task_repo"|"git@github.com:$task_repo.git") ;;
            *) printf '%s\n' 'origin points to a different repository.' >&2; exit 1;; esac
    else
        git remote add origin "$task_expected"
    fi
    git push -u origin main
else
    test -z "$(git remote)" || { printf '%s\n' 'Review existing remotes before creating a repository.' >&2; exit 1; }
    gh repo create "$task_repo" --public --description 'Local clipboard history and Unicode emoji picker for GNOME Shell 46, 48 and 50' --source . --remote origin --push
fi
task_sha=$(git rev-parse HEAD)
git remote -v
git ls-remote --exit-code origin refs/heads/main
gh repo view "$task_repo" --json url,visibility,defaultBranchRef
task_run=''
for task_attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    task_run=$(gh run list --repo "$task_repo" --commit "$task_sha" --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    test -z "$task_run" || break
    sleep 5
done
test -n "$task_run" || { printf '%s\n' 'No CI run found; release was not created. Check GitHub Actions.' >&2; exit 1; }
gh run watch "$task_run" --repo "$task_repo" --exit-status
task_version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")
task_tag="v$task_version"
gh release view "$task_tag" --repo "$task_repo" --json url,isDraft,assets,tagName
task_temp=$(mktemp -d)
trap 'rm -rf "$task_temp"' EXIT HUP INT TERM
gh release download "$task_tag" --repo "$task_repo" --dir "$task_temp" --pattern '*.deb' --pattern '*.zip' --pattern '*.dmg' --pattern SHA256SUMS
(cd "$task_temp" && sha256sum --check SHA256SUMS)
git status --short
git log -1 --format='%H %s'

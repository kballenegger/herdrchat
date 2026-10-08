#!/bin/sh
# Ship the current JS to every installed copy of the fork, over the air.
#
#   scripts/ota-deploy.sh                # message = the last commit's title
#   scripts/ota-deploy.sh "what changed"
#
# Runs the same gates CI does first; a broken bundle on a phone is worse than a
# failed deploy. The update lands on the next launch after the device has
# fetched it (fallbackToCacheTimeout 0: the launch that fetches it still runs
# the old one). A native change (anything under modules/, a new native
# dependency, app.json) changes the fingerprint and needs scripts/ota-build.sh.
set -eu
cd "$(dirname "$0")/.."
. scripts/ota.env
: "${EAS_PROJECT_ID:?run npx eas-cli init first, then put the project id in scripts/ota.env}"

npm run typecheck
npm run lint
npm test
MESSAGE=${1:-$(git log -1 --format=%s)}
npx eas-cli update --channel production --message "$MESSAGE" --non-interactive

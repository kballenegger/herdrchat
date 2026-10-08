#!/bin/sh
# Build a Release copy of the fork and install it on paired devices, once per
# native change. After this, JS changes ship with scripts/ota-deploy.sh.
#
#   scripts/ota-build.sh                 # every device in DEVICES below
#   scripts/ota-build.sh Hakuba          # one, by its name in `xcrun devicectl list devices`
#
# A Release build, not a dev client: the dev client loads updates from its
# launcher screen, which is not "it just shows up". Signing is automatic with
# the Apple Development identity of APPLE_TEAM_ID, which Xcode must be logged
# in to. Run it from a tmux window: the keychain may prompt the first time.
set -eu
cd "$(dirname "$0")/.."
. scripts/ota.env
: "${EAS_PROJECT_ID:?run npx eas-cli init first, then put the project id in scripts/ota.env}"

DEVICES=${*:-"Hakuba Kaohsiung"}
npx expo prebuild --platform ios --clean
for name in $DEVICES; do
  udid=$(xcrun devicectl list devices 2>/dev/null | awk -v n="$name" '$1 == n { print $2 }')
  [ -n "$udid" ] || { echo "No paired device named $name" >&2; exit 2; }
  echo "==> $name ($udid)"
  npx expo run:ios --device "$udid" --configuration Release --no-bundler
done

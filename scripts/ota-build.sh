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
# in to. Run it from a tmux window with /opt/homebrew/bin on PATH (CocoaPods):
# the keychain may prompt the first time.
#
# `expo run:ios` builds, installs on one device and then waits to attach to the
# app, and that wait never ends on a device that is locked or already running
# the app. So it builds and installs on the first device under a watchdog that
# stops it once the install has had its time, and every device, the first
# included, then gets the built app through devicectl, which returns.
set -eu
cd "$(dirname "$0")/.."
. scripts/ota.env
if [ -z "${EAS_PROJECT_ID:-}" ]; then
  echo "EAS_PROJECT_ID is empty: this build cannot take updates. Run npx eas-cli init, put the id in scripts/ota.env, and build again." >&2
fi

DEVICES=${*:-"Hakuba Kaohsiung"}
INSTALL_GRACE=${INSTALL_GRACE:-90}

udid_of() {
  xcrun devicectl list devices 2>/dev/null | awk -v n="$1" '$1 == n { print $2 }'
}

first=
for name in $DEVICES; do
  if [ -n "$(udid_of "$name")" ]; then first=$name; break; fi
done
[ -n "$first" ] || { echo "No paired device among: $DEVICES" >&2; exit 2; }

npx expo prebuild --platform ios --clean

echo "==> Building, installing on $first"
log=$(mktemp -t herdrchat-build)
npx expo run:ios --device "$(udid_of "$first")" --configuration Release --no-bundler >"$log" 2>&1 &
pid=$!
while kill -0 "$pid" 2>/dev/null; do
  if grep -q '› Installing' "$log"; then
    i=0
    while kill -0 "$pid" 2>/dev/null && [ "$i" -lt "$INSTALL_GRACE" ]; do i=$((i + 1)); sleep 1; done
    kill "$pid" 2>/dev/null || true
    break
  fi
  sleep 2
done
cat "$log"
grep -q '› Build Succeeded' "$log" || { echo "The build failed; see above." >&2; exit 1; }
app=$(grep -o '› Installing .*HerdrChat.app' "$log" | head -1 | sed 's/^› Installing //')
[ -d "$app" ] || { echo "Built app not found at: $app" >&2; exit 1; }

failed=
for name in $DEVICES; do
  udid=$(udid_of "$name")
  [ -n "$udid" ] || { echo "No paired device named $name" >&2; failed="$failed $name"; continue; }
  echo "==> Installing on $name ($udid)"
  # One device off the network must not cost the other its install.
  xcrun devicectl device install app --device "$udid" "$app" >/dev/null 2>&1 || failed="$failed $name"
done
if [ -n "$failed" ]; then
  echo "Not installed on:$failed" >&2
  exit 1
fi
echo "Installed on: $DEVICES"

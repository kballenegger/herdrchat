#!/bin/sh
# Build a Release copy of the fork and install it on paired devices, once per
# native change. After this, JS changes ship with scripts/ota-deploy.sh.
#
#   scripts/ota-build.sh                 # every device in DEVICES below
#   scripts/ota-build.sh Hakuba          # one, by its name in `xcrun devicectl list devices`
#   scripts/ota-build.sh --install-only  # no build: install the last build where a device is reachable
#
# A Release build, not a dev client: the dev client loads updates from its
# launcher screen, which is not "it just shows up". Signing is automatic with
# the Apple Development identity of APPLE_TEAM_ID, which Xcode must be logged
# in to. Run it from a tmux window with /opt/homebrew/bin on PATH (CocoaPods):
# the keychain may prompt the first time.
#
# The build is for generic iOS, not for a device: `expo run:ios --device`
# builds against one device and times out when that device drops off the
# network mid-build, which happens whenever the phone leaves the house. The
# built app is kept under ~/.cache/herdrchat-ota so a device that was away can
# get it later with --install-only.
set -eu
cd "$(dirname "$0")/.."
. scripts/ota.env
if [ -z "${EAS_PROJECT_ID:-}" ]; then
  echo "EAS_PROJECT_ID is empty: this build cannot take updates. Run npx eas-cli init, put the id in scripts/ota.env, and build again." >&2
fi

OUT=${HERDRCHAT_OTA_DIR:-$HOME/.cache/herdrchat-ota}
DERIVED=$OUT/DerivedData
APP=$DERIVED/Build/Products/Release-iphoneos/HerdrChat.app
install_only=
case "${1:-}" in --install-only) install_only=1; shift ;; esac
DEVICES=${*:-"Hakuba Kaohsiung"}

udid_of() {
  xcrun devicectl list devices 2>/dev/null | awk -v n="$1" '$1 == n { print $2 }'
}
reachable() {
  xcrun devicectl list devices 2>/dev/null | awk -v n="$1" '$1 == n' | grep -q 'available'
}

if [ -z "$install_only" ]; then
  mkdir -p "$OUT"
  npx expo prebuild --platform ios --clean
  scripts/ensure-metal-toolchain.sh
  echo "==> Building Release for generic iOS"
  xcodebuild -workspace ios/HerdrChat.xcworkspace -scheme HerdrChat -configuration Release \
    -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates build 2>&1 | grep -E '^(==>|error:|warning: .*(signing|provision)|\*\* BUILD)' || true
  [ -d "$APP" ] || { echo "No app at $APP: the build failed, see above." >&2; exit 1; }
  echo "==> Built $APP"
fi
[ -d "$APP" ] || { echo "No build to install at $APP; run without --install-only first." >&2; exit 1; }

failed=
for name in $DEVICES; do
  udid=$(udid_of "$name")
  [ -n "$udid" ] || { echo "No paired device named $name" >&2; failed="$failed $name"; continue; }
  if ! reachable "$name"; then
    echo "==> $name is not reachable now; install it later with: scripts/ota-build.sh --install-only $name" >&2
    failed="$failed $name"; continue
  fi
  echo "==> Installing on $name ($udid)"
  # One device off the network must not cost the other its install.
  xcrun devicectl device install app --device "$udid" "$APP" >/dev/null 2>&1 || failed="$failed $name"
done
if [ -n "$failed" ]; then
  echo "Not installed on:$failed" >&2
  exit 1
fi
echo "Installed on: $DEVICES"

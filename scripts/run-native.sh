#!/usr/bin/env bash
# Run the app natively via Capacitor LIVE-RELOAD against the local dev server, so you
# can test the NSFW age gate on device (issue #32): the X-Tribes-Surface header (→
# web-only opt-in enforcement), native rendering of the gate screens, and blur.
#
#   ./scripts/run-native.sh android     # boots an emulator if none is running
#   ./scripts/run-native.sh ios         # needs a booted Simulator (Xcode)
#   ANDROID_AVD=Pixel_8_API_35 ./scripts/run-native.sh android   # pick an AVD
#   CAP_HOST=192.168.1.50 ./scripts/run-native.sh android        # override host IP
#
# NOTE: live-reload loads from your machine, so passkey login WON'T work (it's
# origin-bound to tribes.app). Use the dev login button (email/password) instead.
# See docs/testing-nsfw-age-gate-local.md.
set -euo pipefail
PLATFORM="${1:-android}"
PORT="${2:-9002}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK/platform-tools/adb"
EMU="$SDK/emulator/emulator"
# LAN IP so a device/emulator can reach the dev server (10.0.2.2 = emulator→host alias).
HOST="${CAP_HOST:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 10.0.2.2)}"

echo "▶ checking dev server on :$PORT …"
curl -s --max-time 4 -o /dev/null "http://localhost:$PORT/api/health" || {
  echo "✗ Dev server not reachable on :$PORT. Start it first:  npm run dev"; exit 1; }
echo "✓ dev server up"

if [ "$PLATFORM" = "android" ]; then
  if ! "$ADB" devices 2>/dev/null | grep -q "emulator-"; then
    AVD="${ANDROID_AVD:-$("$EMU" -list-avds 2>/dev/null | head -1)}"
    [ -n "$AVD" ] || { echo "✗ No AVD found — create one in Android Studio (Device Manager)."; exit 1; }
    echo "▶ booting emulator: $AVD"
    nohup "$EMU" -avd "$AVD" >/tmp/tribes-emu.log 2>&1 &
    "$ADB" wait-for-device
    for i in $(seq 1 60); do
      [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 3
    done
    echo "✓ emulator booted"
  else
    echo "✓ emulator already running"
  fi
  echo "▶ cap run android --live-reload  (host $HOST:$PORT)"
  npx cap sync android
  npx cap run android --live-reload --host="$HOST" --port="$PORT"
elif [ "$PLATFORM" = "ios" ]; then
  echo "▶ cap run ios --live-reload  (host $HOST:$PORT)"
  echo "  (needs a booted Simulator — open one in Xcode, or it will prompt for a target)"
  npx cap sync ios
  npx cap run ios --live-reload --host="$HOST" --port="$PORT"
else
  echo "✗ Unknown platform '$PLATFORM' (use: android | ios)"; exit 1
fi

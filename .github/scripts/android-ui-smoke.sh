#!/usr/bin/env bash
set -euo pipefail

# The emulator runner executes each YAML script line as a separate shell.
# Keep variables and loops in this single script process.
APK="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
if [[ -z "$APK" ]]; then
  echo 'TEST-01 FAIL: Release APK not found'
  exit 1
fi
adb install -r "$APK"
adb shell am force-stop com.orbitnotes.prototype || true
adb shell monkey -p com.orbitnotes.prototype 1
FOUND=0
for attempt in $(seq 1 25); do
  sleep 3
  adb shell uiautomator dump /sdcard/orbit-ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/orbit-ui.xml /tmp/orbit-ui.xml >/dev/null 2>&1 || true
  if grep -q 'Create map' /tmp/orbit-ui.xml 2>/dev/null; then
    FOUND=1
    break
  fi
done
if [[ "$FOUND" != 1 ]]; then
  echo 'TEST-01 FAIL: Library-first Create map action not visible'
  adb logcat -d -t 300 | tail -n 150
  exit 1
fi
echo 'TEST-01 PASS: Release APK launches into library with Create map action'

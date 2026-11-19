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
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|com.orbitnotes.prototype' | head -n 20 || true
FOUND=0
for attempt in $(seq 1 25); do
  sleep 3
  if adb shell uiautomator dump /sdcard/orbit-ui.xml >/tmp/orbit-dump.log 2>&1; then
    adb pull /sdcard/orbit-ui.xml /tmp/orbit-ui.xml >/tmp/orbit-pull.log 2>&1 || true
  fi
  # A slow CI emulator can show a system-process ANR over the app.
  # Select Wait, never Close app, then require the real library action.
  if grep -q "System UI isn't responding" /tmp/orbit-ui.xml 2>/dev/null; then
    echo "TEST-01: System UI ANR dialog detected (attempt $attempt); selecting Wait"
    adb shell input keyevent 66 || true
    sleep 2
    continue
  fi
  if grep -q 'Create map' /tmp/orbit-ui.xml 2>/dev/null; then
    FOUND=1
    break
  fi
done
if [[ "$FOUND" != 1 ]]; then
  echo 'TEST-01 FAIL: Library-first Create map action not visible'
  echo 'TEST-01 DIAGNOSTICS: UI dump output'
  cat /tmp/orbit-dump.log 2>/dev/null || true
  echo 'TEST-01 DIAGNOSTICS: UI hierarchy'
  head -c 12000 /tmp/orbit-ui.xml 2>/dev/null || true
  echo
  echo 'TEST-01 DIAGNOSTICS: Foreground activity'
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|com.orbitnotes.prototype' | head -n 30 || true
  echo 'TEST-01 DIAGNOSTICS: App crash and React Native logs'
  adb logcat -d -v brief | grep -E 'FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|com.orbitnotes.prototype' | tail -n 120 || true
  exit 1
fi
echo 'TEST-01 PASS: Release APK launches into library with Create map action'

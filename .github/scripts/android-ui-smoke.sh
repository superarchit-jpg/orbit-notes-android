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

# Verify a human-visible control after each navigation step.
ui_element() {
  local label="$1"
  local action="${2:-find}"
  local attempt point
  for attempt in $(seq 1 8); do
    if adb shell uiautomator dump /sdcard/orbit-ui.xml >/tmp/orbit-dump.log 2>&1 &&
       adb pull /sdcard/orbit-ui.xml /tmp/orbit-ui.xml >/tmp/orbit-pull.log 2>&1 &&
       point=$(python3 - "$label" /tmp/orbit-ui.xml <<'PY'
import re
import sys
import xml.etree.ElementTree as ET
for node in ET.parse(sys.argv[2]).iter('node'):
    if sys.argv[1] not in (node.get('text'), node.get('content-desc')):
        continue
    x0, y0, x1, y1 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    if x1 > x0 and y1 > y0:
        print((x0 + x1) // 2, (y0 + y1) // 2)
        break
else:
    sys.exit(1)
PY
    ); then
      if [[ "$action" == tap ]]; then
        local x y
        read -r x y <<<"$point"
        adb shell input tap "$x" "$y"
      fi
      return 0
    fi
    sleep 2
  done
  echo "Android smoke test could not find '$label'"
  return 1
}

ui_element 'Search maps' tap
ui_element 'Exit search'
adb shell input text OrbitSmoke
ui_element 'No matching maps'
ui_element 'Clear search' tap
ui_element 'Your library is ready'
ui_element 'Exit search' tap
ui_element 'Open sidebar' tap
ui_element 'Settings' tap
ui_element 'App Lock' tap
ui_element 'Back to Settings'
adb shell input keyevent 4
ui_element 'Backup & Restore' tap
ui_element 'Restore Backup' tap
ui_element 'Select backup file'
adb shell input keyevent 4
ui_element 'Back to Settings' tap
ui_element 'Back to previous library screen' tap
ui_element 'Open sidebar' tap
ui_element 'Deleted' tap
ui_element 'No notes in Deleted'
echo 'TEST-02 PASS: search, App Lock, Backup & Restore, and Deleted navigation'

# Exercise read-only navigation with a synthetic map.
ui_element 'Open sidebar' tap
ui_element 'Maps' tap
ui_element 'Create new map' tap
ui_element 'Note title' tap
adb shell input text OrbitSmokeMap
ui_element 'Done' tap
ui_element 'Back to library' tap
ui_element 'More actions for OrbitSmokeMap' tap
ui_element 'Delete' tap
ui_element 'Move' tap
ui_element 'Open sidebar' tap
ui_element 'Deleted' tap
ui_element 'Open deleted map OrbitSmokeMap' tap
ui_element 'Back to Deleted'
ui_element 'Fit map to screen'
if grep -q 'content-desc="Add child note"\|content-desc="Node color"' /tmp/orbit-ui.xml; then
  echo 'TEST-03 FAIL: Deleted view exposes editing controls'
  exit 1
fi
echo 'TEST-03 PASS: Deleted uses the shared map in read-only mode'

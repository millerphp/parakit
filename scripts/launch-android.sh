#!/bin/sh
set -eu

ADB="/Users/work/Library/Android/sdk/platform-tools/adb"
PACKAGE="tech.christophermiller.parakit"
ACTIVITY=".MainActivity"

device="$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"

if [ -z "$device" ]; then
  echo "No connected Android devices found."
  "$ADB" devices
  exit 1
fi

echo "Launching $PACKAGE/$ACTIVITY on $device"
"$ADB" -s "$device" shell am start -n "$PACKAGE/$ACTIVITY"

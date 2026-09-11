#!/bin/bash
# SunDesk web - one-click local server for macOS.
# Double-click this file in Finder; the browser opens http://localhost:8080.
# Requires python3 (the same one used for "python3 -m http.server").

cd "$(dirname "$0")"

echo "Starting SunDesk local server..."
python3 -m http.server 8080 &
SRV_PID=$!

sleep 1
open "http://localhost:8080"

echo ""
echo "============================================================"
echo " SunDesk is open in your browser:  http://localhost:8080"
echo " Close this window (or press Ctrl+C) to stop the server."
echo "============================================================"

trap "kill $SRV_PID 2>/dev/null" EXIT
wait $SRV_PID

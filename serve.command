#!/bin/bash
# Double-click to serve the Anatomy Atlas over http:// (needed for loading local GLB files).
cd "$(dirname "$0")"
PORT=8000
echo "Serving Anatomy Atlas at http://localhost:$PORT  (Ctrl-C to stop)"
( sleep 1 && open "http://localhost:$PORT" ) &
python3 -m http.server $PORT

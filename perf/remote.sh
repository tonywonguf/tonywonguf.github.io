#!/usr/bin/env bash
# Copy dist/ and perf/ to the laptop (ssh host gpu-node) and run one perf tool there.
# Usage: perf/remote.sh gate [RUNS] | perf/remote.sh shots | perf/remote.sh SCRIPT.mjs
# The laptop has Chromium, Node and the tool packages in ~/site-rewrite (see perf/README.md).
# shellcheck disable=SC2029  # The script builds the remote command on purpose, with values from this side.
set -euo pipefail
cd "$(dirname "$0")/.."
host=gpu-node
tar cf - dist perf | ssh "$host" 'rm -rf ~/site-rewrite/site && mkdir -p ~/site-rewrite/site && tar xf - -C ~/site-rewrite/site'
tool=${1:-gate}
shift || true
case "$tool" in
  gate) ssh "$host" "cd ~/site-rewrite && . ./env.sh && cd tools && cp ../site/perf/*.mjs . && node gate.mjs ../site/dist ${1:-3}" ;;
  *)
    out=${OUT:-$HOME/.cache/site-rewrite/ours}
    mkdir -p "$out"
    script=$tool
    [ "$tool" = shots ] && script=shots.mjs
    ssh "$host" "cd ~/site-rewrite && . ./env.sh && { python3 -m http.server 8765 -b 127.0.0.1 --directory site/dist >/dev/null 2>&1 & pid=\$!; } && sleep 1 && cd tools && cp ../site/perf/*.mjs . && rm -rf ours && mkdir ours && node $script http://127.0.0.1:8765/ ours $*; kill \$pid"
    scp -q "$host:site-rewrite/tools/ours/*" "$out/" 2>/dev/null || true
    ;;
esac

#!/usr/bin/env sh
# Local preview: GitHub Pages serves /site with /data and /docs copied in by the deploy
# workflow. Locally we symlink them (both paths are gitignored) and run a static server.
set -e
cd "$(dirname "$0")/.."
ln -sfn ../data site/data
ln -sfn ../docs site/docs
PORT="${1:-8000}"
echo "Serving site at http://localhost:$PORT  (Ctrl-C to stop)"
cd site && python3 -m http.server "$PORT"

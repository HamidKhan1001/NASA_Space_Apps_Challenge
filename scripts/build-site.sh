#!/usr/bin/env sh
# Assemble the deployable site into _site/: the static pages plus the data
# contract and the docs they read. Used by Render and by GitHub Pages.
set -e
cd "$(dirname "$0")/.."

python3 pipeline/make_snapshot.py || echo "snapshot skipped"

rm -rf _site
mkdir -p _site
cp -R site/. _site/
rm -rf _site/data _site/docs          # strip local symlinks
cp -R data _site/data
cp -R docs _site/docs
printf 'User-agent: *\nAllow: /\n' > _site/robots.txt

echo "built _site: $(du -sh _site | cut -f1)"

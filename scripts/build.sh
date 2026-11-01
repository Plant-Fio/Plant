#!/usr/bin/env bash
# Fabrique le site dans _site/ : copie des fichiers + bibliotheque Supabase embarquee.
# Lance par la CI (jamais en local).
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --no-audit --no-fund --no-package-lock

rm -rf _site
mkdir -p _site/vendor
cp -r index.html manifest.webmanifest sw.js css js icons _site/

# Une seule bibliotheque (createClient), minifiee, compatible Safari recent
npx esbuild scripts/supabase-entry.js --bundle --format=esm --minify \
  --target=es2020,safari15 --outfile=_site/vendor/supabase.js

echo "Site fabrique dans _site/ :"
find _site -type f | sort

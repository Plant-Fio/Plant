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

# Generateur de QR codes (charge seulement quand on ouvre une etiquette)
npx esbuild scripts/qr-entry.js --bundle --format=esm --minify \
  --target=es2020,safari15 --outfile=_site/vendor/qr.js

# Polices des themes : copiees depuis les paquets @fontsource (alphabet latin, formats woff2)
mkdir -p _site/fonts
for police in cormorant-garamond bodoni-moda jost young-serif dm-sans; do
  for fichier in node_modules/@fontsource/"$police"/files/"$police"-latin-{400,500,600}-normal.woff2; do
    [ -f "$fichier" ] && cp "$fichier" _site/fonts/
  done
done
for attendu in $(grep -o "fonts/[a-z0-9-]*\\.woff2" sw.js | sort -u); do
  [ -f "_site/$attendu" ] || { echo "::error::Police manquante : $attendu"; exit 1; }
done

echo "Site fabrique dans _site/ :"
find _site -type f | sort

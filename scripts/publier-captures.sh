#!/usr/bin/env bash
# Publie les captures d'ecran sur la branche "captures" du depot, pour pouvoir les regarder
# directement sur GitHub (sans telecharger d'artefact). Un seul commit, sans historique.
# Usage : scripts/publier-captures.sh <dossier-source> <sous-dossier-sur-la-branche>
set -euo pipefail

SOURCE="$(cd "$1" && pwd)"
CIBLE="$2"
: "${GITHUB_TOKEN:?GITHUB_TOKEN manquant}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY manquant}"

TMP="$(mktemp -d)"
cd "$TMP"
git init -q
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# On repart de la branche existante pour garder les autres sous-dossiers (ci, en-ligne)
if git fetch -q --depth 1 origin captures 2>/dev/null; then
  git checkout -q -b captures FETCH_HEAD
else
  git checkout -q -b captures
fi

rm -rf "$CIBLE"
mkdir -p "$CIBLE"
cp -r "$SOURCE"/. "$CIBLE"/
printf "Captures d'ecran generees par la CI : ci/ (derniere PR), en-ligne/ (dernier deploiement).\n" > LISEZMOI.txt

# Nouveau commit unique (orphelin) : la branche ne grossit jamais
git add -A
git checkout -q --orphan propre
git add -A
git commit -q -m "Captures : ${CIBLE} (run ${GITHUB_RUN_ID:-local})"
git push -q --force origin propre:captures
echo "Captures publiees sur la branche captures, dossier ${CIBLE}/"

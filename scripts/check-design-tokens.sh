#!/usr/bin/env bash
# Design-system gate: every color, font size, and radius in web/src must come
# from tokens (var(--aa-*)) or live in tokens.css itself. Raw values drift —
# this is what keeps the design system the single source of truth.
#
#   scripts/check-design-tokens.sh        # list violations, exit 1 if any
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="web/src"
TOKENS="web/src/lib/tokens.css"
violations=0

# 1. Raw color literals (hex / rgb / hsl) anywhere except the tokens file.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  f="${hit%%:*}"
  [ "$f" = "$TOKENS" ] && continue
  echo "raw color: $hit"
  violations=$((violations + 1))
done < <(grep -rnE '#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(' "$SRC" \
  --include='*.svelte' --include='*.css' --include='*.ts' | grep -v 'tokens.css')

# 2. Raw font sizes — must be var(--aa-text-*) / var(--aa-font-*) (em/rem
#    relative to a token parent is fine; bare px/rem is not).
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  f="${hit%%:*}"
  [ "$f" = "$TOKENS" ] && continue
  echo "raw font-size: $hit"
  violations=$((violations + 1))
done < <(grep -rnE 'font-size:\s*(px|[0-9])' "$SRC" \
  --include='*.svelte' --include='*.css' | grep -v 'tokens.css')

# 3. Border-radius without a token.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  f="${hit%%:*}"
  [ "$f" = "$TOKENS" ] && continue
  echo "raw border-radius: $hit"
  violations=$((violations + 1))
done < <(grep -rnE 'border-radius:\s*[0-9]' "$SRC" \
  --include='*.svelte' --include='*.css' | grep -v 'tokens.css')

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "design tokens: $violations violation(s). Colors → var(--aa-*), sizes →"
  echo "the text/radius tokens, or add the value to tokens.css if it's a NEW"
  echo "token (docs/DESIGN-SYSTEM.md decides that, not this script)."
  exit 1
fi
echo "design tokens: clean"

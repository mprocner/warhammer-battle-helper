#!/usr/bin/env bash
# Renders og.html into warhammer-battle-helper-front/public/og-image.png (1200x630), the image
# shown in link previews (Open Graph / Twitter Card). Needs Google Chrome and `npm install`
# in warhammer-battle-helper-front (the fonts come from its node_modules).
#
#   ./scripts/og-image/render.sh
#
# Set CHROME to the browser binary if it is not in the default macOS location.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../warhammer-battle-helper-front/public/og-image.png"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

"$chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files \
  --window-size=1200,630 \
  --screenshot="$out" \
  "file://$here/og.html"

echo "Wrote $out"

#!/bin/sh
# Rigenera le icone da public/logo.svg (serve rsvg-convert)
set -e
cd "$(dirname "$0")/.."
for s in 192 512; do rsvg-convert -w $s -h $s public/logo.svg -o public/icons/icon-$s.png; done
rsvg-convert -w 512 -h 512 scripts/maskable.svg -o public/icons/maskable-512.png
rsvg-convert -w 180 -h 180 scripts/maskable.svg -o public/icons/apple-touch-icon.png
rsvg-convert -w 32 -h 32 public/logo.svg -o public/favicon-32.png

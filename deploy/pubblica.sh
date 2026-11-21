#!/bin/sh
# Da eseguire sul Mac, dalla cartella del repository: copia il codice sul server e ricostruisce Leggilo.
# Uso: sh deploy/pubblica.sh   (SERVER si può cambiare: SERVER=torre@altro sh deploy/pubblica.sh)
set -e
SERVER="${SERVER:-torre@100.92.126.67}"
cd "$(dirname "$0")/.."
rsync -az --delete --exclude node_modules --exclude dist --exclude dev-dist --exclude .git ./ "$SERVER:leggilo/"
ssh "$SERVER" 'cd ~/leggilo/deploy && docker compose up -d --build && docker image prune -f >/dev/null && docker ps --filter name=^leggilo$ --format "{{.Names}}: {{.Status}}"'

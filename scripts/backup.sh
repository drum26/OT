#!/bin/sh
# Ручное резервное копирование из запущенного docker compose: ./scripts/backup.sh [каталог]
set -eu
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/ot-$(date +%Y-%m-%dT%H-%M-%S)-manual.dump"
docker compose exec -T db sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$FILE"
echo "Резервная копия: $FILE ($(du -h "$FILE" | cut -f1))"

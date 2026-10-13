#!/bin/sh
# Ежедневная резервная копия (pg_dump, формат custom) в /backups, удаление копий старше BACKUP_KEEP_DAYS дней.
set -u
while true; do
  if [ "$(date +%H)" = "${BACKUP_HOUR:-02}" ]; then
    f="/backups/ot-$(date +%Y-%m-%dT%H-%M-%S)-auto.dump"
    if pg_dump --format=custom --no-owner -f "$f.tmp"; then
      mv "$f.tmp" "$f"; echo "$(date) резервная копия создана: $f"
    else
      rm -f "$f.tmp"; echo "$(date) ОШИБКА резервного копирования" >&2
    fi
    find /backups -name 'ot-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
    sleep 3700
  fi
  sleep 600
done

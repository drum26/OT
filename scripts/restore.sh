#!/bin/sh
# Восстановление БД из резервной копии (формат pg_dump custom). НЕОБРАТИМО заменяет текущие данные.
#   ./scripts/restore.sh путь/к/файлу.dump
set -eu
FILE="${1:?Укажите файл резервной копии}"
[ -f "$FILE" ] || { echo "Файл не найден: $FILE"; exit 1; }
echo "ВНИМАНИЕ: все текущие данные базы будут заменены данными из $FILE."
printf "Для продолжения введите ВОССТАНОВИТЬ: "
read ANSWER
[ "$ANSWER" = "ВОССТАНОВИТЬ" ] || { echo "Отменено"; exit 1; }
echo "Остановка backend..."
docker compose stop backend
echo "Восстановление..."
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$FILE"
echo "Запуск backend (будут применены недостающие миграции)..."
docker compose start backend
echo "Готово. Проверьте вход в систему и журнал: docker compose logs backend"

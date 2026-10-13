#!/bin/sh
set -e
echo "Применение миграций БД..."
./node_modules/.bin/prisma migrate deploy
echo "Базовые справочники (роли, права, шаблоны)..."
node dist/prisma/seed-base.js
exec node dist/src/main.js

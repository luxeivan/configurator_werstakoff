#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "→ Дамп MySQL"
docker compose exec -T db sh -c 'exec mysqldump --single-transaction --routines --triggers --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "backups/db-${STAMP}.sql"

echo "→ Архив uploads"
docker compose exec -T app tar czf - -C /app uploads > "backups/uploads-${STAMP}.tar.gz"

echo "Готово:"
ls -lh "backups/db-${STAMP}.sql" "backups/uploads-${STAMP}.tar.gz"
echo "Проверьте восстановление на тестовой БД перед production-восстановлением."

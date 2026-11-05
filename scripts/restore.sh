#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
DB_FILE="${1:-}"
UPLOADS_FILE="${2:-}"

if [[ -z "$DB_FILE" || -z "$UPLOADS_FILE" ]]; then
  echo "Использование: scripts/restore.sh backups/db-YYYYMMDDTHHMMSSZ.sql backups/uploads-YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 2
fi
if [[ ! -f "$DB_FILE" || ! -f "$UPLOADS_FILE" ]]; then
  echo "Файлы бэкапа не найдены" >&2
  exit 2
fi

read -r -p "Восстановление перезапишет БД и uploads. Продолжить? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1

echo "→ Восстановление MySQL"
docker compose exec -T db sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$DB_FILE"

echo "→ Восстановление uploads"
docker compose exec -T app sh -c 'rm -rf /app/uploads/* && tar xzf - -C /app' < "$UPLOADS_FILE"
docker compose restart app

echo "Готово. Проверьте /api/health и откройте планировщик."

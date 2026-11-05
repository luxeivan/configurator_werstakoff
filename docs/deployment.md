# Развёртывание

## Требования

- Docker Engine 24+ и Docker Compose v2.24+ (поддерживается `!reset`).
- 2 ГБ RAM минимум, 2 vCPU.
- Домен и DNS-запись для production.
- Свободный порт **3500** (приложение) или 80/443 (Caddy).

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

| Переменная | Назначение |
|---|---|
| `PORT` / `HOST_PORT` | Порт приложения, по умолчанию `3500` |
| `APP_URL` | Публичный URL, например `https://planner.example.ru` |
| `SESSION_SECRET` | Случайная строка ≥ 32 байт; смена завершает все сессии |
| `DB_*` | База MySQL; пароли генерируйте случайно |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Первый администратор для seed |
| `SMTP_*`, `MAIL_FROM`, `MAIL_TO` | Уведомления о заказах; без SMTP письма пропускаются |
| `DOMAIN` | Домен для Caddy в production |
| `TRUST_PROXY=true` | Только за reverse proxy, чтобы корректно читать IP |

Секреты не коммитьте. `.env` уже в `.gitignore`.

## Запуск разработки

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec app npm run seed
```

Проверка:

```bash
curl -fsS http://localhost:3500/api/health
curl -fsS http://localhost:3500/api/config
```

`/api/health` возвращает `db: ok` только при доступной БД.

## Production с HTTPS

1. Укажите `DOMAIN` и `APP_URL` в `.env`. Production-профиль сам выставляет `NODE_ENV=production` и `TRUST_PROXY=true`.
2. Соберите и запустите:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app npm run seed
```

Caddy автоматически получит сертификат Let's Encrypt, проксирует запросы на `app:3500`,
добавит HSTS и ограничит размер тела запроса 60 МБ (загрузка моделей).

Проверьте:

```bash
curl -I https://planner.example.ru
curl -fsS https://planner.example.ru/api/health
```

Порт приложения наружу не публикуется в production-профиле. Открыты только 80/443.

## Обновление

```bash
./scripts/backup.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Миграции применяются сервисом `migrate` перед стартом приложения. Миграции только
вперёд; destructive-изменения требуют бэкапа и ручного подтверждения.

## Бэкапы

```bash
./scripts/backup.sh
```

Создаёт в `backups/`:

- `db-YYYYMMDDTHHMMSSZ.sql` — дамп MySQL (`--single-transaction`, процедуры, триггеры);
- `uploads-YYYYMMDDTHHMMSSZ.tar.gz` — все модели, изображения и PDF.

Храните копии вне сервера. Рекомендуемая политика: ежедневно 14 дней, еженедельно 8 недель,
ежемесячно 12 месяцев.

Восстановление (перезаписывает данные):

```bash
./scripts/restore.sh backups/db-....sql backups/uploads-....tar.gz
```

Скрипт спрашивает подтверждение. После восстановления проверьте `/api/health`, откройте
планировщик и скачайте PDF старого заказа.

## Логи и мониторинг

- Приложение пишет JSON-логи Pino в stdout; Docker ограничивает размер файлов.
- `docker compose logs -f app`, `docker compose logs -f migrate`.
- Healthcheck контейнера — `scripts/healthcheck.js`, проверяет API и БД.
- Ошибки 5xx содержат `requestId`; ищите его в логах.
- Внешний мониторинг: проверяйте `/api/health` каждые 30–60 секунд.
- Sentry/лог-алерты подключаются по согласованию; в MVP не требуются.

## Чеклист безопасности перед публикацией

- [ ] Уникальные `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `SESSION_SECRET`.
- [ ] `ADMIN_PASSWORD` заменён после первого входа.
- [ ] Включён HTTPS, HSTS, `TRUST_PROXY=true`.
- [ ] Проверены CSP/CSRF: мутация без `X-CSRF-Token` → `403 CSRF_INVALID`.
- [ ] Гость не видит `/api/admin/*`; менеджер не видит каталог и настройки.
- [ ] Ограничены порты firewall: только 80/443.
- [ ] Настроены бэкапы и проверено восстановление на тестовой БД.
- [ ] SMTP проверен тестовым заказом.
- [ ] Ротация логов включена.

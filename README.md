# 3D-планировщик металлической мебели

Самостоятельное приложение: React + three.js (frontend), Node.js + Express + MySQL (backend),
Docker Compose. Не зависит от CMS «Битрикс».

Полный план, архитектура, модель данных, API и этапы — в [AGENTS.md](./AGENTS.md).

## Возможности

- Прямоугольное и Г-образное помещение, размеры, площадь, периметр.
- Иерархический каталог: постоянное дерево разделов, товары — во всплывающем окне с поиском,
  ценой и опциями; размещение на 2D-плане. В каталоге 289 товаров, 35 разделов и
  288 GLB-моделей; 184 фото, цены/описания/свойства подтянуты из каталога поставщика.
- Инспектор-аккордеон: все объекты на плане, выбранный раскрывает свойства; итог закреплён внизу.
- Полноэкранный адаптивный интерфейс без прокрутки страницы: панели занимают всю высоту,
  длинные списки и формы прокручиваются внутри; 2D/3D split, привязки, undo/redo.
- Защита от наложения предметов при перетаскивании в 2D и 3D; клик по пустому месту снимает выделение.
- 3D: GLB/GLTF/STL, тени, камера, пресеты, выбор объектов, калибровка моделей,
  автоскрытие передних стен, непрозрачный пол и большая плоскость до горизонта,
  автоориентация STL из CAD, металлические материалы с выбранным RAL-цветом,
  gizmo перемещения и вращения прямо в 3D-сцене.
- Рядом с «Рендер 3D» — шестерёнка: пресеты и ползунки качества (проходы,
  буфер, мягкость теней, постобработка); личные настройки в этом браузере,
  «Сбросить» возвращает админские.
- Рендер «Рендер 3D»: прогрессивная выборка (6 проходов: микро-джиттер камеры +
  источника света → мягкие полутени и чистый AA), временное освещение (глобальный +
  заполняющий + контровой + локальный тёплый + мягкий заполняющий свет в тени),
  мягкие тени через «теневую
  маску» (белые материалы под одним светом + размытие + умножающая композиция),
  кинопоставка (тон, лёгкое свечение Orton, виньетка); ~1–3 c на GPU. Скачивается в JPG
  и попадает в PDF заказа как снимок камеры.
- Оформление заказа: 5 снимков (план, камера, общий вид, фронт, профиль), PDF, письмо.
- Заказы покупателя: список, детали, PDF, повторная отправка, копия, удаление.
- Админка с вкладками на единой обложке: каталог (по умолчанию), свойства товаров,
  настройки, заказы; вкладки не меняют положения между страницами.
- Качество рендера 3D настраивается администратором (пресет, проходы, разрешение,
  мягкость теней, постобработка) и применяется у всех посетителей.
- Дизайн «Steel Atelier»: графитовая шапка, чертёжная сетка, цинковые панели и
  оранжевый сигнальный акцент; контраст по WCAG AA.
- Гостевой checkout без регистрации; права admin/manager проверяются на сервере.
- Бэкапы MySQL + uploads, production Caddy с HTTPS.

## Быстрый старт

```bash
cp .env.example .env
# задайте DB_PASSWORD, DB_ROOT_PASSWORD, SESSION_SECRET, ADMIN_PASSWORD
docker compose up -d --build
docker compose exec app npm run seed
```

- Планировщик: http://localhost:3500
- Админка (по умолчанию — каталог): http://localhost:3500/admin/catalog
- Свойства товаров: http://localhost:3500/admin/properties
- Настройки: http://localhost:3500/admin/settings
- Заказы админки: http://localhost:3500/admin/orders
- Health: http://localhost:3500/api/health
- Adminer (профиль tools): `docker compose --profile tools up -d adminer` → http://localhost:8080

Seed создаёт настройки, администратора из `ADMIN_EMAIL`/`ADMIN_PASSWORD`, раздел «Тележки»,
товар «Тележка PRF-E» и 3D-модель. Повторный запуск идемпотентен. Массовый каталог
(288 моделей) уже загружен в текущую БД; seed его не пересоздаёт — для чистой БД нужен
повторный импорт из `models.zip` + `export.json` (см. `docs/admin-guide.md`).

Остановить / удалить данные:

```bash
docker compose down
docker compose down -v   # удалит БД и uploads
```

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app npm run seed
```

Caddy слушает 80/443, получает TLS, проксирует на `app:3500`; приложение наружу не публикуется.
Задайте `DOMAIN` и `APP_URL`. Подробности — [docs/deployment.md](./docs/deployment.md).

## Документация

- [Развёртывание, бэкапы, безопасность](docs/deployment.md)
- [Руководство администратора](docs/admin-guide.md)
- [API](docs/api.md)
- [Диагностика](docs/troubleshooting.md)
- [Этапы и решения](AGENTS.md)

## Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | server + web одновременно |
| `npm run build` | сборка frontend |
| `npm run start` | запуск server |
| `npm run db:generate` | сгенерировать миграцию Drizzle |
| `npm run db:migrate` | применить миграции |
| `npm run seed` | настройки + админ + тестовый каталог |
| `npm run create-admin -- --email ... --password ...` | создать/сбросить администратора (`--force`) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (unit/worker/security) |
| `npm run test:e2e` | Playwright (нужен запущенный app на 3500) |
| `npm run test:load` | простой load-test API |
| `npm run format` | Prettier |

## Тесты

```bash
npm run lint
npm run test
npm run build
docker compose up -d --build
npm run test:e2e
```

E2E: планировщик, полный checkout с PDF, админка, права менеджера, mobile, axe (серьёзные
нарушения доступности). Load-test: `LOAD_REQUESTS=300 LOAD_CONCURRENCY=20 npm run test:load`.

## Технологии

React 19, Vite, React Router, Zustand, three.js, SVG 2D; Node.js 22, Express 5, Drizzle ORM,
MySQL 8.4, Zod, Pino, Helmet, iron-session, multer, sharp, pdfmake, nodemailer, meshoptimizer;
Docker Compose, Caddy. Только JavaScript/JSX.

## Структура

```
apps/web            React SPA
apps/server         Express API, Drizzle, сервисы, worker оптимизации
packages/shared     геометрия, цены, общие константы
apps/server/drizzle миграции
models              исходные 3D-модели для seed
uploads (volume)    public/private файлы
scripts             healthcheck, backup/restore, load-test
docs                эксплуатация и API
tests/e2e           Playwright
```

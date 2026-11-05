# API

Базовый префикс — `/api`. Формат ответа:

```json
{ "data": ... }
```

Ошибка:

```json
{ "error": { "code": "ORDER_NOT_FOUND", "message": "Заказ не найден" } }
```

## Сессия и CSRF

- `GET /api/auth/me` — пользователь, `csrfToken`, признак гостя.
- `POST /api/auth/login` — `{email, password}`; ставит cookie `planner_session`.
- `POST /api/auth/logout`.
- Любая мутация (`POST/PATCH/PUT/DELETE`) требует заголовок `X-CSRF-Token`
  со значением из `/api/auth/me`. Иначе `403 CSRF_INVALID`.
- Гость получает подписанную cookie и `guestId`; заказы привязываются к HMAC
  гостевой сессии. Чужой заказ → `403 ORDER_FORBIDDEN`.

## Публичный каталог

- `GET /api/catalog/tree` — активные разделы с количеством товаров.
- `GET /api/catalog/filters` — диапазоны цен/габаритов, свойства.
- `GET /api/catalog/products?q=&sectionId=&minPrice=&maxPrice=&sort=&page=&limit=`
- `GET /api/catalog/products/:publicId` — карточка, изображения, модель, опции.

Модель приходит в `model`:

```json
{
  "url": "/media/public/models/....glb",
  "format": "glb",
  "triangles": 176672,
  "transform": { "fitMode": "uniform", "scale": [0.1,0.1,0.1] },
  "optimized": { "url": "/media/public/models/....glb", "triangles": 49906 },
  "optimizeStatus": "done"
}
```

Планировщик использует `model.optimized.url`, если он есть, иначе `model.url`.

## Заказы покупателя

### Создать

`POST /api/orders`

```json
{
  "room": {
    "shape": "l",
    "widthCm": 420,
    "depthCm": 360,
    "legWidthCm": 180,
    "legDepthCm": 160,
    "ceilingHeightCm": 270
  },
  "items": [
    {
      "productId": "01M5...",
      "placement": { "x": 210, "z": 180, "rotationDeg": 90, "elevationCm": 0 },
      "quantity": 2,
      "options": [{ "propertyId": 1, "paramId": 10 }]
    }
  ],
  "contacts": {
    "name": "Иван",
    "phone": "+7 900 000-00-00",
    "email": "ivan@example.ru",
    "company": "",
    "inn": "",
    "comment": "",
    "consent": true
  }
}
```

Цены, опции и свойства фиксируются сервером в снимке. Клиент не может передать цену.
Номер заказа (`СЧ-2026-0001`) выдаётся транзакционно.

### Остальные

- `GET /api/orders` — заказы текущей сессии.
- `GET /api/orders/:publicId` — детали, позиции, изображения, история.
- `POST /api/orders/:publicId/images` — multipart: `file`, `kind`
  (`plan2d`, `view3d_user`, `view3d_fit`, `front`, `profile`), `camera`, `width`, `height`.
- `GET /api/orders/:publicId/images/:kind` — приватное изображение (сессия обязательна).
- `POST /api/orders/:publicId/pdf` — сформировать PDF из снимка.
- `GET /api/orders/:publicId/pdf` — скачать PDF.
- `POST /api/orders/:publicId/submit` — `{contacts, version}`; статус `submitted`,
  письмо best-effort.
- `PATCH /api/orders/:publicId` — черновик; `version` защищает от перезаписи.
- `POST /api/orders/:publicId/clone` — копия заказа.
- `DELETE /api/orders/:publicId` — soft-delete.

## Админка

Требуется вход. `/api/admin/orders` доступен `admin` и `manager`; остальные
`/api/admin/*` — только `admin`.

- `GET /api/admin/orders?status=&q=&from=&to=&page=&limit=`
- `GET /api/admin/orders/stats` — статусы, сумма, последние, топ товаров.
- `GET /api/admin/orders/export.csv` — CSV (admin).
- `GET|PATCH|DELETE /api/admin/orders/:id` — карточка, статус/комментарий, purge.
- `POST /api/admin/orders/:id/pdf/regenerate`.

### Каталог

- `GET|POST /api/admin/sections`; `GET /api/admin/sections/flat`;
  `PATCH|DELETE /api/admin/sections/:id`.
- `GET|POST /api/admin/products`; `GET|PATCH|DELETE /api/admin/products/:id`.
- `PUT /api/admin/products/:id/properties` — `{values:[...]}`.
- `PUT /api/admin/products/:id/options` — `{options:[...]}`.
- `POST /api/admin/products/:id/images` — multipart `file`.
- `DELETE /api/admin/products/:id/images/:imageId`.
- `POST /api/admin/products/:id/model` — multipart `file`, `bboxMm`, `triangles`, `transform`.
- `GET /api/admin/products/:id/optimize` — статус/прогресс.
- `POST /api/admin/products/:id/optimize` — `{targetTriangles}`; worker STL/GLB → GLB.
- `POST /api/admin/products/:id/optimize/rollback` — вернуть оригинал.

### Свойства

- `GET|POST /api/admin/properties`
- `PATCH|DELETE /api/admin/properties/:id`
- `POST /api/admin/properties/:id/params`
- `PATCH|DELETE /api/admin/properties/:id/params/:paramId`

### Настройки и пользователи

- `GET|PUT /api/admin/settings`
- `GET|POST /api/admin/users`; `PATCH /api/admin/users/:id`

## Коды ошибок

`VALIDATION_ERROR`, `AUTH_REQUIRED`, `SESSION_EXPIRED`, `FORBIDDEN`, `CSRF_INVALID`,
`PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `ORDER_FORBIDDEN`, `ORDER_VERSION_CONFLICT`,
`ORDER_EMPTY`, `CONTACTS_REQUIRED`, `CONSENT_REQUIRED`, `OPTION_REQUIRED`,
`OPTION_INVALID`, `PROPERTY_NAME_EXISTS`, `PROPERTY_IN_USE`, `PARAM_IN_USE`,
`SECTION_CYCLE`, `SECTION_HAS_PRODUCTS`, `MODEL_FORMAT_INVALID`, `IMAGE_FORMAT_INVALID`,
`OPTIMIZE_IN_PROGRESS`, `OPTIMIZE_FORMAT_UNSUPPORTED`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Валидация — Zod на сервере. Ошибки не раскрывают стек и SQL.

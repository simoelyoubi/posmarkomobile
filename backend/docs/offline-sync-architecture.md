# Offline-first multi-terminal POS sync architecture

## 1) Architecture

- **Tenant boundary:** all data is partitioned by `shop_id`.
- **Device boundary:** each terminal is identified by `terminal_id` + secret.
- **Offline-first:** local SQLite is source of truth while disconnected; cloud MySQL becomes eventual shared truth when connected.
- **Sync direction/order:** always do **upload first**, then **download**.
- **No sockets:** terminals run a periodic sync loop (for example every 15–60 seconds when online).

### Components

1. **Electron POS (per terminal)**
   - local SQLite tables mirror cloud tables and hold `sync_status`.
   - queue pending rows (`sync_status='pending'`) from POS operations.
2. **Sync API (Node/Express)**
   - stateless auth via JWT token from terminal login.
   - `/sync/upload` applies pending changes in transaction batches.
   - `/sync/download` returns rows changed after cursor.
3. **MySQL (cloud canonical store)**
   - tenant-scoped tables with indexes `(shop_id, updated_at)`.
   - soft delete via `deleted_at`.
4. **Dashboard API reads cloud tables only**
   - no local terminal reads for dashboard.

## 2) Conflict strategy (practical)

### Rule A — Master data (categories, products metadata, clients, suppliers, employees, expenses)
Use **Last-Write-Wins** by `updated_at` with deterministic tie-breaker by `terminal_id`.

### Rule B — Orders and stock
- **Orders are append-first and immutable after close**.
- If order already exists and cloud status is `closed`, reject edits from terminal.
- Stock is **not recomputed by replacing product stock blindly**; instead apply **idempotent stock movements** from order items once (`uk_stock_once`).
- This prevents duplicate decrements when the same order syncs multiple times.

### Why not pure LWW for stock?
Two terminals can sell same product offline. Pure LWW on `products.stock_quantity` can overwrite a valid decrement and lose stock events. Using movement ledger (`stock_movements`) preserves both sales safely.

## 3) Sync flow diagrams (text)

### Upload flow (`POST /sync/upload`)

```text
Terminal -> API: JWT + pending rows grouped by entity
API: verify terminal/shop scope
API: BEGIN TX
for each entity row:
  fetch current cloud row by (shop_id, id)
  run conflict policy
  if local wins:
    upsert row
    if entity == order_items and order is closed:
      insert stock_movements once (unique by order_item_id)
      decrement products.stock_quantity by qty_delta once
API: COMMIT
API -> Terminal: accepted/rejected ids + reasons
Terminal: mark accepted rows as synced
```

### Download flow (`POST /sync/download`)

```text
Terminal -> API: JWT + cursor (last_successful_sync_at)
API: for each entity select rows where shop_id = ? and updated_at > cursor
API -> Terminal: {cursor:newServerTime, changes:{...}}
Terminal: upsert rows in SQLite
Terminal: keep new cursor after successful local apply
```

### Bootstrapping a new terminal

```text
Owner dashboard creates activation code for shop
Terminal -> /auth/register-terminal with shop slug + activation code
API returns terminal_id + terminal_secret (shown once)
Terminal stores credentials securely
Terminal -> /auth/login => JWT
Terminal -> /sync/download with cursor null to get full seed
```

## 4) Example payloads

### Upload request

```json
{
  "changes": {
    "products": [
      {
        "id": "prod-1",
        "shop_id": "shop-1",
        "terminal_id": "term-a",
        "name": "Water 1L",
        "updated_at": "2026-04-06T09:10:11.000Z",
        "deleted_at": null,
        "sync_status": "pending",
        "stock_quantity": 14
      }
    ],
    "orders": [
      {
        "id": "ord-1001",
        "shop_id": "shop-1",
        "terminal_id": "term-a",
        "order_number": "A-1001",
        "status": "closed",
        "total_amount": 120,
        "total_cost": 90,
        "created_at": "2026-04-06T09:08:00.000Z",
        "updated_at": "2026-04-06T09:08:10.000Z",
        "deleted_at": null,
        "sync_status": "pending"
      }
    ],
    "order_items": [
      {
        "id": "oi-1",
        "shop_id": "shop-1",
        "terminal_id": "term-a",
        "order_id": "ord-1001",
        "product_id": "prod-1",
        "quantity": 2,
        "unit_price": 60,
        "unit_cost": 45,
        "line_total": 120,
        "updated_at": "2026-04-06T09:08:10.000Z",
        "deleted_at": null,
        "sync_status": "pending"
      }
    ]
  }
}
```

### Upload response

```json
{
  "ok": true,
  "accepted": {
    "products": [{ "id": "prod-1", "result": "upserted", "reason": "LWW by updated_at" }],
    "orders": [{ "id": "ord-1001", "result": "upserted", "reason": "new row" }],
    "order_items": [{ "id": "oi-1", "result": "upserted", "reason": "new row" }]
  }
}
```

### Download request

```json
{ "cursor": "2026-04-06T09:00:00.000Z" }
```

### Download response

```json
{
  "ok": true,
  "cursor": "2026-04-06T09:15:00.222Z",
  "changes": {
    "products": [{ "id": "prod-2", "updated_at": "2026-04-06T09:12:00.000Z" }],
    "orders": [],
    "order_items": []
  }
}
```

## 5) Security recommendations

1. Use TLS only (`https://api.posmarko.ma`).
2. Store terminal secret hashed (`bcrypt`) server-side.
3. JWT short expiry (8h) + refresh strategy if needed.
4. Rate limit login/register-terminal and sync endpoints per IP + terminal.
5. Sign request body with HMAC if you need tamper resistance in hostile networks.
6. Enforce row-level tenant checks (`shop_id` from token, never from body trust).
7. Audit log for auth events and rejected conflicts.
8. Encrypt local SQLite at rest for stolen device scenarios.

## 6) Deployment notes (subdomains under `posmarko.ma`)

- `api.posmarko.ma` -> sync + dashboard API (Node service)
- `dashboard.posmarko.ma` -> web dashboard frontend
- `<shop>.posmarko.ma` -> optional branded landing/admin pages

### Reverse proxy

- Nginx/Caddy routes `/auth`, `/sync`, `/dashboard` to API service.
- Enable HTTP/2, gzip/brotli, and strict TLS config.

### Multi-shop scalability

- Horizontal API scale (stateless JWT).
- MySQL read replicas for dashboard-heavy reads.
- Keep sync batch size bounded (for example max 1000 rows/entity/request).
- Add background compaction for old soft-deleted rows and archived orders.

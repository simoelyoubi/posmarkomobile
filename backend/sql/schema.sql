-- Multi-tenant, multi-terminal offline-first POS schema (MySQL 8+)

CREATE TABLE shops (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  activation_code VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE terminals (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_terminals_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_terminals_shop (shop_id)
);

-- Generic pattern used by synced entities:
-- id, shop_id, terminal_id, updated_at, deleted_at, sync_status

CREATE TABLE categories (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_categories_shop_updated (shop_id, updated_at),
  INDEX idx_categories_deleted (shop_id, deleted_at)
);

CREATE TABLE products (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  sku VARCHAR(80) NULL,
  name VARCHAR(200) NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(12,3) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_products_shop_updated (shop_id, updated_at),
  INDEX idx_products_stock (shop_id, stock_quantity, low_stock_threshold)
);

CREATE TABLE clients (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_clients_shop_updated (shop_id, updated_at)
);

CREATE TABLE suppliers (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_suppliers_shop_updated (shop_id, updated_at)
);

CREATE TABLE employees (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  role VARCHAR(80) NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_employees_shop_updated (shop_id, updated_at)
);

CREATE TABLE expenses (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  label VARCHAR(220) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  INDEX idx_expenses_shop_updated (shop_id, updated_at)
);

CREATE TABLE orders (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  order_number VARCHAR(80) NOT NULL,
  employee_id CHAR(36) NULL,
  client_id CHAR(36) NULL,
  status ENUM('draft','closed','cancelled') NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  UNIQUE KEY uk_orders_shop_order_number (shop_id, order_number),
  INDEX idx_orders_shop_updated (shop_id, updated_at),
  INDEX idx_orders_shop_status_created (shop_id, status, created_at)
);

CREATE TABLE order_items (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  terminal_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  sync_status ENUM('pending','synced','conflict') NOT NULL DEFAULT 'synced',
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE KEY uk_order_items_shop_order_product (shop_id, order_id, product_id, id),
  INDEX idx_order_items_shop_updated (shop_id, updated_at)
);

CREATE TABLE stock_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  order_item_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  qty_delta DECIMAL(12,3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_stock_once (shop_id, order_item_id),
  INDEX idx_stock_movements_shop_product (shop_id, product_id, created_at)
);

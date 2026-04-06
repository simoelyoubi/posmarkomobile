const db = require('../db');

async function summary(req, res) {
  const { shop_id } = req.auth;
  const [[stats]] = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM products WHERE shop_id = ? AND deleted_at IS NULL) AS products,
      (SELECT COUNT(*) FROM clients WHERE shop_id = ? AND deleted_at IS NULL) AS clients,
      (SELECT COUNT(*) FROM suppliers WHERE shop_id = ? AND deleted_at IS NULL) AS suppliers,
      (SELECT COUNT(*) FROM orders WHERE shop_id = ? AND deleted_at IS NULL) AS orders,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE shop_id = ? AND status='closed' AND deleted_at IS NULL) AS revenue`,
    [shop_id, shop_id, shop_id, shop_id, shop_id]
  );
  return res.json(stats);
}

function pagedList(table) {
  return async (req, res) => {
    const { shop_id } = req.auth;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const [rows] = await db.query(
      `SELECT * FROM ${table} WHERE shop_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [shop_id, limit, offset]
    );
    return res.json({ data: rows, limit, offset });
  };
}

async function orders(req, res) {
  const { shop_id } = req.auth;
  const [rows] = await db.query(
    `SELECT o.*, COUNT(oi.id) item_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.shop_id = o.shop_id
     WHERE o.shop_id = ? AND o.deleted_at IS NULL
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 200`,
    [shop_id]
  );
  return res.json({ data: rows });
}

async function profitByEmployee(req, res) {
  const { shop_id } = req.auth;
  const [rows] = await db.query(
    `SELECT o.employee_id, e.name, SUM(o.total_amount - o.total_cost) AS profit
     FROM orders o
     JOIN employees e ON e.id = o.employee_id AND e.shop_id = o.shop_id
     WHERE o.shop_id = ? AND o.status='closed' AND o.deleted_at IS NULL
     GROUP BY o.employee_id, e.name
     ORDER BY profit DESC`,
    [shop_id]
  );
  return res.json({ data: rows });
}

async function topProducts(req, res) {
  const { shop_id } = req.auth;
  const [rows] = await db.query(
    `SELECT oi.product_id, p.name, SUM(oi.quantity) qty_sold
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id AND p.shop_id = oi.shop_id
     JOIN orders o ON o.id = oi.order_id AND o.shop_id = oi.shop_id
     WHERE oi.shop_id = ? AND o.status='closed' AND oi.deleted_at IS NULL
     GROUP BY oi.product_id, p.name
     ORDER BY qty_sold DESC
     LIMIT 20`,
    [shop_id]
  );
  return res.json({ data: rows });
}

async function lowStock(req, res) {
  const { shop_id } = req.auth;
  const [rows] = await db.query(
    `SELECT id, name, stock_quantity, low_stock_threshold
     FROM products
     WHERE shop_id = ? AND deleted_at IS NULL AND stock_quantity <= low_stock_threshold
     ORDER BY stock_quantity ASC`,
    [shop_id]
  );
  return res.json({ data: rows });
}

module.exports = {
  summary,
  products: pagedList('products'),
  clients: pagedList('clients'),
  suppliers: pagedList('suppliers'),
  orders,
  profitByEmployee,
  topProducts,
  lowStock
};

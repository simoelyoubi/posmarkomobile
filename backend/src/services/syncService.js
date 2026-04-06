const db = require('../db');
const { chooseWinner } = require('./conflictService');

const ENTITIES = [
  'categories',
  'products',
  'clients',
  'suppliers',
  'employees',
  'expenses',
  'orders',
  'order_items'
];

async function uploadChanges(shopId, terminalId, changesByEntity) {
  const conn = await db.getConnection();
  const accepted = {};

  try {
    await conn.beginTransaction();

    for (const entity of ENTITIES) {
      const rows = changesByEntity[entity] || [];
      accepted[entity] = [];

      for (const row of rows) {
        const [existingRows] = await conn.query(
          `SELECT * FROM ${entity} WHERE id = ? AND shop_id = ? LIMIT 1`,
          [row.id, shopId]
        );
        const cloudRow = existingRows[0];

        const verdict = chooseWinner(row, cloudRow, entity);
        if (verdict.winner !== 'local') continue;

        const payload = { ...row, shop_id: shopId, terminal_id: terminalId, sync_status: 'synced' };

        const fields = Object.keys(payload);
        const placeholders = fields.map(() => '?').join(', ');
        const updates = fields.map((f) => `${f} = VALUES(${f})`).join(', ');

        await conn.query(
          `INSERT INTO ${entity} (${fields.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
          Object.values(payload)
        );

        accepted[entity].push({ id: row.id, result: 'upserted', reason: verdict.reason });
      }
    }

    await conn.commit();
    return { accepted };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function downloadChanges(shopId, sinceCursor) {
  const cursor = sinceCursor || '1970-01-01T00:00:00.000Z';
  const changes = {};

  for (const entity of ENTITIES) {
    const [rows] = await db.query(
      `SELECT * FROM ${entity} WHERE shop_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 5000`,
      [shopId, cursor]
    );
    changes[entity] = rows;
  }

  return {
    cursor: new Date().toISOString(),
    changes
  };
}

module.exports = { uploadChanges, downloadChanges, ENTITIES };

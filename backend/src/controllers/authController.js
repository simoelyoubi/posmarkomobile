const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');

async function registerTerminal(req, res) {
  const { shop_slug, terminal_name, activation_code } = req.body;
  const [shops] = await db.query('SELECT * FROM shops WHERE slug = ? AND activation_code = ? LIMIT 1', [shop_slug, activation_code]);
  const shop = shops[0];
  if (!shop) return res.status(403).json({ error: 'Invalid shop or activation code' });

  const terminalId = uuid();
  const apiSecret = uuid();
  const apiSecretHash = await bcrypt.hash(apiSecret, 12);

  await db.query(
    'INSERT INTO terminals (id, shop_id, name, secret_hash, status, last_seen_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [terminalId, shop.id, terminal_name, apiSecretHash, 'active']
  );

  return res.json({ terminal_id: terminalId, terminal_secret: apiSecret });
}

async function login(req, res) {
  const { terminal_id, terminal_secret } = req.body;
  const [rows] = await db.query('SELECT * FROM terminals WHERE id = ? AND status = ? LIMIT 1', [terminal_id, 'active']);
  const terminal = rows[0];
  if (!terminal) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(terminal_secret, terminal.secret_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await db.query('UPDATE terminals SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?', [terminal.id]);

  const token = jwt.sign(
    {
      terminal_id: terminal.id,
      shop_id: terminal.shop_id,
      role: 'terminal'
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '8h' }
  );

  return res.json({ access_token: token, shop_id: terminal.shop_id, terminal_id: terminal.id });
}

module.exports = { registerTerminal, login };

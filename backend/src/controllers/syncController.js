const { uploadChanges, downloadChanges } = require('../services/syncService');

async function upload(req, res) {
  const { shop_id, terminal_id } = req.auth;
  const { changes } = req.body;

  if (!changes || typeof changes !== 'object') {
    return res.status(400).json({ error: 'changes object is required' });
  }

  const result = await uploadChanges(shop_id, terminal_id, changes);
  return res.json({ ok: true, ...result });
}

async function download(req, res) {
  const { shop_id } = req.auth;
  const { cursor } = req.body;

  const result = await downloadChanges(shop_id, cursor);
  return res.json({ ok: true, ...result });
}

module.exports = { upload, download };

const express = require('express');
const { upload, download } = require('../controllers/syncController');
const { requireTerminalAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/upload', requireTerminalAuth, upload);
router.post('/download', requireTerminalAuth, download);

module.exports = router;

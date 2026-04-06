const express = require('express');
const { login, registerTerminal } = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);
router.post('/register-terminal', registerTerminal);

module.exports = router;

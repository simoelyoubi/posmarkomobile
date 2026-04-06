const express = require('express');
const c = require('../controllers/dashboardController');
const { requireTerminalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireTerminalAuth);
router.get('/summary', c.summary);
router.get('/products', c.products);
router.get('/clients', c.clients);
router.get('/suppliers', c.suppliers);
router.get('/orders', c.orders);
router.get('/reports/profit-by-employee', c.profitByEmployee);
router.get('/reports/top-products', c.topProducts);
router.get('/reports/low-stock', c.lowStock);

module.exports = router;

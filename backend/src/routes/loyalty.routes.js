const express = require('express');
const router = express.Router();
const { earnPoint, getCustomers } = require('../controllers/loyalty.controller');
const { authenticateAdmin } = require('../middleware/auth.middleware');

router.post('/earn', earnPoint);
router.get('/customers', authenticateAdmin, getCustomers);

module.exports = router;

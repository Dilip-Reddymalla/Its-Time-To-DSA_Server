const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/profile', userController.getProfile);
router.post('/update', userController.updateProfile);
router.post('/request-pause', userController.requestPause);

module.exports = router;

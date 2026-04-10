const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problemController');

router.get('/', problemController.getProblems);
router.get('/filters', problemController.getFilterData);
router.get('/validate-lc/:slug', problemController.validateLeetcodeSlug);

module.exports = router;

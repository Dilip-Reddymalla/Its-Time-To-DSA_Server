const express = require('express');
const { getToday, getDayByNumber, getOverview, getFullSchedule, replaceProblem } = require('../controllers/scheduleController');
 
const router = express.Router();
 
router.get('/today', getToday);
router.get('/full', getFullSchedule);
router.get('/overview', getOverview);
router.get('/day/:n', getDayByNumber);
router.post('/replace-problem', replaceProblem);
 
module.exports = router;

const express = require('express');
const { getToday, getDayByNumber, getOverview, getFullSchedule } = require('../controllers/scheduleController');
 
const router = express.Router();
 
router.get('/today', getToday);
router.get('/full', getFullSchedule);
router.get('/overview', getOverview);
router.get('/day/:n', getDayByNumber);
 
module.exports = router;

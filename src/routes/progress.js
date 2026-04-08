const express = require('express');
const { body } = require('express-validator');
const {
  getAllProgress,
  getTodayProgress,
  markProblem,
  addNote,
  toggleBookmark,
} = require('../controllers/progressController');

const router = express.Router();

router.get('/', getAllProgress);
router.get('/today', getTodayProgress);

router.patch(
  '/mark',
  [body('problemId').notEmpty().isMongoId(), body('solved').isBoolean()],
  markProblem
);

router.post(
  '/note',
  [body('problemId').notEmpty().isMongoId(), body('text').isString()],
  addNote
);

router.post(
  '/bookmark',
  [body('problemId').notEmpty().isMongoId()],
  toggleBookmark
);

module.exports = router;

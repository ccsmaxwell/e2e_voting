var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'CUHK FYP LYU1803' });
});

module.exports = router;

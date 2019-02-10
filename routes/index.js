var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
	res.render('index');
});

router.get('/vote', function(req, res, next) {
	res.render('vote');
});

router.get('/result', function(req, res, next) {
	res.render('result');
});

module.exports = router;
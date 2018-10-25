var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
	res.render('index', { title: 'CUHK FYP LYU1803' });
});

router.get('/createElection', function(req, res, next) {
	res.render('createElection');
});

router.get('/vote', function(req, res, next) {
	res.render('vote');
});

module.exports = router;

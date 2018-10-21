var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
	res.render('index', { title: 'CUHK FYP LYU1803' });
});

router.get('/createElection', function(req, res, next) {
	res.render('createElection');
});

module.exports = router;

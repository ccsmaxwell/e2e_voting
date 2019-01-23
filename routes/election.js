var express = require('express');
var router = express.Router({strict: true});

var Election = require('../controllers/election');

router.get('/create', function(req, res, next) {
	res.render('eCreate');
});
router.post('/create', Election.create);
router.get('/manage/:electionID', Election.getManage);
router.get('/manage/:electionID/details', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/details', function(req, res, next) {
	// res.render('createDetails');
});
router.get('/manage/:electionID/questions', Election.getManageQuestion);
router.post('/manage/:electionID/questions', Election.editQuestion);
router.get('/manage/:electionID/voters', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/voters', function(req, res, next) {
	// res.render('createDetails');
});
router.get('/manage/:electionID/trustees', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/trustees', function(req, res, next) {
	// res.render('createDetails');
});
router.get('/manage/:electionID/servers', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/servers', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/freeze', function(req, res, next) {
	// res.render('createDetails');
});

router.get('/getDetails', Election.getDetails);
router.post('/getResult', Election.getResult);
router.get('/getAllElection', Election.getAllElection);

module.exports = router;
var express = require('express');
var router = express.Router({strict: true});

var Election = require('../controllers/election');

router.get('/create', function(req, res, next) {
	res.render('eCreate', {create: true});
});
router.post('/create', Election.create);
router.get('/manage/:electionID', Election.getManage);
router.get('/manage/:electionID/details', Election.getManageDetail);
router.post('/manage/:electionID/details', Election.editDetail);
router.get('/manage/:electionID/questions', Election.getManageQuestion);
router.post('/manage/:electionID/questions', Election.editQuestion);
router.get('/manage/:electionID/servers', Election.getManageServer);
router.post('/manage/:electionID/servers', Election.editServer);
router.get('/manage/:electionID/voters', function(req, res, next) {
	res.render('eManVoter');
});
router.get('/manage/:electionID/voters/list', Election.getManageVoterList);
router.post('/manage/:electionID/voters/add-request', Election.addVoterReq);
router.post('/manage/:electionID/voters/add-confirm', function(req, res, next) {});
router.post('/manage/:electionID/voters/del', function(req, res, next) {});
router.get('/manage/:electionID/trustees', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/trustees', function(req, res, next) {
	// res.render('createDetails');
});
router.post('/manage/:electionID/freeze', function(req, res, next) {
	// res.render('createDetails');
});

router.get('/getDetails', Election.getDetails);
router.post('/getResult', Election.getResult);
router.get('/getAllElection', Election.getAllElection);

module.exports = router;
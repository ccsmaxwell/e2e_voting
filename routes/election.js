var express = require('express');
var router = express.Router();

var Election = require('../controllers/election');

router.get('/create', function(req, res, next) {
	res.render('createDetails');
});

router.post('/create', Election.create);
router.get('/getDetails', Election.getDetails);
router.post('/getResult', Election.getResult);
router.get('/getAllElection', Election.getAllElection);

module.exports = router;
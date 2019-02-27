var express = require('express');
var router = express.Router();

var Ballot = require('../controllers/ballot');

router.get('/prepare/:electionID', Ballot.verifyMiddleware, Ballot.getEmptyBallot);
router.post('/submit', Ballot.verifyMiddleware, Ballot.ballotSubmit);

router.post('/broadcast', Ballot.verifyMiddleware, Ballot.ballotReceive);
router.post('/broadcast/sign', Ballot.signReceive);

module.exports = router;
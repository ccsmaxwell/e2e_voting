var express = require('express');
var router = express.Router();

var Ballot = require('../controllers/ballot');

router.get('/prepare/:electionID', Ballot.getEmptyBallot);
router.post('/submit', Ballot.voterSubmit);

router.post('/broadcastBallot', Ballot.ballotReceive);
router.post('/broadcastSign', Ballot.signReceive);

module.exports = router;
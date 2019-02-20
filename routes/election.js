var express = require('express');
var router = express.Router({strict: true});

var Election = require('../controllers/election');

router.get('/create', (req, res, next) => res.render('eCreate', {create: true}));
router.post('/create', Election.create);

router.get('/manage/:electionID', Election.getManage);
router.get('/manage/:electionID/indexStat', Election.getManageStat);

router.get('/manage/:electionID/details', Election.getManageDetail);
router.post('/manage/:electionID/details', Election.editDetail);

router.get('/manage/:electionID/questions', Election.getManageQuestion);
router.post('/manage/:electionID/questions', Election.editQuestion);

router.get('/manage/:electionID/servers', Election.getManageServer);
router.post('/manage/:electionID/servers', Election.editServer);

router.get('/manage/:electionID/voters', (req, res, next) => res.render('eManVoter'));
router.get('/manage/:electionID/voters/list', Election.getManageVoterList);
router.post('/manage/:electionID/voters/add-request', Election.addVoterReq);
router.post('/manage/:electionID/voters/add-confirm', Election.addVoterConfirm);
router.post('/manage/:electionID/voters/del', Election.delVoter);
router.get('/manage/:electionID/voters/changeKey', (req, res, next) => res.render('eKeyVoter'));
router.post('/manage/:electionID/voters/changeKey', Election.voterKeyChangeReq);

router.get('/manage/:electionID/trustees', (req, res, next) => res.render('eManTrustee'));
router.get('/manage/:electionID/trustees/list', Election.getManageTrusteeList);
router.post('/manage/:electionID/trustees/add-request', Election.addTrusteeReq);
router.post('/manage/:electionID/trustees/add-confirm', Election.addTrusteeConfirm);
router.post('/manage/:electionID/trustees/del', Election.delTrustee);
router.get('/manage/:electionID/trustees/changeKey', Election.getForTrusteeChangeKey);
router.post('/manage/:electionID/trustees/changeKey', Election.trusteeKeyChangeReq);

router.post('/manage/:electionID/freeze-request', Election.freezeReq);
router.post('/manage/:electionID/freeze-confirm', Election.freezeConfirm);

router.get('/:electionID', Election.getIndex);

router.get('/:electionID/voters', (req, res, next) => res.render('eVoter'));
router.get('/:electionID/voters/list', Election.getVoterList);

router.post('/tally/:electionID/end-election', Election.endElection);
router.post('/tally/:electionID/start-tally-request', Election.tallyReq);
router.post('/tally/:electionID/start-tally-confirm', Election.tallyConfirm);
// router.post('/tally/:electionID/decrypt', Election.getVoterList);

// router.get('/tally/:electionID/trustee-decrypt', Election.getVoterList);
// router.post('/tally/:electionID/trustee-decrypt', Election.getVoterList);

router.post('/getResult', Election.getResult);
router.get('/getAllElection', Election.getAllElection);

module.exports = router;
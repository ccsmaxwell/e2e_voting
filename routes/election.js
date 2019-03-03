var express = require('express');
var router = express.Router({strict: true});

var Election = require('../controllers/election');

router.get('/create', (req, res, next) => res.render('eCreate', {create: true}));
router.post('/create', Election.create);

router.get('/manage/:electionID', Election.managePageMiddleware, Election.getManage);
router.get('/manage/:electionID/indexStat', Election.managePageMiddleware, Election.getManageStat);

router.get('/manage/:electionID/details', Election.managePageMiddleware, Election.getManageDetail);
router.post('/manage/:electionID/details', Election.managePageMiddleware, Election.editDetail);

router.get('/manage/:electionID/questions', Election.managePageMiddleware, Election.getManageQuestion);
router.post('/manage/:electionID/questions', Election.managePageMiddleware, Election.editQuestion);

router.get('/manage/:electionID/servers', Election.managePageMiddleware, Election.getManageServer);
router.post('/manage/:electionID/servers', Election.managePageMiddleware, Election.editServer);

router.get('/manage/:electionID/voters', Election.managePageMiddleware, (req, res, next) => res.render('eManVoter'));
router.get('/manage/:electionID/voters/list', Election.managePageMiddleware, Election.getManageVoterList);
router.post('/manage/:electionID/voters/add-request', Election.managePageMiddleware, Election.addVoterReq);
router.post('/manage/:electionID/voters/add-confirm', Election.managePageMiddleware, Election.addVoterConfirm);
router.post('/manage/:electionID/voters/del', Election.managePageMiddleware, Election.delVoter);
router.get('/manage/:electionID/voters/changeKey', Election.managePageMiddleware, (req, res, next) => res.render('eKeyVoter'));
router.post('/manage/:electionID/voters/changeKey', Election.managePageMiddleware, Election.voterKeyChangeReq);

router.get('/manage/:electionID/trustees', Election.managePageMiddleware, (req, res, next) => res.render('eManTrustee'));
router.get('/manage/:electionID/trustees/list', Election.managePageMiddleware, Election.getManageTrusteeList);
router.post('/manage/:electionID/trustees/add-request', Election.managePageMiddleware, Election.addTrusteeReq);
router.post('/manage/:electionID/trustees/add-confirm', Election.managePageMiddleware, Election.addTrusteeConfirm);
router.post('/manage/:electionID/trustees/del', Election.managePageMiddleware, Election.delTrustee);
router.get('/manage/:electionID/trustees/changeKey', Election.managePageMiddleware, Election.getForTrusteeChangeKey);
router.post('/manage/:electionID/trustees/changeKey', Election.managePageMiddleware, Election.trusteeKeyChangeReq);

router.post('/manage/:electionID/freeze-request', Election.managePageMiddleware, Election.freezeReq);
router.post('/manage/:electionID/freeze-confirm', Election.managePageMiddleware, Election.freezeConfirm);

router.get('/:electionID', Election.electionPageMiddleware, Election.getIndex);
router.get('/:electionID/indexInfo', Election.electionPageMiddleware, Election.getIndexInfo);

router.get('/:electionID/voters', Election.electionPageMiddleware, (req, res, next) => res.render('eVoter'));
router.get('/:electionID/voters/list', Election.electionPageMiddleware, Election.getVoterList);

router.get('/:electionID/performance', Election.electionPageMiddleware, (req, res, next) => res.render('ePerformance'));
router.get('/:electionID/performance/data', Election.electionPageMiddleware, Election.getForChart);

router.post('/tally/:electionID/end-election', Election.electionPageMiddleware, Election.endElection);
router.post('/tally/:electionID/start-tally-request', Election.tallyPageMiddleware, Election.tallyReq);
router.post('/tally/:electionID/start-tally-confirm', Election.tallyPageMiddleware, Election.tallyConfirm);
router.post('/tally/:electionID/decrypt-request', Election.tallyPageMiddleware, Election.decryptReq);

router.get('/tally/:electionID/trustee-decrypt', Election.tallyPageMiddleware, Election.getForTrusteeDecrypt);
router.post('/tally/:electionID/trustee-decrypt', Election.tallyPageMiddleware, Election.trusteeSubmitDecrypt);

router.get('/tally/:electionID/result', Election.tallyPageMiddleware, Election.getResult);

module.exports = router;
var express = require('express');
var router = express.Router();

var Blockchain = require('../controllers/blockchain');

router.post('/sync/electionFreeze', Blockchain.syncAfterFreeze);

router.post('/broadcast/bftSelection', Blockchain.bftReceive);
router.post('/broadcast/block', Blockchain.blockReceive);
router.post('/broadcast/sign', Blockchain.signReceive);

router.get('/getBlock', Blockchain.getBlock);

module.exports = router;
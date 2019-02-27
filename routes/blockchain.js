var express = require('express');
var router = express.Router();

var Blockchain = require('../controllers/blockchain');

router.post('/broadcast/bftSelection', Blockchain.bftReceive);
router.post('/broadcast/block', Blockchain.blockReceive);
router.post('/broadcast/sign', Blockchain.signReceive);

router.get('/all-blocks', Blockchain.getAllBlocks);

router.post('/sync/election-freeze', Blockchain.syncAfterFreeze);
router.get('/sync/all-election', Blockchain.getAllElectionForSync);

module.exports = router;
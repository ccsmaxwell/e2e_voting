var express = require('express');
var router = express.Router();

var Blockchain = require('../controllers/blockchain');

router.post('/sync/electionFreeze', Blockchain.syncAfterFreeze);

router.post('/broadcastSelection', Blockchain.bftReceive);
router.post('/broadcastBlock', Blockchain.blockReceive);
router.post('/broadcastSign', Blockchain.signReceive);
router.get('/getBlock', Blockchain.getBlock);

module.exports = router;
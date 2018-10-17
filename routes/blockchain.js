var express = require('express');
var router = express.Router();

var Blockchain = require('../controllers/blockchain');

router.post('/broadcastBlock', Blockchain.blockReceive);
router.post('/broadcastSign', Blockchain.signReceive);

module.exports = router;
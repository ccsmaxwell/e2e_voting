var express = require('express');
var router = express.Router();

var Handshake = require('../controllers/handshake');

router.get('/connect', Handshake.connectRequest);
router.get('/ping', Handshake.pingRequest);

module.exports = router;
var express = require('express');
var router = express.Router();

var Election = require('../controllers/election');

router.post('/create', Election.create);

module.exports = router;
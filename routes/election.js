var express = require('express');
var router = express.Router();

var Election = require('../controllers/election');

router.post('/create', Election.create);
router.get('/getDetails', Election.getDetails);
router.post('/getAllResult', Election.getAllResult);

module.exports = router;
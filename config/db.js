var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/fyp_voting_'+(process.env.PORT+"").trim(), { useNewUrlParser: true });

var Node_server = require('../models/node_server');
Node_server.collection.drop(function(err, result){
	// console.log(err);
	// console.log(result);
});

module.exports = mongoose;
var child_process = require('child_process');

var ballotChild = []

module.exports = {

	init: function(){
		ballotChild.push(child_process.fork('./ballotHandle', [JSON.stringify(_config)], {cwd: './controllers/childProcess'}));
	},

	getEmptyBallot: function(req, res, next){
		ballotChild[0].send({
			func: "getEmptyBallot",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	ballotSubmit: function(req, res, next){
		ballotChild[0].send({
			func: "ballotSubmit",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	ballotReceive: function(req, res, next){
		ballotChild[0].send({
			func: "ballotReceive",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	signReceive: function(req, res, next){
		ballotChild[0].send({
			func: "signReceive",
			params: req.params,
			body: req.body
		}, res.socket)
	}

}
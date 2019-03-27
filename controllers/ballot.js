var child_process = require('child_process');
var os = require('os');

var ballotChild = []
var roundRobin = 0;
const processCount = os.cpus().length>1 ? os.cpus().length-1 : 1;

module.exports = {

	init: function(){
		var autoRestart = function(index){
			ballotChild[index] = child_process.fork('./ballotHandle', [JSON.stringify(_config)], {cwd: './controllers/childProcess'});
			console.log("Fork Ballot child process "+index);
			ballotChild[index].on('exit', function(){
				console.log("Ballot child process "+index+" exited. Restart in 5 seconds.");
				setTimeout(() => autoRestart(index), 5000);
			})
		}

		for(let i=0; i<processCount; i++){
			ballotChild.push(null);
			autoRestart(i);
		}
	},

	getEmptyBallot: function(req, res, next){
		roundRobin = (roundRobin+1)%processCount;
		ballotChild[roundRobin].send({
			func: "getEmptyBallot",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	ballotSubmit: function(req, res, next){
		roundRobin = (roundRobin+1)%processCount;
		ballotChild[roundRobin].send({
			func: "ballotSubmit",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	ballotReceive: function(req, res, next){
		roundRobin = (roundRobin+1)%processCount;
		ballotChild[roundRobin].send({
			func: "ballotReceive",
			params: req.params,
			body: req.body
		}, res.socket)
	},

	signReceive: function(req, res, next){
		roundRobin = (roundRobin+1)%processCount;
		ballotChild[roundRobin].send({
			func: "signReceive",
			params: req.params,
			body: req.body
		}, res.socket)
	}

}
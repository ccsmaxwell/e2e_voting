var prompt = require('prompt');
var request = require('request');
var chalk = require('chalk');

var Node_server = require('../models/node_server');

var blockChainController = require('./blockchain');

var connection = require('./lib/connection');

const pingInterval = _config.pingInterval;

module.exports = {

	init: function(){	
		var myAddr = connection.getSelfAddr();

		module.exports.updateNode(myAddr.IP, myAddr.port, function(){
			ping();

			prompt.start();
			prompt.get(['Address'], function (err, input) {
				if(err){
					console.log(err)
				}else if(input.Address != ""){
					connection.sendRequest("GET", input.Address, "/handshake/connect", {
						IP: myAddr.IP,
						Port: myAddr.port
					}, function(data){
						current_nodes = JSON.parse(data);

						let promArr = []
						current_nodes.forEach(function(e){
							promArr.push(new Promise(function(resolve, reject){
								module.exports.updateNode(e.IP, e.port, function(){
									resolve();
								});
							}));
						});

						Promise.all(promArr).then(function(){
							console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Receive address book:"), chalk.grey(data));
							ping();
							setInterval(ping, pingInterval);
						})							
					}, null);

					blockChainController.syncAllChain(input.Address);
				}else{
					setInterval(ping, pingInterval);
				}
			});
		});
		
		var ping = function(){
			var myAddr = connection.getSelfAddr();

			connection.broadcast("GET", "/handshake/ping", {
				IP: myAddr.IP,
				Port: myAddr.port
			}, null, function(eIP, ePort, myIP, myPort, err){
				Node_server.deleteOne({
					IP: eIP,
					port: ePort
				}).then(function(result){
					if(err.code != 'ECONNREFUSED'){
						console.log(err);
					}
					console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("Ping fail & deleted: "), chalk.grey(eIP+":"+ePort));
				}).catch(function(err){
					console.log(err);
				})
			}, null);
		}
	},

	connectRequest: function(req, res, next){
		console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Connect request: "), chalk.grey(req.body.IP+":"+req.body.Port));

		Node_server.find({}).then(function(allNodes){
			module.exports.updateNode(req.body.IP, req.body.Port, function(){
				res.json(allNodes);
			});
		}).catch(function(err){
			console.log(err);
		})
	},

	pingRequest: function(req, res, next){
		module.exports.updateNode(req.body.IP, req.body.Port, function(){
			res.json({success: true});
		});
	},

	updateNode: function(ip, port, successCallback){
		Node_server.findOneAndUpdate({
			IP: ip,
			port: port
		}, {}, {
			upsert: true
		}).then(function(result){
			if(successCallback){
				successCallback();
			}
		}).catch(function(err){
			console.log(err);
		})
	}

}
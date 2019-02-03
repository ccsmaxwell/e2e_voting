var prompt = require('prompt');
var chalk = require('chalk');

var Node_server = require('../models/node_server');

var blockChainController = require('./blockchain');

var connection = require('./lib/connection');

const {pingInterval, serverID, serverPubKey, instanceID} = _config;

module.exports = {

	init: function(){	
		var myAddr = connection.getSelfAddr();

		module.exports.updateNode(myAddr.IP, myAddr.port, serverID, serverPubKey, function(){
			module.exports.pingAll(true);

			prompt.start();
			prompt.get(['Address'], function (err, input) {
				if(err){
					console.log(err)
				}else if(input.Address != ""){
					connection.sendRequest("GET", input.Address, "/handshake/connect", {
						IP: myAddr.IP,
						Port: myAddr.port
					}, true, function(data){
						current_nodes = JSON.parse(data);

						let promArr = []
						current_nodes.forEach(function(e){
							promArr.push(new Promise(function(resolve, reject){
								module.exports.updateNode(e.IP, e.port, null, null, resolve);
							}));
						});

						Promise.all(promArr).then(function(){
							console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Receive address book:"), chalk.grey(data));
							module.exports.pingAll(true);
							setInterval(() => module.exports.pingAll(false), pingInterval);
						})							
					}, null);

					// blockChainController.syncAllChain(input.Address);
				}else{
					setInterval(() => module.exports.pingAll(false), pingInterval);
				}
			});
		});
	},

	connectRequest: function(req, res, next){
		console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Connect request: "), chalk.grey(req.body.IP+":"+req.body.Port));

		Node_server.find({}).then(function(allNodes){
			module.exports.updateNode(req.body.IP, req.body.Port, null, null, function(){
				res.json(allNodes);
			});
		}).catch(function(err){
			console.log(err);
		})
	},

	pingRequest: function(req, res, next){
		if(req.body.instanceID == instanceID){
			res.json({sameNode: true});
		}else{
			module.exports.updateNode(req.body.IP, req.body.Port, null, null, function(){
				res.json({sameNode: false});
			});
		}
	},

	pingAll: function(withKey){
		var myAddr = connection.getSelfAddr();
		var form = {
			IP: myAddr.IP,
			Port: myAddr.port,
			instanceID: instanceID
		}
		if(withKey){
			form["serverKey"] = serverPubKey
		}

		connection.broadcast("GET", "/handshake/ping", form, true, null, function(eIP, ePort, myIP, myPort, data){
			let sameNode = JSON.parse(data).sameNode;

			if(sameNode){
				module.exports.deleteNode(eIP, ePort, null);
			}
		}, function(eIP, ePort, myIP, myPort, err){
			if(err.code != 'ECONNREFUSED'){
				console.log(err);
			}

			module.exports.deleteNode(eIP, ePort, function(){
				console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("Ping fail & deleted: "), chalk.grey(eIP+":"+ePort));
			})
		}, null);
	},

	updateNode: function(ip, port, serverID, serverKey, successCallback){
		var edit = {}
		if(serverID){
			edit["serverID"] = serverID;
		}
		if(serverKey){
			edit["serverKey"] = serverKey;
		}

		Node_server.findOneAndUpdate({
			IP: ip,
			port: port
		}, edit, {
			upsert: true
		}).then(function(result){
			if(successCallback){
				successCallback();
			}
		}).catch((err) => console.log(err))
	},

	deleteNode: function(ip, port, successCallback){
		Node_server.deleteOne({
			IP: ip,
			port: port
		}).then(function(result){
			if(successCallback){
				successCallback();
			}
		}).catch((err) => console.log(err))
	}

}
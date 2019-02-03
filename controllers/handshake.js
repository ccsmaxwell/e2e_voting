var prompt = require('prompt');
var chalk = require('chalk');
var crypto = require('crypto');
var stringify = require('fast-json-stable-stringify');

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
						Port: myAddr.port,
						serverKey: serverPubKey
					}, true, function(data){
						current_nodes = JSON.parse(data);

						let promArr = []
						current_nodes.forEach(function(e){
							promArr.push(new Promise(function(resolve, reject){
								module.exports.updateNode(e.IP, e.port, e.serverID, e.serverKey, resolve);
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
		var data = req.body;
		console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Connect request: "), chalk.grey(data.IP+":"+data.Port));

		var serverID = crypto.createHash('sha256').update(data.serverKey.split("-----")[2].replace(/[\r\n]*/g,'')).digest('base64');
		if(serverID != data.serverID){
			return console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("server ID verification fail."));
		}

		var verifyData = {
			IP: data.IP,
			Port: data.Port,
			serverKey: data.serverKey,
			serverID: data.serverID
		}
		if(!module.exports.verifyRsaSign(stringify(verifyData), data.serverKey, data.serverSign)){
			return console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("Server sign verification fail."));
		}

		Node_server.find({}).then(function(allNodes){
			module.exports.updateNode(data.IP, data.Port, data.serverID, data.serverKey, function(){
				res.json(allNodes);
			});
		}).catch((err) => console.log(err))
	},

	pingRequest: function(req, res, next){
		var data = req.body;
		if(data.instanceID == instanceID){
			return res.json({sameNode: true});
		}

		module.exports.findByServerID(data.serverID, function(result){
			if(!data.serverKey && !result[0].serverKey){
				return res.json({sameNode: false, needKey: true});
			}

			var verifyData = {
				IP: data.IP,
				Port: data.Port,
				instanceID: data.instanceID,
				serverID: data.serverID
			}
			if(data.serverKey){
				verifyData["serverKey"] = data.serverKey
			}
			if(!module.exports.verifyRsaSign(stringify(verifyData), data.serverKey || result[0].serverKey, data.serverSign)){
				return console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("Ping: server sign verification fail."));
			}

			module.exports.updateNode(data.IP, data.Port, data.serverID, data.serverKey, null);
			res.json({sameNode: false, needKey: false});
		})
	},

	pingAll: function(withKey){
		var myAddr = connection.getSelfAddr();
		module.exports.updateNode(myAddr.IP, myAddr.port, serverID, serverPubKey, null);

		var form = {
			IP: myAddr.IP,
			Port: myAddr.port,
			instanceID: instanceID
		}
		if(withKey){
			form["serverKey"] = serverPubKey
		}

		connection.broadcast("GET", "/handshake/ping", form, true, null, function(eIP, ePort, myIP, myPort, data){
			data = JSON.parse(data);

			if(data.sameNode){
				return module.exports.deleteNode(eIP, ePort, null);
			}
			if(data.needKey){
				console.log(chalk.black.bgGreenBright("[Handshake]"), `Key request from: ${eIP}:${ePort}`);
				form["serverKey"] = serverPubKey
				delete form.serverSign
				connection.sendRequest("GET", `${eIP}:${ePort}`, "/handshake/ping", form, true, null, null);
			}
		}, function(eIP, ePort, myIP, myPort, err){
			if(err.code != 'ECONNREFUSED' && err.code != 'ETIMEDOUT'){
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
	},

	findByServerID: function(serverID, successCallback){
		Node_server.find({
			serverID: serverID
		}).then(successCallback).catch((err) => console.log(err))
	},

	verifyRsaSign: function(data, key, sign){
		var verify = crypto.createVerify('SHA256');
		verify.update(data);
		return verify.verify(key, sign, "base64");
	}

}
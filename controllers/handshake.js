var prompt = require('prompt');
var request = require('request');
var chalk = require('chalk');

var Block = require('../models/block');
var Node_server = require('../models/node_server');

var blockChainController = require('./blockchain');

var connection = require('./lib/connection');

const pingInterval = 60000;

module.exports = {

	init: function(){
		var getAddrData = function(pingCallback){
			var myAddr = connection.getSelfAddr();

			module.exports.updateNode(myAddr.IP, myAddr.port, function(){
				pingCallback();

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
								pingCallback();
								setInterval(pingCallback, pingInterval);
							})							
						}, null);

						let remoteList = [];
						let localListObj = {};
						let promReq = new Promise(function(resolve, reject){
							connection.sendRequest("GET", input.Address, "/election/getAllElection", {}, function(data){
								remoteList = JSON.parse(data);
								resolve();
							}, function(err){
								console.log(err);
								reject();
							});
						})
						let promDb = Block.aggregate([
							{$group: {
								_id: "$electionID",
								"maxSeq": {$max:"$blockSeq"}
							}}
						]).then(function(result){
							result.forEach(function(e){
								localListObj[e._id] = e.maxSeq;
							})
						}).catch(function(err){
							console.log(err)
						})

						Promise.all([promReq, promDb]).then(function(result){
							remoteList.forEach(function(e){
								let fromSeq = -1;
								if(!localListObj[e._id]){
									fromSeq = 0;
								}else if(localListObj[e._id] < e.maxSeq){
									fromSeq = localListObj[e._id] + 1;
								}

								if(fromSeq >= 0){
									console.log(chalk.bgBlue("[Block]"), chalk.whiteBright("Found an Election not yet sync:"), chalk.grey(e._id));
									connection.sendRequest("GET", input.Address, "/blockchain/getBlock", {
										electionID: e._id,
										fromSeq: fromSeq,
										toSeq: e.maxSeq
									}, function(data){
										blockArr = JSON.parse(data);

										var recursiveAdd = function(blockArr){
											if(blockArr.length){
												blockChainController.blockReceiveProcess(blockArr[0], recursiveAdd(blockArr.splice(1)));
											}
										}
										recursiveAdd(blockArr);
									}, null);
								}
							})
						}).catch(function(err){
							console.log(err);
						})
					}else{
						setInterval(pingCallback, pingInterval);
					}
				});				
			});
		};

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

		getAddrData(ping);
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
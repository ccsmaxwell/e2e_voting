var prompt = require('prompt');
var request = require('request');
var ip = require('ip');
var chalk = require('chalk');

var Node_server = require('../models/node_server');

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
						request.get({
							url:"http://"+input.Address+"/handshake/connect", form:{
								IP: myAddr.IP,
								Port: myAddr.port
							}
						}).on('data', function(data){
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
						}).on('error', function(err){
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
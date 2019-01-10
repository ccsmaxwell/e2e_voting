var prompt = require('prompt');
var request = require('request');
var ip = require('ip');
var chalk = require('chalk');

var Node_server = require('../models/node_server');

var connection = require('./lib/connection');

const pingInterval = 60000;

module.exports = {

	init: function(){
		var getAddrData = function(callback){
			var myAddr = connection.getSelfAddr();

			var newNode_server = new Node_server();
			newNode_server.IP = myAddr.IP;
			newNode_server.port = myAddr.port;

			newNode_server.save().then(function(row){
				prompt.start();

				prompt.get(['Address'], function (err, input) {
					if(err){
						console.log(err)
					}else if(input.Address != ""){
						request
							.get({url:"http://"+input.Address+"/handshake/connect", form:{
								IP: myAddr.IP,
								Port: myAddr.port
							}})
							.on('data', function(data){
								current_nodes = JSON.parse(data);

								var newNode_servers = []
								current_nodes.forEach(function(e){
									newNode_servers.push({
										IP: e.IP,
										port: e.port
									})
								})

								Node_server.insertMany(newNode_servers).then(function(result){
									console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.whiteBright("Receive address book:"), chalk.grey(result));

									callback();
									setInterval(callback, pingInterval);
								}).catch(function(err){
									console.log(err);
								})
							})
							.on('error', function(err){
								console.log(err);
							})
					}else{
						setInterval(callback, pingInterval);
					}
				});	
			}).catch(function(err){
				console.log(err);
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

		Node_server.find({}).then(function(result){
			var newNode_server = new Node_server();
			newNode_server.IP = req.body.IP;
			newNode_server.port = req.body.Port;

			newNode_server.save().then(function(row){
				res.json(result);	
			}).catch(function(err){
				console.log(err);
			});
		}).catch(function(err){
			console.log(err);
		})
	},

	pingRequest: function(req, res, next){
		Node_server.findOneAndUpdate({
			IP: req.body.IP,
			port: req.body.Port
		},
		{},
		{upsert: true},
		).then(function(result){
			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})
	}

}
var prompt = require('prompt');
var request = require('request');
var ip = require('ip');
var chalk = require('chalk');

var Node_server = require('../models/node_server');

module.exports = {

	init: function(){
		var getAddrData = function(callback){			
			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			var newNode_server = new Node_server();
			newNode_server.IP = myIP;
			newNode_server.port = myPort;

			newNode_server.save().then(function(row){
				prompt.start();

				prompt.get(['Address'], function (err, input) {
					if(err){
						console.log(err)
					}else if(input.Address != ""){
						request
							.get({url:"http://"+input.Address+"/handshake/connect", form:{
								IP: myIP,
								Port: myPort
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
									setInterval(callback, 60000);
								}).catch(function(err){
									console.log(err);
								})
							})
							.on('error', function(err){
								console.log(err);
							})
					}else{
						setInterval(callback, 60000);
					}
				});	
			}).catch(function(err){
				console.log(err);
			});
		};

		var ping = function(){
			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						// console.log("Pinging: "+e.IP+":"+e.port);

						request
							.get({url:"http://"+e.IP+":"+e.port+"/handshake/ping", form:{
								IP: myIP,
								Port: myPort
							}})
							.on('data', function(data){
								// console.log(data);
							})							
							.on('error', function(err){
								console.log(err);

								Node_server.deleteOne({
									IP: e.IP,
									port: e.port
								}).then(function(result){
									console.log(chalk.black.bgGreenBright("[Handshake]"), chalk.redBright("Ping fail & deleted: "), chalk.grey(e.IP+":"+e.port));
								}).catch(function(err){
									console.log(err);
								})
							})
					}
				})
			});
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
		// console.log("Ping from: "+req.body.IP+":"+req.body.Port);

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
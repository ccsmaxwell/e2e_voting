var request = require('request');
var ip = require('ip');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');

var Node_server = require('../models/node_server');
var Ballot = require('../models/ballot');

module.exports = {

	voterSubmit: function(req, res, next){
		var ballotData = req.body;
		ballotData.ballotID = uuidv4();
		console.log("Receive ballot submitted for: " + ballotData.electionID + ", " + ballotData.choice);
		
		var myIP = ip.address();
		var myPort = (process.env.PORT+"").trim();

		Node_server.find({}).then(function(all_node_server){
			all_node_server.forEach(function(e){
				if (e.IP != myIP || e.port != myPort){
					console.log("Broadcast ballot to: "+e.IP+":"+e.port);

					request
						.post({url:"http://"+e.IP+":"+e.port+"/ballot/broadcastBallot", form:{
							electionID: ballotData.electionID,
							ballotID: ballotData.ballotID,
							choice: ballotData.choice
						}})
						.on('data', function(data){
							// console.log(data);
						})							
						.on('error', function(err){
							console.log(err);
						})
				}
			})
		});

		module.exports.saveAndSignBallot(ballotData);

		res.json({success: true});
	},

	ballotReceive: function(req, res, next){
		var ballotData = req.body;
		console.log("Receive ballot from broadcast: " + ballotData.electionID + ", " + ballotData.choice);

		module.exports.saveAndSignBallot(ballotData);

		res.json({success: true});
	},

	saveAndSignBallot: function(ballotData){
		var newBallot = new Ballot();
		newBallot.electionID = ballotData.electionID;
		newBallot.ballotID = ballotData.ballotID;
		newBallot.choice = ballotData.choice;
		newBallot.save().then(function(row){
			console.log("Saved ballot.");

			var signHash = crypto.createHash('sha256').update(JSON.stringify(ballotData)).digest('base64');
			Ballot.findOneAndUpdate({
				electionID: ballotData.electionID,
				ballotID: ballotData.ballotID
			},{
				$push: {sign: {
					trusteeID: (process.env.PORT+"").trim(),
					signHash: signHash
				}}
			}).then(function(result){
				console.log("Signed ballot: " + ballotData.ballotID);
			}).catch(function(err){
				console.log(err);
			})

			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						console.log("Broadcast sign to: "+e.IP+":"+e.port);

						request
							.post({url:"http://"+e.IP+":"+e.port+"/ballot/broadcastSign", form:{
								electionID: ballotData.electionID,
								ballotID: ballotData.ballotID,
								trusteeID: (process.env.PORT+"").trim(),
								signHash: signHash
							}})
							.on('data', function(data){
								// console.log(data.toString());
							})							
							.on('error', function(err){
								console.log(err);
							})
					}
				})
			});	
		}).catch(function(err){
			console.log(err);
		});	
	},

	signReceive: function(req, res, next){
		var signData = req.body;
		console.log("Receive sign form: " + signData.trusteeID + ", " + signData.ballotID);		

		Ballot.findOneAndUpdate({
			electionID: signData.electionID,
			ballotID: signData.ballotID
		},{
			$push: {sign: {
				trusteeID: signData.trusteeID,
				signHash: signData.signHash
			}}
		},{upsert: true})
		.then(function(result){
			console.log("Saved sign from: " + signData.trusteeID);

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})		
	}

}
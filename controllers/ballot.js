var request = require('request');
var ip = require('ip');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var NodeCache = require( "node-cache" );

var ballotCache = new NodeCache();

var Node_server = require('../models/node_server');
var Ballot = require('../models/ballot');
var Block = require('../models/block');

module.exports = {

	ballotVerification: function(verifyData, voterSign, successCallBack){
		Block.aggregate([
			{$match: {
				"electionID": verifyData.electionID,
				"data.voters.id": verifyData.voterID
			}},
			{$unwind: "$data"},
			{$unwind: "$data.voters"},
			{$match: {"data.voters.id": verifyData.voterID}},
			{$project: {"data.voters": 1}}
		]).then(function(voterBlock){
			var voterPublicKey = voterBlock[0].data.voters.public_key;
			var verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(verifyData));
			var result = verify.verify(voterPublicKey, voterSign, "base64");
			console.log("Ballot verification: " + result);
			if(result){
				successCallBack();
			}
		}).catch(function(err){
			console.log(err);
		})
	},

	saveAndSignBallot: function(ballotData){
		var newBallot = new Ballot();
		newBallot.electionID = ballotData.electionID;
		newBallot.voterID = ballotData.voterID;
		newBallot.answers = ballotData.answers;
		newBallot.voterSign = ballotData.voterSign;
		newBallot.ballotID = ballotData.ballotID;
		newBallot.receiveTime = ballotData.receiveTime;
		newBallot.save().then(function(row){
			console.log("Saved ballot.");

			let cacheSign = ballotCache.get(newBallot.ballotID);
			if(cacheSign){
				ballotCache.del(newBallot.ballotID);
				let pushSign = []
				cacheSign.forEach(function(s){
					pushSign.push({
						trusteeID: s.trusteeID,
						signHash: s.signHash
					})
				})

				Ballot.findOneAndUpdate({
					electionID: ballotData.electionID,
					ballotID: ballotData.ballotID
				},{
					$push: {sign: {
						$each: pushSign
					}}
				}).then(function(result){
					console.log("Saved cache sign.");
				}).catch(function(err){
					console.log(err);
				})
			}

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

	voterSubmit: function(req, res, next){
		var ballotData = req.body;
		ballotData.answers = JSON.parse(ballotData.answers);
		ballotData.ballotID = uuidv4();
		ballotData.receiveTime = new Date();
		console.log("Receive ballot submitted for: " + ballotData.electionID + ", from voter " + ballotData.voterID);

		var verifyData = {
			electionID: ballotData.electionID,
			voterID: ballotData.voterID,
			answers: ballotData.answers,
		}
		module.exports.ballotVerification(verifyData, ballotData.voterSign, function(){
			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						console.log("Broadcast ballot to: "+e.IP+":"+e.port);

						request
							.post({url:"http://"+e.IP+":"+e.port+"/ballot/broadcastBallot", form:{
								electionID: ballotData.electionID,
								voterID: ballotData.voterID,
								answers: JSON.stringify(ballotData.answers),
								voterSign: ballotData.voterSign,
								ballotID: ballotData.ballotID,
								receiveTime: ballotData.receiveTime
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
		});

		res.json({success: true});
	},

	ballotReceive: function(req, res, next){
		var ballotData = req.body;
		ballotData.answers = JSON.parse(ballotData.answers);
		console.log("Receive ballot from broadcast: " + ballotData.electionID + ", from voter " + ballotData.voterID);

		var verifyData = {
			electionID: ballotData.electionID,
			voterID: ballotData.voterID,
			answers: ballotData.answers,
		}
		module.exports.ballotVerification(verifyData, ballotData.voterSign, function(){
			module.exports.saveAndSignBallot(ballotData);
		})

		res.json({success: true});
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
		}).then(function(result){
			if(result){
				console.log("Saved sign from: " + signData.trusteeID);
			}else{
				let allSign = ballotCache.get(signData.ballotID);
				if(!allSign){
					allSign = []
				}
				allSign.push(signData);
				ballotCache.set(signData.ballotID, allSign, 600);
				console.log("Saved sign in cache.")
			}

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})		
	}

}
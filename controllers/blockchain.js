var request = require('request');
var ip = require('ip');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');

var Node_server = require('../models/node_server');
var Ballot = require('../models/ballot');
var Block = require('../models/block');

module.exports = {

	init: function(){
		Block.find({
			blockSeq: 0
		}).then(function(allElection){
			allElection.forEach(function(e){
				setInterval(function(){
					module.exports.generateBlock(e.electionID)
				}, 15000);
			})
		}).catch(function(err){
			console.log(err)
		})
	},

	generateBlock: function(electionID){
		Ballot.find({
			electionID: electionID,
			inBlock: {$ne: true}
		},
		null,
		{
			sort: {"createdAt" : 1}
		}).then(function(allBallot){
			if(allBallot.length > 0){
				Node_server.find({}).sort({
					IP: 1,
					port: 1
				}).then(function(all_node_server){
					// console.log(all_node_server);
					let lastHashArray = new Buffer(allBallot[allBallot.length-1].ballotID, "ascii");
					let lastHash = lastHashArray.reduce(function(acc, curr){return acc + curr}, 0);
					let selectedNode = all_node_server[lastHash%(all_node_server.length)];

					var myIP = ip.address();
					var myPort = (process.env.PORT+"").trim();

					if(selectedNode.IP == myIP && selectedNode.port == myPort){
						Block.find({
							electionID: electionID
						}).sort({
							blockSeq: -1
						}).limit(1).then(function(lastBlock){
							var newBlock_ = {
								blockUUID: uuidv4(),
								electionID: electionID,
								blockSeq: lastBlock[0].blockSeq+1,
								previousHash: lastBlock[0].hash,
								blockType: "Ballot",
								data: []
							};
							allBallot.forEach(function(e){
								newBlock_.data.push({
									electionID: e.electionID,
									voterID: e.voterID,
									answers: e.answers,
									voterSign: e.voterSign,
									ballotID: e.ballotID,
									receiveTime: e.receiveTime,
									sign: e.sign
								})
							});

							var newBlock = new Block();
							Object.keys(newBlock_).forEach(function(key){
								newBlock[key] = newBlock_[key];
							});
							newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
							newBlock_.hash = newBlock.hash;

							console.log("Generate new block:");
							console.log(newBlock);

							newBlock.save().then(function(result){
								all_node_server.forEach(function(e){
									if (e.IP != myIP || e.port != myPort){
										console.log("Broadcast block to: "+e.IP+":"+e.port);

										request
											.post({url:"http://"+e.IP+":"+e.port+"/blockchain/broadcastBlock", form:{
												block: JSON.stringify(newBlock_)
											}})
											.on('data', function(data){
												// console.log(data.toString());
											})							
											.on('error', function(err){
												console.log(err);
											})
									}
								})

								module.exports.signBlock(newBlock_);

								var allBallotID = [];
								allBallot.forEach(function(e){
									allBallotID.push(e.ballotID);
								})
								Ballot.updateMany({
									ballotID: {$in: allBallotID}
								},{
									inBlock: true
								}).then(function(result){
									console.log("Updated ballot 'inBlock'.");
								}).catch(function(err){
									console.log(err);
								})
							}).catch(function(err){
								console.log(err);	
							});
						}).catch(function(err){
							console.log(err);
						})
					}
				}).catch(function(err){
					console.log(err);
				})
			}
		}).catch(function(err){
			console.log(err);
		})
	},

	signBlock: function(block){
		var signHash = crypto.createHash('sha256').update(block.hash).digest('base64');
		Block.findOneAndUpdate({
			electionID: block.electionID,
			blockUUID: block.blockUUID,
		},{
			$push: {sign: {
				trusteeID: (process.env.PORT+"").trim(),
				signHash: signHash
			}}
		}).then(function(result){
			console.log("Signed block: " + block.blockUUID);
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
						.post({url:"http://"+e.IP+":"+e.port+"/blockchain/broadcastSign", form:{
							electionID: block.electionID,
							blockUUID: block.blockUUID,
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
	},

	blockReceive: function(req, res, next){
		var block = JSON.parse(req.body.block);
		console.log("Receive block:" + block);

		var newBlock_ = {
			blockUUID: block.blockUUID,
			electionID: block.electionID,
			blockSeq: block.blockSeq,
			previousHash: block.previousHash,
			blockType: block.blockType,
			data: block.data
		};

		var newBlock = new Block();
		Object.keys(newBlock_).forEach(function(key){
			newBlock[key] = newBlock_[key];
		});
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		newBlock.save().then(function(result){
			module.exports.signBlock(newBlock_);

			if(newBlock_.blockType == "Election Details"){
				setInterval(function(){
					module.exports.generateBlock(newBlock_.electionID)
				}, 15000);
			}else if(newBlock_.blockType == "Ballot"){
				var allBallotID = [];
				newBlock_.data.forEach(function(e){
					allBallotID.push(e.ballotID);
				})
				Ballot.updateMany({
					ballotID: {$in: allBallotID}
				},{
					inBlock: true
				}).then(function(result){
					console.log("Updated ballot 'inBlock'.");
				}).catch(function(err){
					console.log(err);
				})
			}

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})
	},

	signReceive: function(req, res, next){
		var signData = req.body;
		console.log("Receive sign (block) form: " + signData.trusteeID + ", " + signData.blockUUID);

		Block.findOneAndUpdate({
			electionID: signData.electionID,
			blockUUID: signData.blockUUID,
		},{
			$push: {sign: {
				trusteeID: signData.trusteeID,
				signHash: signData.signHash
			}}
		},{upsert: true})
		.then(function(result){
			console.log("Saved sign (block) from: " + signData.trusteeID);

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})	
	}

}
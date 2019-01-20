var request = require('request');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var NodeCache = require("node-cache");
var chalk = require('chalk');

var Node_server = require('../models/node_server');
var Ballot = require('../models/ballot');
var Block = require('../models/block');

var connection = require('./lib/connection');

const timerInterval = _config.blockTimerInterval;
const timerBuffer = _config.blockTimerBuffer;

var blockCache = new NodeCache();
var ballotCache = new NodeCache();
var bftStatus = {};

module.exports = {

	init: function(){
		Block.find({
			blockSeq: 0
		}).then(function(allElection){
			allElection.forEach(function(e){
				module.exports.initTimer(e.data[0].frozenAt, e.electionID)
			})
		}).catch(function(err){
			console.log(err)
		})
	},

	initTimer: function(electionFrozen, electionID){
		bftStatus[electionID] = {
			counter: null,
			seq: {}
		};

		var diffTime = (new Date()) - (new Date(electionFrozen));
		var nextRun = timerInterval - (diffTime % timerInterval);
		bftStatus[electionID].counter = ~~(diffTime / timerInterval);

		setTimeout(function(){
			bftStatus[electionID].counter++;
			if(nextRun>timerBuffer){
				module.exports.nodeSelection(electionID);
			}
			setInterval(function(){
				bftStatus[electionID].counter++;
				module.exports.nodeSelection(electionID);
			}, timerInterval);
		}, nextRun);
	},

	nodeSelection: function(electionID){
		var selectionSeq = bftStatus[electionID].counter;
		if (bftStatus[electionID].seq[selectionSeq-1]){
			delete bftStatus[electionID].seq[selectionSeq-1];
		}

		Ballot.find({
			electionID: electionID,
			inBlock: {$ne: true},
			receiveTime: {$lte: (new Date()) - timerBuffer}
		},null,{
			sort: {"receiveTime" : 1}
		}).then(function(allBallot){
			if(allBallot.length > 0){
				ballotCache.set(selectionSeq, allBallot, timerInterval/1000*2);

				Node_server.find({}).sort({
					IP: 1,
					port: 1
				}).then(function(all_node_server){
					if(all_node_server.length>1){
						let lastHash =  new Buffer(allBallot[allBallot.length-1].ballotID, "ascii").reduce(function(acc, curr){return acc + curr}, 0);
						let selectedNode = all_node_server[lastHash%(all_node_server.length)];
						let selectedAddr = selectedNode.IP+":"+selectedNode.port;

						module.exports.bftUpdate(electionID, selectionSeq, selectedAddr, all_node_server.length);

						console.log(chalk.whiteBright.bgBlueBright("[Block]"), "--> Broadcast BFT node selection, selected:", selectedAddr);
						connection.broadcast("POST", "/blockchain/broadcastSelection", {
							electionID: electionID,
							selectionSeq: selectionSeq,
							selectedAddr: selectedAddr,
							trusteeID: _config.port,
						}, null, null, null);
					}else{
						module.exports.generateBlock(electionID, selectionSeq);
					}
				}).catch(function(err){
					console.log(err);
				})
			}
		}).catch(function(err){
			console.log(err);
		})
	},

	bftReceive: function(req, res, next){
		var data = req.body;
		console.log(chalk.bgBlue("[Block]"), "<-- Receive BFT node selection from", data.trusteeID);

		module.exports.bftUpdate(data.electionID, data.selectionSeq, data.selectedAddr, null);

		res.json({success: true});
	},

	bftUpdate: function(electionID, selectionSeq, selectedAddr, noOfNode){
		if(bftStatus[electionID] && (selectionSeq == bftStatus[electionID].counter || selectionSeq == bftStatus[electionID].counter+1)){
			if(!bftStatus[electionID].seq[selectionSeq]){
				bftStatus[electionID].seq[selectionSeq] = {
					noOfNode: null,
					addr: {},
					sum: 0,
					result: null
				}
			}
			let seqObj = bftStatus[electionID].seq[selectionSeq];

			seqObj.noOfNode = noOfNode ? noOfNode : seqObj.noOfNode;

			seqObj.addr[selectedAddr] = seqObj.addr[selectedAddr] ? seqObj.addr[selectedAddr]+1 : 1;
			seqObj.sum++;

			let myAddr = connection.getSelfAddr();
			let myAddrStr = myAddr.IP+":"+myAddr.port;
			let maxValueAddr = Object.keys(seqObj.addr).reduce((a,b) =>
				((seqObj.addr[a]>seqObj.addr[b]) || (seqObj.addr[a]=seqObj.addr[b] && a>b)) ? a : b
			);
			console.log(maxValueAddr);
			if(!seqObj.result && seqObj.noOfNode && (seqObj.addr[maxValueAddr] > noOfNode/2 || seqObj.sum == seqObj.noOfNode)){
				console.log("GG");
				seqObj.result = maxValueAddr;
				if(maxValueAddr == myAddrStr){
					module.exports.generateBlock(electionID, selectionSeq);
				}
			}
		}
	},

	generateBlock: function(electionID, selectionSeq){
		var allBallot = ballotCache.get(selectionSeq);

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

			console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("Generate new block: "), chalk.grey(newBlock));

			newBlock.save().then(function(result){
				console.log(chalk.bgBlue("[Block]"), "--> Broadcast block to other nodes");
				connection.broadcast("POST", "/blockchain/broadcastBlock", {
					block: JSON.stringify(newBlock_)
				}, null, null, null);

				module.exports.signBlock(newBlock_);

				let allBallotID = [];
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
	},

	signBlock: function(block, broadcast=true){
		var BlockHashSign = crypto.createHash('sha256').update(block.hash).digest('base64');
		Block.findOneAndUpdate({
			electionID: block.electionID,
			blockUUID: block.blockUUID,
		},{
			$push: {sign: {
				serverID: _config.serverID,
				BlockHashSign: BlockHashSign
			}}
		}).then(function(result){
			console.log(chalk.bgBlue("[Block]"), "Signed block:", chalk.grey(block.blockUUID));
		}).catch(function(err){
			console.log(err);
		})

		if(broadcast){
			console.log(chalk.bgBlue("[Block]"), "--> Broadcast sign to other nodes");
			connection.broadcast("POST", "/blockchain/broadcastSign", {
				electionID: block.electionID,
				blockUUID: block.blockUUID,
				trusteeID: _config.serverID,
				BlockHashSign: BlockHashSign
			}, null, null, null);
		}
	},

	blockReceive: function(req, res, next){
		module.exports.blockReceiveProcess(JSON.parse(req.body.block));
		res.json({success: true});
	},

	blockReceiveProcess: function(block, afterSaveCallback){
		console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("<-- Receive block:"), chalk.grey(block));

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
			let cacheSign = blockCache.get(newBlock_.blockUUID);
			if(cacheSign){
				blockCache.del(newBlock_.blockUUID);
				let pushSign = []
				cacheSign.forEach(function(s){
					pushSign.push({
						trusteeID: s.trusteeID,
						signHash: s.signHash
					})
				})
				
				Block.findOneAndUpdate({
					electionID: block.electionID,
					blockUUID: block.blockUUID,
				},{
					$push: {sign: {
						$each: pushSign
					}}
				}).then(function(result){
					console.log(chalk.bgBlue("[Block]"), "Saved cache sign");
				}).catch(function(err){
					console.log(err);
				})				
			}

			module.exports.signBlock(newBlock_);

			if(newBlock_.blockType == "Election Details"){
				module.exports.initTimer(newBlock_.data[0].frozenAt, newBlock_.electionID);
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

			if(afterSaveCallback){
				afterSaveCallback();
			}
		}).catch(function(err){
			console.log(err);
		})
	},

	signReceive: function(req, res, next){
		var signData = req.body;
		console.log(chalk.bgBlue("[Block]"), "<-- Receive sign: ", chalk.grey(signData.trusteeID + ", " + signData.blockUUID));

		Block.findOneAndUpdate({
			electionID: signData.electionID,
			blockUUID: signData.blockUUID,
		},{
			$push: {sign: {
				trusteeID: signData.trusteeID,
				signHash: signData.signHash
			}}
		})
		.then(function(result){
			if(result){
				console.log(chalk.bgBlue("[Block]"), "Saved sign from: " + chalk.grey(signData.trusteeID));
			}else{
				let allSign = blockCache.get(signData.blockUUID);
				if(!allSign){
					allSign = []
				}
				allSign.push(signData);
				blockCache.set(signData.blockUUID, allSign, 600);
				console.log(chalk.bgBlue("[Block]"), "Saved sign in cache.")
			}

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})	
	},

	syncAllChain: function(fromAddr){
		var remoteList = [];
		var localListObj = {};
		var promReq = new Promise(function(resolve, reject){
			connection.sendRequest("GET", fromAddr, "/election/getAllElection", {}, function(data){
				remoteList = JSON.parse(data);
				resolve();
			}, function(err){
				console.log(err);
				reject();
			});
		})
		var promDb = Block.aggregate([
			{$sort: {electionID: 1, blockSeq: 1}},
			{$group: {
				_id: "$electionID",
				"maxSeq": {$last:"$blockSeq"},
				"lastHash": {$last:"$hash"},
			}}
		]).then(function(result){
			result.forEach(function(e){
				localListObj[e._id] = {
					maxSeq: e.maxSeq,
					lastHash: e.lastHash
				}
			})
		}).catch(function(err){
			console.log(err)
		})

		Promise.all([promReq, promDb]).then(function(result){
			remoteList.forEach(function(e){
				let fromSeq = -1;
				if(!localListObj[e._id]){
					fromSeq = 0;
				}else if(localListObj[e._id].maxSeq < e.maxSeq){
					fromSeq = localListObj[e._id].maxSeq + 1;
				}else if(localListObj[e._id].lastHash != e.lastHash){
					fromSeq = localListObj[e._id].maxSeq;
				}

				if(fromSeq >= 0){
					console.log(chalk.bgBlue("[Block]"), chalk.whiteBright("Found an Election not yet sync:"), chalk.grey(e._id));
					module.exports.syncOneChain(fromAddr, e._id, fromSeq, e.maxSeq);
				}
			})
		}).catch(function(err){
			console.log(err);
		})
	},

	syncOneChain: function(fromAddr, electionID, fromSeq, toSeq){
		connection.sendRequest("GET", fromAddr, "/blockchain/getBlock", {
			electionID: electionID,
			fromSeq: fromSeq,
			toSeq: toSeq
		}, function(data){
			blockArr = JSON.parse(data);

			var recursiveAdd = function(blockArr){
				if(blockArr.length){
					module.exports.blockReceiveProcess(blockArr[0], recursiveAdd(blockArr.splice(1)));
				}
			}
			recursiveAdd(blockArr);
		}, null);
	},

	getBlock: function(req, res, next){
		var data = req.body;

		Block.find({
			electionID: data.electionID,
			blockSeq: {
				"$gte": data.fromSeq,
				"$lte": data.toSeq
			}
		}).sort({
			"blockSeq": 1
		}).then(function(result){
			res.json(result);
		}).catch(function(err){
			console.log(err);
		})
	}

}
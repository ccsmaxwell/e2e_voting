var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var NodeCache = require("node-cache");
var chalk = require('chalk');
var stringify = require('fast-json-stable-stringify');

var Ballot = require('../models/ballot');
var Block = require('../models/block');

var connection = require('./lib/connection');
var block = require('./lib/block');
var server = require('./lib/server');

const {blockTimerInterval, blockTimerBuffer, serverID} = _config;

var blockCache = new NodeCache();
var ballotCache = new NodeCache();
var bftStatus = {};

module.exports = {

	init: function(){
		block.allElection(true, false, function(allElection){
			allElection.forEach(function(e){
				module.exports.initTimer(e._id, e.frozenAt)
			})
		})
	},

	initTimer: function(eID, frozenAt){
		bftStatus[eID] = {
			counter: null,
			seq: {}
		};

		var diffTime = (new Date()) - (new Date(frozenAt));
		var nextRun = blockTimerInterval - (diffTime % blockTimerInterval);
		bftStatus[eID].counter = ~~(diffTime / blockTimerInterval);

		setTimeout(function(){
			bftStatus[eID].counter++;
			if(nextRun>blockTimerBuffer){
				module.exports.nodeSelection(eID);
			}
			setInterval(function(){
				bftStatus[eID].counter++;
				module.exports.nodeSelection(eID);
			}, blockTimerInterval);
		}, nextRun);
	},

	nodeSelection: function(eID){
		var selectionSeq = bftStatus[eID].counter;
		if (bftStatus[eID].seq[selectionSeq-1]){
			delete bftStatus[eID].seq[selectionSeq-1];
		}

		block.cachedDetails(eID, ["servers"], false, function(eDetails){
			Ballot.aggregate([
				{$match: {
					electionID: eID,
					inBlock: {$ne: true},
					receiveTime: {$lte: new Date(Date.now() - blockTimerBuffer)}
				}},
				{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
				{$match: {
					distinctSign: {$gte: eDetails.servers.length/2},
				}},
				{$sort: {"receiveTime" : 1}}
			]).then(function(allBallot){
				if(allBallot.length == 0) return;

				ballotCache.set(selectionSeq, allBallot, blockTimerInterval/1000*2);

				let serverArr = eDetails.servers.map((s) => s.serverID);
				server.findAll({serverID: {$in: serverArr}}, {IP: 1, port: 1}, function(allServer){
					if(allServer.length <= 1){
						return module.exports.generateBlock(eID, selectionSeq);
					}

					let lastHash =  new Buffer(allBallot[allBallot.length-1].voterSign, "ascii").reduce(function(acc, curr){return acc + curr}, 0);
					let selectedNode = allServer[lastHash%(allServer.length)];
					let selectedAddr = selectedNode.IP+":"+selectedNode.port;

					module.exports.bftUpdate(eID, selectionSeq, selectedAddr, serverID, allServer.map((s) => s.serverID));

					console.log(chalk.whiteBright.bgBlueBright("[Block]"), "--> Broadcast BFT node selection, selected:", selectedAddr);
					connection.broadcast("POST", "/blockchain/broadcastSelection", {
						electionID: eID,
						selectionSeq: selectionSeq,
						selectedAddr: selectedAddr
					}, true, serverArr, null, null, null);
				})
			}).catch((err) => console.log(err))
		})
	},

	bftReceive: function(req, res, next){
		var data = req.body;
		console.log(chalk.bgBlue("[Block]"), "<-- Receive BFT node selection from", data.serverID);

		try{
			let verifyData = {
				electionID: data.electionID,
				selectionSeq: parseInt(data.selectionSeq),
				selectedAddr: data.selectedAddr,
				serverID: data.serverID
			}
			block.cachedDetails(data.electionID, ["servers"], false, function(eDetails){
				if(eDetails.servers.filter(s => (s.serverID == data.serverID)).length == 0){
					return console.log(chalk.bgBlue("[Block]"), "BFT sign verification fail, ID not exist, from", data.serverID);
				}

				server.keyByServerID(data.serverID, false, function(serverKey){
					if(!crypto.createVerify('SHA256').update(stringify(verifyData)).verify(serverKey, data.serverSign, "base64")){
						return console.log(chalk.bgBlue("[Block]"), "BFT sign verification fail from", data.serverID);
					}

					module.exports.bftUpdate(data.electionID, data.selectionSeq, data.selectedAddr, data.serverID, null);
					res.json({success: true});
				})
			})
		}catch(err){
			console.log(err)
		}
	},

	bftUpdate: function(electionID, selectionSeq, selectedAddr, serverID, nodeList){
		if(!bftStatus[electionID] || (selectionSeq != bftStatus[electionID].counter && selectionSeq != bftStatus[electionID].counter+1)) return;

		if(!bftStatus[electionID].seq[selectionSeq]){
			bftStatus[electionID].seq[selectionSeq] = {
				nodeList: null,
				receivedList: {},
				addr: {},
				sum: 0,
				result: null
			}
		}
		let seqObj = bftStatus[electionID].seq[selectionSeq];

		seqObj.nodeList = nodeList ? nodeList : seqObj.nodeList;

		if(seqObj.receivedList[serverID]) return;
		seqObj.receivedList[serverID] = true;

		seqObj.addr[selectedAddr] = seqObj.addr[selectedAddr] ? seqObj.addr[selectedAddr]+1 : 1;
		seqObj.sum++;

		let myAddr = connection.getSelfAddr();
		let myAddrStr = myAddr.IP+":"+myAddr.port;
		let maxValueAddr = Object.keys(seqObj.addr).reduce((a,b) =>
			((seqObj.addr[a]>seqObj.addr[b]) || (seqObj.addr[a]=seqObj.addr[b] && a>b)) ? a : b
		);

		if(seqObj.result || !seqObj.nodeList || (seqObj.addr[maxValueAddr] <= seqObj.nodeList.length/2 && seqObj.sum != seqObj.nodeList.length)) return;

		seqObj.result = maxValueAddr;
		if(maxValueAddr == myAddrStr){
			module.exports.generateBlock(electionID, selectionSeq);
		}		
	},

	generateBlock: function(eID, selectionSeq){
		var blockData = []
		var allBallot = ballotCache.get(selectionSeq);
		allBallot.forEach(function(e){
			blockData.push({
				electionID: e.electionID,
				voterID: e.voterID,
				answers: e.answers,
				voterSign: e.voterSign,
				ballotID: e.ballotID,
				receiveTime: e.receiveTime,
				sign: e.sign
			})
		});

		block.cachedDetails(eID, ["servers"], false, function(eDetails){
			// block.createBlock
		})

		Block.find({
			electionID: eID
		}).sort({
			blockSeq: -1
		}).limit(1).then(function(lastBlock){
			var newBlock_ = {
				blockUUID: uuidv4(),
				electionID: eID,
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
				}, false, null, null, null, null);

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
			}, false, null, null, null, null);
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
				// module.exports.initTimer(newBlock_.data[0].frozenAt, newBlock_.electionID);
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
			}, false, function(err){
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
		}, false, function(data){
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

		// block.allBlocks(data.electionID, data.fromSeq, data.toSeq, function(result){
		// 	res.json(result);
		// })
	},

	syncAfterFreeze: function(req, res, next){
		var allBlocks = JSON.parse(req.body.blocks)
		console.log(chalk.bgBlue("[Block]"), chalk.whiteBright("Sync block after election freeze"));

		var recursiveAdd = function(blockArr){
			if(blockArr.length){
				module.exports.blockReceiveProcess(blockArr[0], recursiveAdd(blockArr.splice(1)));
			}
		}
		recursiveAdd(allBlocks);

		res.json({success: true});
	}

}
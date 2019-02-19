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
					distinctSign: {$gt: eDetails.servers.length/2},
				}},
				{$sort: {"receiveTime" : 1}}
			]).then(function(allBallot){
				if(allBallot.length == 0) return;

				ballotCache.set(selectionSeq, allBallot, blockTimerInterval/1000*2);

				let serverArr = eDetails.servers.map((s) => s.serverID);
				if(serverArr.length <= 1){
					return module.exports.generateBlock(eID, selectionSeq);
				}

				let lastHash =  new Buffer(allBallot[allBallot.length-1].voterSign, "ascii").reduce(function(acc, curr){return acc + curr}, 0);
				let selectedNode = serverArr[lastHash%(serverArr.length)];

				module.exports.bftUpdate(eID, selectionSeq, selectedNode, serverID, serverArr);

				console.log(chalk.whiteBright.bgBlueBright("[Block]"), "--> Broadcast BFT node selection, selected:", selectedNode);
				connection.broadcast("POST", "/blockchain/broadcast/bftSelection", {
					electionID: eID,
					selectionSeq: selectionSeq,
					selectedNode: selectedNode
				}, true, serverArr, null, null, null);
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
				selectedNode: data.selectedNode,
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

					module.exports.bftUpdate(data.electionID, data.selectionSeq, data.selectedNode, data.serverID, null);
					res.json({success: true});
				})
			})
		}catch(err){
			console.log(err)
		}
	},

	bftUpdate: function(electionID, selectionSeq, selectedNode, sID, nodeList){
		if(!bftStatus[electionID] || (selectionSeq != bftStatus[electionID].counter && selectionSeq != bftStatus[electionID].counter+1)) return;

		if(!bftStatus[electionID].seq[selectionSeq]){
			bftStatus[electionID].seq[selectionSeq] = {
				nodeList: null,
				receivedList: {},
				count: {},
				sum: 0,
				result: null,
				generated: false,
				tempBlock: []
			}
		}
		var seqObj = bftStatus[electionID].seq[selectionSeq];

		seqObj.nodeList = nodeList ? nodeList : seqObj.nodeList;

		if(seqObj.receivedList[sID]) return;
		seqObj.receivedList[sID] = true;

		seqObj.count[selectedNode] = seqObj.count[selectedNode] ? seqObj.count[selectedNode]+1 : 1;
		seqObj.sum++;

		var maxValueNode = Object.keys(seqObj.count).reduce((a,b) =>
			((seqObj.count[a]>seqObj.count[b]) || (seqObj.count[a]=seqObj.count[b] && a>b)) ? a : b
		);
		if(seqObj.result || !seqObj.nodeList || (seqObj.count[maxValueNode] <= seqObj.nodeList.length/2 && seqObj.sum != seqObj.nodeList.length)) return;

		seqObj.result = maxValueNode;
		if(maxValueNode == serverID){
			server.findAll({serverID: serverID}, {IP: 1, port: 1}, function(allServer){
				let myAddr = connection.getSelfAddr();
				if(myAddr.IP+":"+myAddr.port == allServer[0].IP+":"+allServer[0].port){
					seqObj.generated = true;
					module.exports.generateBlock(electionID, selectionSeq);
				}else{
					seqObj.tempBlock.forEach((b) => module.exports.blockProcess(b.block, b.serverSign, selectionSeq))
				}
			})
		}else{
			seqObj.tempBlock.forEach((b) => module.exports.blockProcess(b.block, b.serverSign, selectionSeq))
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
			block.lastBlock(eID, true, function(lastBlock){
				block.createBlock(eID, null, lastBlock[0].blockSeq+1, "Ballot", blockData, lastBlock[0].hash, null, true, true, function(newBlock){
					console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("New block: "), chalk.grey(newBlock));
				}, false)
			})
		})
	},

	blockReceive: function(req, res, next){
		var data = req.body;
		var newBlock = JSON.parse(data.block);
		console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("<-- Receive block:"), chalk.grey(newBlock));

		if(newBlock.blockType == "Ballot"){
			let seqObj = bftStatus[newBlock.electionID].seq[bftStatus[newBlock.electionID].counter]
			if(!seqObj.result){
				seqObj.tempBlock.push({
					block: newBlock,
					serverSign: data.serverSign
				})
			}else{
				module.exports.blockProcess(newBlock, data.serverSign, bftStatus[newBlock.electionID].counter)
			}
		}else{

		}
		res.json({success: true});
	},

	blockProcess: function(newBlock, serverSign, bftCounter){
		let seqObj = bftCounter ? bftStatus[newBlock.electionID].seq[bftCounter] : null;
		module.exports.blockVerify(newBlock, seqObj?seqObj.result:null, serverSign, function(){
			if(seqObj && seqObj.generated){
				return console.log(chalk.bgBlue("[Block]"), "Block already generated, skip.");
			}else if(seqObj){
				seqObj.generated = true;
			}
			block.createBlock(newBlock.electionID, newBlock.blockUUID, newBlock.blockSeq, newBlock.blockType, newBlock.data, newBlock.previousHash, null, false, true, function(result){
				let cacheSign = blockCache.get(newBlock.blockUUID);
				if(cacheSign){
					blockCache.del(newBlock.blockUUID);
					module.exports.signVerify(newBlock.electionID, newBlock.blockUUID, Object.values(cacheSign), function(verifiedArr){
						block.saveSign(newBlock.electionID, newBlock.blockUUID, verifiedArr, () => console.log(chalk.bgBlue("[Block]"), "Saved cache sign."));
					})
				}
			}, false)
		})
	},

	blockVerify: function(blockReceive, fromServerID, serverSign, successCallback){
		var newBlock = {
			blockUUID: blockReceive.blockUUID,
			electionID: blockReceive.electionID,
			blockSeq: blockReceive.blockSeq,
			blockType: blockReceive.blockType,
			data: blockReceive.data,
			previousHash: blockReceive.previousHash
		}
		var hash = crypto.createHash('sha256').update(JSON.stringify(newBlock)).digest('base64');
		if(hash != blockReceive.hash) return console.log(chalk.bgBlue("[Block]"), "Block hash not equal");

		var eProm = new Promise(function(resolve, reject){
			block.lastBlock(newBlock.electionID, true, function(lastBlock){
				if(lastBlock[0].blockSeq+1 != newBlock.blockSeq || lastBlock[0].hash != newBlock.previousHash){
					throw chalk.bgBlue("[Block]") + " Block seq/prevHash not equal"
				}
				resolve();
			})
		})
		var sProm = new Promise(function(resolve, reject){
			if(!fromServerID) return resolve();
			server.keyByServerID(fromServerID, false, function(serverKey){
				if(!crypto.createVerify('SHA256').update(hash).verify(serverKey, serverSign, "base64")){
					throw chalk.bgBlue("[Block]") + " Block sender sign not valid"
				}
				resolve();
			})
		})

		Promise.all([eProm, sProm]).then(function(){
			console.log(chalk.bgBlue("[Block]"), "Block verification success");
			successCallback()
		}).catch((err) => console.log(err))
	},

	signReceive: function(req, res, next){
		var data = req.body;
		var signData = JSON.parse(data.sign);
		console.log(chalk.bgBlue("[Block]"), "<-- Receive sign: ", chalk.grey(signData.serverID));

		module.exports.signVerify(data.electionID, data.blockUUID, [signData], function(verifiedArr){
			if(verifiedArr){
				block.saveSign(data.electionID, data.blockUUID, [signData], function(result){
					console.log(chalk.bgBlue("[Block]"), "Saved sign from: ", chalk.grey(signData.serverID));
					res.json({success: true});
				});
			}else{
				let allSign = blockCache.get(data.blockUUID);
				if(!allSign) allSign = {};
				allSign[signData.serverID] = signData;
				blockCache.set(data.blockUUID, allSign, 600);
				console.log(chalk.bgBlue("[Block]"), "Saved sign in cache.")
				res.json({success: true});
			}
		})
	},

	signVerify: function(eID, blockUUID, signArr, successCallBack){
		var bRes, eRes;
		var bProm = new Promise(function(resolve, reject){
			block.findAll({electionID: eID,	blockUUID: blockUUID}, null, function(result){
				bRes = result
				resolve();
			});
		})
		var eProm = new Promise(function(resolve, reject){
			block.cachedDetails(eID, ["servers"], false, function(result){
				eRes = result;
				resolve();
			});
		})

		Promise.all([bProm, eProm]).then(function(){
			if(!bRes || bRes.length == 0) return successCallBack(null);

			let resArr = [], promArr = [];
			signArr.forEach(function(s){
				if(eRes.servers.filter(servers => (servers.serverID == s.serverID)).length == 0){
					return console.log(chalk.bgBlue("[Block]"), "Sign verification fail: server ID not exist in this election. ", chalk.grey(s.serverID));
				}
				if(bRes[0].sign.filter(sign => (sign.serverID == s.serverID)).length > 0){
					return console.log(chalk.bgBlue("[Block]"), "Sign verification fail: server ID already exist in this ballot. ", chalk.grey(s.serverID));
				}
				promArr.push(new Promise(function(resolve, reject){
					server.keyByServerID(s.serverID, false, function(serverKey){
						if(crypto.createVerify('SHA256').update(bRes[0].hash).verify(serverKey, s.blockHashSign, "base64")){
							resArr.push(s);
						}else{
							console.log(chalk.bgBlue("[Block]"), "Sign verification fail.", chalk.grey(s.serverID));
						}
						resolve();
					})
				}))
			})

			Promise.all(promArr).then(() => successCallBack(resArr));
		})
	},

	blockReceiveProcess: function(blockReceive, afterSaveCallback){
		var newBlock_ = {
			blockUUID: blockReceive.blockUUID,
			electionID: blockReceive.electionID,
			blockSeq: blockReceive.blockSeq,
			previousHash: blockReceive.previousHash,
			blockType: blockReceive.blockType,
			data: blockReceive.data
		};

		var newBlock = new Block();
		Object.keys(newBlock_).forEach(function(key){
			newBlock[key] = newBlock_[key];
		});
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		newBlock.save().then(function(result){
			block.signBlock(newBlock_, true);
			if(newBlock_.blockType == "Election Details"){
				// module.exports.initTimer(newBlock_.data[0].frozenAt, newBlock_.electionID);
			}
			if(afterSaveCallback){
				afterSaveCallback();
			}
		}).catch((err) => console.log(err))
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
var crypto = require('crypto');
var NodeCache = require("node-cache");
var chalk = require('chalk');
var stringify = require('fast-json-stable-stringify');
var NanoTimer = require('nanotimer');

var Ballot = require('../models/ballot');

var connection = require('./lib/connection');
var server = require('./lib/server');
var blockQuery = require('./lib/blockQuery');
var blockUpdate = require('./lib/blockUpdate');

var signCache = new NodeCache();
var ballotCache = new NodeCache();
var bftStatus = {};

global._electionTimer = {}

const {blockTimerInterval, blockTimerBuffer, serverID} = _config;

module.exports = {

	init: function(){
		blockQuery.allElection(true, false, function(allElection){
			allElection.forEach(function(e){
				module.exports.initTimer(e._id, e.frozenAt)
			})
		})
	},

	initTimer: function(eID, frozenAt){
		if(_electionTimer[eID]) _electionTimer[eID].clearInterval();

		bftStatus[eID] = {
			counter: null,
			seq: {}
		};

		var nextRun = blockTimerInterval - (((new Date()) - (new Date(frozenAt))) % blockTimerInterval);
		setTimeout(function(){
			bftStatus[eID].counter = ~~(((new Date()) - (new Date(frozenAt))) / blockTimerInterval);
			if(nextRun > blockTimerBuffer) module.exports.nodeSelection(eID);

			_electionTimer[eID] = new NanoTimer();
			_electionTimer[eID].setInterval(function(){
				bftStatus[eID].counter = ~~(((new Date()) - (new Date(frozenAt))) / blockTimerInterval);
				module.exports.nodeSelection(eID);
			}, '', blockTimerInterval+'m');
		}, nextRun);
	},

	nodeSelection: function(eID){
		var selectionSeq = bftStatus[eID].counter;
		if (bftStatus[eID].seq[selectionSeq-1]){
			delete bftStatus[eID].seq[selectionSeq-1];
		}

		blockQuery.cachedDetails(eID, ["servers"], false, function(eDetails){
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

				let lastHash =  Buffer.from(allBallot[allBallot.length-1].voterSign, "ascii").reduce(function(acc, curr){return acc + curr}, 0);
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
			blockQuery.cachedDetails(data.electionID, ["servers"], false, function(eDetails){
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
					seqObj.tempBlock.forEach((b) => module.exports.blockProcess(b.block, true, b.serverSign, selectionSeq, null))
				}
			})
		}else{
			seqObj.tempBlock.forEach((b) => module.exports.blockProcess(b.block, true, b.serverSign, selectionSeq, null))
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
				voterTimestamp: e.voterTimestamp,
				receiveTime: e.receiveTime,
				sign: e.sign
			})
		});

		blockQuery.lastBlock(eID, true, function(lastBlock){
			blockUpdate.createBlock(eID, null, lastBlock[0].blockSeq+1, "Ballot", blockData, lastBlock[0].hash, null, true, true, function(newBlock){
				console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("New block: "), chalk.grey(newBlock));
			}, false)
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
				module.exports.blockProcess(newBlock, true, data.serverSign, bftStatus[newBlock.electionID].counter, null)
			}
		}else if(newBlock.blockType == "Election Tally"){
			module.exports.blockProcess(newBlock, true, data.serverSign, null, null)
		}
		res.json({success: true});
	},

	blockProcess: function(newBlock, checkPrevBlock, serverSign, bftCounter, successCallback){
		let seqObj = bftCounter ? bftStatus[newBlock.electionID].seq[bftCounter] : null;
		module.exports.blockVerify(newBlock, checkPrevBlock, seqObj?seqObj.result:null, serverSign, function(){
			if(seqObj && seqObj.generated){
				return console.log(chalk.bgBlue("[Block]"), "Block already generated, skip.");
			}else if(seqObj){
				seqObj.generated = true;
			}
			blockUpdate.createBlock(newBlock.electionID, newBlock.blockUUID, newBlock.blockSeq, newBlock.blockType, newBlock.data, newBlock.previousHash, null, false, true, function(result){
				let cacheSign = signCache.get(newBlock.blockUUID);
				if(cacheSign){
					signCache.del(newBlock.blockUUID);
					module.exports.signVerify(newBlock.electionID, newBlock.blockUUID, Object.values(cacheSign), function(verifiedArr){
						blockUpdate.saveSign(newBlock.electionID, newBlock.blockUUID, verifiedArr, () => console.log(chalk.bgBlue("[Block]"), "Saved cache sign."));
					})
				}

				if(result.data[0] && result.data[0].frozenAt){
					module.exports.initTimer(newBlock.electionID, result.data[0].frozenAt);
				}

				if(successCallback) successCallback(result);
			}, false)
		})
	},

	blockVerify: function(blockReceive, checkPrevBlock, fromServerID, serverSign, successCallback){
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
			if(!checkPrevBlock) return resolve();
			blockQuery.lastBlock(newBlock.electionID, true, function(lastBlock){
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
				blockUpdate.saveSign(data.electionID, data.blockUUID, verifiedArr, function(result){
					console.log(chalk.bgBlue("[Block]"), "Saved sign if verified: ", chalk.grey(signData.serverID));
					res.json({success: true});
				});
			}else{
				let allSign = signCache.get(data.blockUUID);
				if(!allSign) allSign = {};
				allSign[signData.serverID] = signData;
				signCache.set(data.blockUUID, allSign, blockTimerInterval/1000*2);
				console.log(chalk.bgBlue("[Block]"), "Saved sign in cache.")
				res.json({success: true});
			}
		})
	},

	signVerify: function(eID, blockUUID, signArr, successCallback){
		var bRes, eRes;
		var bProm = new Promise(function(resolve, reject){
			blockQuery.findAll({electionID: eID, blockUUID: blockUUID}, null, function(result){
				bRes = result
				resolve();
			});
		})
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(eID, ["servers"], false, function(result){
				eRes = result;
				resolve();
			});
		})

		Promise.all([bProm, eProm]).then(function(){
			if(!bRes || bRes.length == 0) return successCallback(null);

			let resArr = [], promArr = [];
			signArr.forEach(function(s){
				if(eRes.servers.filter(servers => (servers.serverID == s.serverID)).length == 0){
					return console.log(chalk.bgBlue("[Block]"), "Sign verification fail: server ID not exist in this election. ", chalk.grey(s.serverID));
				}
				if(bRes[0].sign.filter(sign => (sign.serverID == s.serverID)).length > 0){
					return console.log(chalk.bgBlue("[Block]"), "Sign verification fail: server ID already exist in this block. ", chalk.grey(s.serverID));
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

			Promise.all(promArr).then(() => successCallback(resArr));
		})
	},

	syncAfterFreeze: function(req, res, next){
		var data = req.body;
		console.log(chalk.bgBlue("[Block]"), chalk.whiteBright("Sync block after election freeze"));

		module.exports.syncOneChain(data.fromAddr, data.electionID, 0, data.maxSeq);
		res.json({success: true});
	},

	syncOneChain: function(fromAddr, electionID, fromSeq, toSeq){
		var to = toSeq-fromSeq+1>3 ? fromSeq+2 : toSeq;
		connection.sendRequest("GET", fromAddr, "/blockchain/all-blocks", {
			electionID: electionID,
			fromSeq: fromSeq,
			toSeq: to
		}, false, function(data){
			let blockArr = JSON.parse(data);

			let recursiveAdd = function(blockArr){
				if(blockArr.length){
					module.exports.blockProcess(blockArr[0], false, null, null, function(){
						module.exports.signVerify(electionID, blockArr[0].blockUUID, blockArr[0].sign, function(verifiedArr){
							blockUpdate.saveSign(electionID, blockArr[0].blockUUID, verifiedArr, function(result){
								console.log(chalk.bgBlue("[Block]"), "Saved sign for block: ", chalk.grey(blockArr[0].blockUUID));
							});
							recursiveAdd(blockArr.splice(1));
						})
					})
				}else if(to != toSeq){
					setImmediate(() => module.exports.syncOneChain(fromAddr, electionID, to+1, toSeq));
				}
			}
			recursiveAdd(blockArr);
		}, null);
	},

	getAllBlocks: function(req, res, next){
		var data = req.body;

		blockQuery.allBlocks(data.electionID, data.fromSeq, data.toSeq, (result) => res.json(result));
	},

	getAllElectionForSync: function(req, res, next){
		blockQuery.allElectionForSync(req.body.serverID, (result) => res.json(result));
	},

	syncAllChainSimple: function(fromAddr){
		var remoteList, localListObj = {};
		var rProm = new Promise(function(resolve, reject){
			connection.sendRequest("GET", fromAddr, "/blockchain/sync/all-election", {}, true, function(data){
				remoteList = JSON.parse(data);
				resolve();
			}, false, (err) => console.log(err));
		})
		var lProm = new Promise(function(resolve, reject){
			blockQuery.allElectionForSync(null, function(result){
				result.forEach((e) => localListObj[e._id] = e);
				resolve();
			});
		})

		Promise.all([rProm, lProm]).then(function(){
			remoteList.forEach(function(e){
				let fromSeq = -1;
				if(!localListObj[e._id]){
					fromSeq = 0;
				}else if(localListObj[e._id].maxSeq < e.maxSeq){
					fromSeq = localListObj[e._id].maxSeq + 1;
				}

				if(fromSeq >= 0){
					console.log(chalk.bgBlue("[Block]"), chalk.whiteBright("Found an Election not yet sync:"), chalk.grey(e._id));
					module.exports.syncOneChain(fromAddr, e._id, fromSeq, e.maxSeq);
				}
			})
		}).catch((err) => console.log(err));
	}

}
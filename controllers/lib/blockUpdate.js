var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var chalk = require('chalk');
var bigInt = require("big-integer");

var Block = require('../../models/block');
var Ballot = require('../../models/ballot');

var connection = require('./connection');
var blockQuery = require('./blockQuery');
var encoding = require('./encoding');

var blockCallbackList = {};

const {serverID, serverPriKey} = _config;

module.exports = {

	createBlock: function(eID, blockID, blockSeq, blockType, data, previousHash, res, broadcastBlock, broadcastSign, successCallback, sendSuccessRes){
		let newBlock_ = {};
		newBlock_.blockUUID = blockID ? blockID : uuidv4();
		newBlock_.electionID = eID;
		newBlock_.blockSeq = blockSeq;
		newBlock_.blockType = blockType;
		newBlock_.data = data;
		newBlock_.previousHash = previousHash;

		var newBlock = new Block();
		Object.keys(newBlock_).forEach((key) =>	newBlock[key] = newBlock_[key]);
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		newBlock.save().then(function(result){
			if(blockType != "Election Details"){
				if(!blockCallbackList[eID]) blockCallbackList[eID] = [];
				blockCallbackList[eID].push(newBlock_.blockUUID);
			}

			if(broadcastBlock){
				console.log(chalk.bgBlue("[Block]"), "--> Broadcast block to other nodes");
				blockQuery.cachedDetails(eID, ["servers"], false, function(eDetails){
					connection.broadcast("POST", "/blockchain/broadcast/block", {
						block: JSON.stringify(newBlock_),
						serverSign: crypto.createSign('SHA256').update(newBlock_.hash).sign(serverPriKey, 'base64')
					}, false,  eDetails.servers.map((s) => s.serverID), null, null, null);
				})
			}
			module.exports.signBlock(newBlock_, broadcastSign);

			if(successCallback) successCallback(result);
			if(sendSuccessRes) res.json({success: true, electionID: newBlock_.electionID});
		}).catch(function(err){
			console.log(err);
			if(res){
				res.json({success: false, msg: "Cannot save new block."});
			}
		});
	},

	signBlock: function(block, broadcast){
		var sign = {
			serverID: serverID,
			blockHashSign: crypto.createSign('SHA256').update(block.hash).sign(serverPriKey, 'base64')
		}
		module.exports.saveSign(block.electionID, block.blockUUID, [sign], () => console.log(chalk.bgBlue("[Block]"), "Signed block:", chalk.grey(block.blockUUID)));

		if(broadcast){
			blockQuery.cachedDetails(block.electionID, ["servers"], false, function(eDetails){
				console.log(chalk.bgBlue("[Block]"), "--> Broadcast sign to other nodes");
				connection.broadcast("POST", "/blockchain/broadcast/sign", {
					electionID: block.electionID,
					blockUUID: block.blockUUID,
					sign: JSON.stringify(sign)
				}, false, eDetails.servers.map((s) => s.serverID), null, null, null);
			})
		}
	},

	saveSign: function(eID, blockUUID, signArr, successCallBack){
		Block.findOneAndUpdate({
			electionID: eID,
			blockUUID: blockUUID
		},{
			$push: {sign: {
				$each: signArr
			}}
		}, {new: true}).then(function(result){
			if(successCallBack) successCallBack(result);

			if(result.blockType == "Election Details") return;
			blockQuery.cachedDetails(eID, ["servers"], false, function(eDetails){
				if(result.sign.length <= eDetails.servers.length/2) return;
				if(!blockCallbackList[eID] || !blockCallbackList[eID].includes(blockUUID)) return;
				blockCallbackList[eID] = blockCallbackList[eID].filter(i => i != blockUUID)

				if(result.blockType == "Ballot"){
					module.exports.ballotBLockExec(eID, blockUUID, result);
				}else if(result.blockType=="Election Tally" && result.data[0].tallyInfo){
					module.exports.tallyBlockExec(eID, blockUUID, result);
				}
			})
		})
	},

	ballotBLockExec: function(eID, blockUUID, block){
		let allBallot = [];
		block.data.forEach((e) => allBallot.push(e.voterSign));
		Ballot.updateMany({
			voterSign: {$in: allBallot}
		},{
			inBlock: true
		}).then(() => console.log("Updated ballot 'inBlock'.")).catch((err) => console.log(err));
	},

	tallyBlockExec: function(eID, blockUUID, block){
		if(_electionTimer[eID]){
			_electionTimer[eID].clearInterval();
			delete _electionTimer[eID];
		}

		block.data[0].tallyInfo.forEach(function(t, ti){
			if(t.serverID != serverID) return;

			let startTime = process.hrtime();
			let bRes=[], eRes;
			let numSeg = Math.ceil((t.end-t.start+1)/3000);
			let promArr = [];
			for(let i=0; i<numSeg; i++){
				promArr.push(new Promise(function(resolve, reject){
					blockQuery.getVoterBallot(eID, true, false, t.start+i*3000, i==numSeg-1? t.end-t.start+1-3000*(numSeg-1) : 3000, function(result){
						bRes.push(...result)
						resolve();
					})
				}))
			}
			promArr.push(new Promise(function(resolve, reject){
				blockQuery.cachedDetails(eID, ['questions', 'key'], false, function(result){
					eRes = result
					resolve();
				})
			}))

			Promise.all(promArr).then(function(){
				let aggrAns = [];
				let p = bigInt(encoding.base64ToHex(eRes.key.p),16);
				eRes.questions.forEach(function(q){
					aggrAns.push([]);
					q.answers.forEach(function(a){
						aggrAns[aggrAns.length-1].push({c1:bigInt(1), c2:bigInt(1)});
					})
				})

				bRes.forEach(function(voter){
					if(!voter.ballot || !voter.ballot[0]) return;

					for(let i=0; i<aggrAns.length; i++){
						for(let j=0; j<aggrAns[i].length; j++){
							aggrAns[i][j].c1 = aggrAns[i][j].c1.multiply(bigInt(encoding.base64ToHex(voter.ballot[0].answers[i].choices[j].c1),16)).mod(p);
							aggrAns[i][j].c2 = aggrAns[i][j].c2.multiply(bigInt(encoding.base64ToHex(voter.ballot[0].answers[i].choices[j].c2),16)).mod(p);
						}
					}
				})

				aggrAns.forEach(function(q){
					q.forEach(function(a){
						a.c1 = encoding.hexToBase64(a.c1.toString(16));
						a.c2 = encoding.hexToBase64(a.c2.toString(16));
						a['c1x'] = encoding.hexToBase64(bigInt(1).toString(16));
					})
				})

				let execTime = process.hrtime(startTime);
				console.log("Aggregated ballots. Time:", execTime);
				setTimeout(function(){
					let blockData = {
						partialTally: aggrAns,
						serverID: serverID
					}
					blockQuery.lastBlock(eID, false, function(lastBlock){
						module.exports.createBlock(eID, null, lastBlock[0].blockSeq+1, "Election Tally", blockData, lastBlock[0].hash, null, true, true, function(newBlock){
							console.log(chalk.whiteBright.bgBlueBright("[Block]"), chalk.whiteBright("New block: "), chalk.grey(newBlock));
						}, false)
					})
				}, ((execTime[0]*1000+execTime[1]/1000000)+1000)*ti );
			}).catch((err) => console.log(err))
		})
	}

}
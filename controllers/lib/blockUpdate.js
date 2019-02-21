var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var chalk = require('chalk');

var Block = require('../../models/block');
var Ballot = require('../../models/ballot');

var connection = require('./connection');
var blockQuery = require('./blockQuery');

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

			if(!blockCallbackList[eID] || !blockCallbackList[eID].includes(blockUUID)) return;
			if(result.blockType == "Ballot"){
				module.exports.ballotBLockExec(eID, blockUUID, result);
			}else if(result.blockType=="Election Tally" && result.tallyInfo){

			}
		})
	},

	ballotBLockExec: function(eID, blockUUID, block){
		blockQuery.cachedDetails(eID, ["servers"], false, function(eDetails){
			if(block.sign.length <= eDetails.servers.length/2) return;
			blockCallbackList[eID] = blockCallbackList[eID].filter(i => i != blockUUID)

			let allBallot = [];
			block.data.forEach((e) => allBallot.push(e.voterSign));
			Ballot.updateMany({
				voterSign: {$in: allBallot}
			},{
				inBlock: true
			}).then(() => console.log("Updated ballot 'inBlock'.")).catch((err) => console.log(err));
		})
	}

}
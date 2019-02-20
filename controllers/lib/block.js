var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var chalk = require('chalk');

var Block = require('../../models/block');
var Ballot = require('../../models/ballot');

var connection = require('./connection');

var electionDetails = {};
var ballotBlockUpdate = {};

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
			if(blockType == "Ballot"){
				if(!ballotBlockUpdate[eID]) ballotBlockUpdate[eID] = [];
				ballotBlockUpdate[eID].push(newBlock_.blockUUID);
			}

			if(broadcastBlock){
				console.log(chalk.bgBlue("[Block]"), "--> Broadcast block to other nodes");
				module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
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
			module.exports.cachedDetails(block.electionID, ["servers"], false, function(eDetails){
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

			if(!ballotBlockUpdate[eID] || !ballotBlockUpdate[eID].includes(blockUUID)) return;
			module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
				if(result.sign.length > eDetails.servers.length/2){
					ballotBlockUpdate[eID] = ballotBlockUpdate[eID].filter(i => i != blockUUID)

					let allBallot = [];
					result.data.forEach((e) => allBallot.push(e.voterSign));
					Ballot.updateMany({
						voterSign: {$in: allBallot}
					},{
						inBlock: true
					}).then(() => console.log("Updated ballot 'inBlock'.")).catch((err) => console.log(err));
				}
			})
		})
	},

	latestDetails: function(eID, fields, successCallback){
		var group = {
			_id: "$electionID",
			"blockSeq": {$first:"$blockSeq"},
			"hash": {$first:"$hash"}
		};
		var project = {
			"_id": "$_id",
			"blockSeq": "$blockSeq",
			"hash": "$hash",
		}
		fields.forEach(function(f){
			group[f] = {$push:"$data."+f}
			project[f] = {$arrayElemAt: ["$"+f, 0]}
		})

		Block.aggregate([
			{$match: {
				"electionID": eID,
				"blockType": "Election Details"
			}},
			{$sort: {blockSeq: -1}},
			{$unwind: "$data"},
			{$group: group},
			{$project: project}
		]).then(successCallback).catch((err) => console.log(err))
	},

	cachedDetails: function(eID, fields, forceUpdate, successCallback){
		if(!electionDetails[eID]){
			electionDetails[eID] = {}
		}
		var currField = Object.keys(electionDetails[eID]);

		if(forceUpdate || currField.length == 0 || ! fields.every(e => currField.includes(e))){
			module.exports.latestDetails(eID, fields, function(result){
				fields.forEach(function(f){
					electionDetails[eID][f] = result[0][f]
				})

				successCallback(electionDetails[eID]);
			})
		}else{
			successCallback(electionDetails[eID]);
		}
	},

	latestVoters: function(eID, voterID, skip, limit, successCallback){
		var aggr = [
			{$match: {
				"electionID": eID,
				"blockType": "Election Details"
			}},
			{$sort: {blockSeq: -1}},
			{$unwind: "$data"},
			{$unwind: "$data.voters"}
		];

		if(voterID){
			aggr.push({$match: {
				"data.voters.id": voterID,
			}})
		}

		aggr.push(
			{$group: {
				_id: "$data.voters.id",
				"public_key": {$push:"$data.voters.public_key"}
			}},
			{$project: {
				"public_key": {$arrayElemAt: ["$public_key", 0]}
			}},
			{$match: {
				"public_key": {"$ne": ""},
			}},
			{$sort: {_id: 1}},
			{ $group :{
				_id: null,
				total: { $sum:1 },
				result: { $push:"$$ROOT" }
			}},
			{ $project :{
				total: 1,
				result: skip!=null ? { $slice:["$result", skip, limit] } : "$result"
			}}
		)

		Block.aggregate(aggr).then(function(result){
			successCallback(result[0]);
		}).catch((err) => console.log(err))
	},

	getVoterBallot: function(eID, validBlock, skip, limit, successCallback){
		module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
			var bAggr = [{$match: {
				"electionID": eID,
				"blockType": "Ballot"
			}}]
			if(validBlock){
				bAggr.push(
					{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
					{$match: {distinctSign: {$gt: eDetails.servers.length/2}} }
				)
			}
			bAggr.push(
				{$unwind: "$data"},
				{$addFields: {"ballotReceiveTime": {$convert: {input: "$data.receiveTime", to:"date"}} }},
				{$sort: {"ballotReceiveTime": -1}},
				{$group: {
					_id: "$data.voterID",
					ballot: {$first: "$data"}
				}}
			)

			var vAggr = [
				{$match: {
					"electionID": eID,
					"blockType": "Election Details"
				}},
				{$sort: {blockSeq: -1}},
				{$unwind: "$data"},
				{$unwind: "$data.voters"},
				{$group: {
					_id: "$data.voters.id",
					"public_key": {$push:"$data.voters.public_key"}
				}},
				{$project: {
					"public_key": {$arrayElemAt: ["$public_key", 0]}
				}},
				{$match: {
					"public_key": {"$ne": ""},
				}}
			]

			Block.aggregate([
				{$facet:{
					voterList: vAggr,
					ballotList: bAggr
				}},
				{$unwind: "$voterList"},
				{$project:{
					"_id": "$voterList._id",
					"ballot": { $filter: {
						input: "$ballotList.ballot", 
						as: "b",
						cond: {$eq: ["$voterList._id", "$$b.voterID"]}
					}}
				}},
				{$sort: {_id: 1}},
				{ $group :{
					_id: null,
					total: { $sum:1 },
					result: { $push:"$$ROOT" }
				}},
				{ $project :{
					total: 1,
					result: skip!=null ? { $slice:["$result", skip, limit] } : "$result"
				}}
			]).then(function(result){
				successCallback(result[0]);
			}).catch((err) => console.log(err))
		})
	},

	latestTrustees: function(eID, trusteeID, skip, limit, successCallback){
		var aggr = [
			{$match: {
				"electionID": eID,
				"blockType": "Election Details"
			}},
			{$sort: {blockSeq: -1}},
			{$unwind: "$data"},
			{$unwind: "$data.trustees"}
		];

		if(trusteeID){
			aggr.push({$match: {
				"data.trustees.trusteeID": trusteeID,
			}})
		}

		aggr.push(
			{$group: {
				_id: "$data.trustees.trusteeID",
				"y": {$push:"$data.trustees.y"},
				"a": {$push:"$data.trustees.a"},
				"f": {$push:"$data.trustees.f"},
				"email": {$push:"$data.trustees.email"}
			}},
			{$project: {
				"y": {$arrayElemAt: ["$y", 0]},
				"a": {$arrayElemAt: ["$a", 0]},
				"f": {$arrayElemAt: ["$f", 0]},
				"email": {$arrayElemAt: ["$email", 0]}
			}},
			{$match: {
				"y": {"$ne": ""},
			}},
			{ $group :{
				_id: null,
				total: { $sum:1 },
				result: { $push:"$$ROOT" }
			}},
			{ $project :{
				total: 1,
				result: skip!=null ? { $slice:["$result", skip, limit] } : "$result"
			}}
		)

		Block.aggregate(aggr).then(function(result){
			successCallback(result[0]);
		}).catch((err) => console.log(err))
	},

	allBlocks: function(eID, from, to, successCallback){
		var match = {
			electionID: eID
		}
		if(from!=null && to!=null && from>=0 && to>=from){
			match["blockSeq"] = {
				"$gte": from,
				"$lte": to
			}
		}

		Block.find(match).sort({
			"blockSeq": 1
		}).then(successCallback).catch((err) => console.log(err))
	},

	lastBlock: function(eID, checkValid, successCallback){
		module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
			var aggr = [{$match: {
				"electionID": eID,
			}}]
			if(checkValid){
				aggr.push(
					{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
					{$match: {distinctSign: {$gt: eDetails.servers.length/2}} }
				)
			}
			aggr.push(
				{$sort: {"blockSeq": -1}},
				{$limit: 1}
			)

			Block.aggregate(aggr).then(successCallback).catch((err) => console.log(err))
		})
	},

	allElection: function(frozened, ended, successCallback){
		var group = {
			_id: "$electionID",
		};
		var project = {
			"_id": "$_id",
		}
		var match2 = {};

		if(frozened == true){
			group["frozenAt"] = {$push:"$data.frozenAt"}
			project["frozenAt"] = {$arrayElemAt: ["$frozenAt", 0]}
			match2["frozenAt"] = {$ne: null}
		}
		if(ended == false){
			group["end"] = {$push:"$data.end"}
			project["end"] = {$arrayElemAt: ["$end", 0]}
			match2["end"] = {$gt: new Date()}
		}

		Block.aggregate([
			{$match: {
				"blockType": "Election Details"
			}},
			{$sort: {blockSeq: -1}},
			{$unwind: "$data"},
			{$group: group},
			{$project: project},
			{$match: match2}
		]).then(successCallback).catch((err) => console.log(err))
	},

	findAll: function(filter, sort, successCallback){
		var f = filter ? filter : {};
		var s = sort ? sort : {};
		Block.find(f).sort(s).then(successCallback);
	}

}
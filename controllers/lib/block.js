var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var chalk = require('chalk');

var Block = require('../../models/block');

var blockChainController = require('../blockchain');

var electionDetails = {};

module.exports = {

	createBlock: function(eID, blockSeq, blockType, data, previousHash, res, broadcastBlockSign, successCallback, sendSuccessRes){
		let newBlock_ = {};
		newBlock_.blockUUID = uuidv4();
		newBlock_.electionID = eID;
		newBlock_.blockSeq = blockSeq;
		newBlock_.blockType = blockType;
		newBlock_.data = data;
		newBlock_.previousHash = previousHash;

		var newBlock = new Block();
		Object.keys(newBlock_).forEach(function(key){
			newBlock[key] = newBlock_[key];
		});
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		newBlock.save().then(function(result){
			blockChainController.signBlock(newBlock_, broadcastBlockSign);

			if(successCallback){
				successCallback();
			}
			if(sendSuccessRes){
				res.json({success: true, electionID: newBlock_.electionID});
			}
		}).catch(function(err){
			console.log(err);
			if(res){
				res.json({success: false, msg: "Cannot save new block."});
			}
		});
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

		var slice = skip!=null ? { $slice:["$result", skip, limit] } : "$result";
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
			{ $group :{
				_id: null,
				total: { $sum:1 },
				result: { $push:"$$ROOT" }
			}},
			{ $project :{
				total: 1,
				result: slice
			}}
		)

		Block.aggregate(aggr).then(function(result){
			successCallback(result[0]);
		}).catch((err) => console.log(err))
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

		var slice = skip!=null ? { $slice:["$result", skip, limit] } : "$result";
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
				result: slice
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
		if(from>=0 && to>=from){
			match["blockSeq"] = {
				"$gte": from,
				"$lte": to
			}
		}

		Block.find(match).sort({
			"blockSeq": 1
		}).then(successCallback).catch((err) => console.log(err))
	}

}
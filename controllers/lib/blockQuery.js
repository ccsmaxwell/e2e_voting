var Block = require('../../models/block');

var electionDetails = {};

module.exports = {

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
		]).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
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
			{$sort: {blockSeq: -1}}
		]

		if(voterID){
			aggr.push({$match: {
				"data.voters.id": voterID,
			}})
		}
		aggr.push(
			{$unwind: "$data"},
			{$unwind: "$data.voters"})
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

		Block.aggregate(aggr).allowDiskUse(true).then(function(result){
			successCallback(result[0]);
		}).catch((err) => console.log(err))
	},

	getVoterBallot: function(eID, validBlock, sort, skip, limit, successCallback){
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
			if(sort){
				vAggr.push(
					{$sort: {_id: 1}}
				)
			}
			vAggr.push(
				{$limit: skip+limit},
				{$skip: skip}
			)

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
				}}
			]).allowDiskUse(true).then(function(result){
				successCallback(result);
			}).catch((err) => console.log(err))
		})
	},

	getBallotTiming: function(eID, successCallback){
		module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
			Block.aggregate([
				{$match: {
					"electionID": eID,
					"blockType": "Ballot"
				}},
				{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
				{$match: {distinctSign: {$gt: eDetails.servers.length/2}} },
				{$unwind: "$data"},
				{$project: {
					_id: null,
					voterTimestamp: "$data.voterTimestamp",
					receiveTime: "$data.receiveTime",
					blockCreatedAt: "$createdAt"
				}},
			]).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
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

		Block.aggregate(aggr).allowDiskUse(true).then(function(result){
			successCallback(result[0]);
		}).catch((err) => console.log(err))
	},

	lastBlock: function(eID, checkValid, successCallback){
		module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
			let aggr = [
				{$match: {"electionID": eID}},
				{$sort: {"blockSeq": -1}}
			]
			if(checkValid){
				aggr.push(
					{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
					{$match: {distinctSign: {$gt: eDetails.servers.length/2}} }
				)
			}
			aggr.push(
				{$limit: 1}
			)

			Block.aggregate(aggr).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
		})
	},

	allTallyBlocks: function(eID, matchField, checkValid, successCallback){
		module.exports.cachedDetails(eID, ["servers"], false, function(eDetails){
			let match = matchField ? matchField : {};
			match["electionID"] = eID;
			match["blockType"] = "Election Tally";

			let aggr = [
				{$match: match},
				{$sort: {"blockSeq": 1}}
			]
			if(checkValid){
				aggr.push(
					{$addFields: {"distinctSign": {$size: {$setDifference: ["$sign.serverID", []] }} }},
					{$match: {distinctSign: {$gt: eDetails.servers.length/2}} }
				)
			}

			Block.aggregate(aggr).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
		})
	},

	allBlocks: function(eID, from, to, successCallback){
		var match = {
			electionID: eID
		}

		var fromSeq = parseInt(from);
		var toSeq = parseInt(to);
		if(from!=null && to!=null && fromSeq>=0 && toSeq>=fromSeq){
			match["blockSeq"] = {
				"$gte": fromSeq,
				"$lte": toSeq
			}
		}

		Block.find(match).sort({
			"blockSeq": 1
		}).then(successCallback).catch((err) => console.log(err))
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
			project["end"] = {$convert: {input: {$arrayElemAt: ["$end", 0]}, to:"date"}}
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
		]).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
	},

	allElectionForSync: function(serverID, successCallback){
		Block.aggregate([
			{$match: {
				"blockType": "Election Details"
			}},
			{$sort: {blockSeq: -1}},
			{$unwind: "$data"},
			{$group: {
				_id: "$electionID",
				servers: {$push:"$data.servers"},
				frozenAt: {$push:"$data.frozenAt"}
			}},
			{$project: {
				_id: "$_id",
				servers: {$arrayElemAt: ["$servers", 0]},
				frozenAt: {$arrayElemAt: ["$frozenAt", 0]},
			}},
			{$match: {
				frozenAt: {$ne: null},
				"servers.serverID": {$in: [serverID ? serverID : /^.*/]}
			}}
		]).allowDiskUse(true).then(function(result){
			let allelectionID = result.map((e) => e._id);
			Block.aggregate([
				{$match: {
					electionID: {$in: allelectionID}
				}},
				{$sort: {blockSeq: -1}},
				{$group: {
					_id: "$electionID",
					maxSeq: {$first:"$blockSeq"},
					lastHash: {$first:"$hash"}
				}}
			]).allowDiskUse(true).then(successCallback).catch((err) => console.log(err))
		}).catch((err) => console.log(err))
	},

	findAll: function(filter, sort, successCallback){
		var f = filter ? filter : {};
		var s = sort ? sort : {};
		Block.find(f).sort(s).then(successCallback);
	}

}
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var bigInt = require("big-integer");
var chalk = require('chalk');
var nodeRSA = require('node-rsa');
var NodeCache = require("node-cache");

var Block = require('../models/block');

var blockChainController = require('./blockchain');

var encoding = require('./lib/encoding');
var connection = require('./lib/connection');
var email = require('./lib/email');

var reqCache = new NodeCache();
var keyChangeQueue = {};

const keyChangeWaitTime = _config.keyChangeWaitTime;
const indexURL = _config.indexURL;

module.exports = {

	create: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Create election:"), chalk.grey(JSON.stringify(data)));
		
		var blockData = {
			name: data.name,
			description: data.description,
			start: data.start,
			end: data.end,
			key: JSON.parse(data.key),
			admin: JSON.parse(data.admin),
			servers: JSON.parse(data.servers)
		}

		module.exports.verifyAndCreate(null, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Created new election chain");
		}, true);
	},

	getManage: function(req, res, next){
		module.exports.latestDetails(req.params.electionID, ["name", "description", "start", "end", "questions", "servers"], function(result){
			res.render('eMan', {
				electionID: req.params.electionID,
				electionName: result[0].name,
				electionDescription: result[0].description,
				electionStart: result[0].start,
				electionEnd: result[0].end,
				electionQ: result[0].questions? result[0].questions : [],
				electionServer: result[0].servers
			})
		})
	},

	getManageDetail: function(req, res, next){
		module.exports.latestDetails(req.params.electionID, ["name", "description", "start", "end", "key", "admin"], function(result){
			res.render('eCreate', {
				create: false,
				electionID: req.params.electionID,
				electionName: result[0].name,
				electionDescription: result[0].description,
				electionStart: result[0].start,
				electionEnd: result[0].end,
				electionKey: result[0].key,
				electionAdmin: result[0].admin,
			})
		})
	},

	editDetail: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Edit election details:"), chalk.grey(JSON.stringify(data)));
		
		var blockData = {
			name: data.name,
			description: data.description,
			start: data.start,
			end: data.end,
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edited election details");
		}, true);
	},

	getManageQuestion: function(req, res, next){
		module.exports.latestDetails(req.params.electionID, ["questions"], function(result){
			res.render('eManQuestion', {
				electionID: req.params.electionID,
				questions: result[0].questions? result[0].questions : [],
			})
		})
	},

	editQuestion: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Edit question:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			questions: JSON.parse(data.questions)
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edit question success");
		}, true);
	},

	getManageServer: function(req, res, next){
		module.exports.latestDetails(req.params.electionID, ["servers"], function(result){
			res.render('eManServer', {
				electionID: req.params.electionID,
				servers: result[0].servers
			})
		})
	},

	editServer: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Edit servers:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			servers: JSON.parse(data.servers)
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edit server success");
		}, true);
	},

	getManageVoterList: function(req, res, next){
		var page = parseInt(req.query.page);
		var limit = parseInt(req.query.limit);
		var skip = (page-1)*limit;

		module.exports.latestVoters(req.params.electionID, null, skip, limit, function(result){
			res.json(result);
		});
	},

	addVoterReq: function(req, res, next){
		var voters = JSON.parse(req.body.voters);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add voter request:"), chalk.grey(JSON.stringify(voters)));

		var signData = [];
		var fullData = [];
		voters.forEach(function(v){
			let key = new nodeRSA({b: 1024});
			let pub = key.exportKey("public");
			let pri = key.exportKey("pkcs8");

			signData.push({
				id: v.id,
				public_key: pub
			})
			fullData.push({
				id: v.id,
				email: v.email,
				public_key: pub,
				private_key: pri
			})
		})
		var tempID = uuidv4();
		reqCache.set(tempID, {
			signData: signData,
			fullData: fullData
		}, 600);

		res.json({success: true, tempID: tempID, signData: signData});
	},

	addVoterConfirm: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add voter receive admin sign:"), chalk.grey(JSON.stringify(data)));

		var cacheData = reqCache.get(data.tempID);
		reqCache.del(data.tempID);
		var blockData = {
			voters: cacheData.signData
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Save new voters success");

			let promArr = [];
			let failArr = [];
			cacheData.fullData.forEach(function(v){
				let subject = "[eVoting] Vote invitation";
				let html = [
					"<p>You have been invited to vote in an election.</p>",
					"<p>Your voter ID: " + v.id + "</p>",
					"<p>Here is your private key for this election, please keep it confidential:</p>",
					"<p>" + v.private_key.replace(/\n/g,'<br/>') + "</p>",
					"<p>You can change the key via this link if you want to do so:</p>",
					"<p>" + indexURL+"election/manage/"+req.params.electionID+"/voters/changeKey" + "</p>",
				].join('');

				promArr.push(email.sendEmail([], [v.email], html, "", subject, []).then(function(data){
					// console.log(data)
				}).catch(function(err){
					console.log(err);
				}))
			})

			Promise.all(promArr).then(function(){
				console.log(chalk.black.bgMagenta("[Election]"), "Sent email.");
				res.json({success: true});
			})
		}, false);
	},

	delVoter: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Delete voter:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			voters: JSON.parse(data.voters)
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Delete voter success (marked public_key as empty).");
		}, true);
	},

	voterKeyChangeReq: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Voter change key request:"), chalk.grey(JSON.stringify(data)));

		var verifyData = {
			id: data.id,
			public_key: data.public_key,
		}

		module.exports.latestVoters(req.params.electionID, data.id, null, null, function(result){
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(verifyData));
			if(verify.verify(result.result[0].public_key, data.voterSign, "base64")){
				verifyData["voterSign"] = data.voterSign;
				verifyData["timeStamp"] = new Date();
				module.exports.keyChangeActivate(req.params.electionID, 'voter', verifyData);

				res.json({success: true});
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Voter key verification FAIL");
				res.json({success: false, msg: "Cannot verify voter current key."});
			}
		});
	},

	getManageTrusteeList: function(req, res, next){
		var page = parseInt(req.query.page);
		var limit = parseInt(req.query.limit);
		var skip = (page-1)*limit;

		module.exports.latestTrustees(req.params.electionID, null, skip, limit, function(result){
			res.json(result);
		});
	},

	addTrusteeReq: function(req, res, next){
		var trustees = JSON.parse(req.body.trustees);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add trustee request:"), chalk.grey(JSON.stringify(trustees)));

		var signData = [];
		var fullData = [];
		module.exports.latestDetails(req.params.electionID, ["key"], function(result){
			trustees.forEach(function(t){
				let dh = crypto.createDiffieHellman(result[0].key.p, 'base64', result[0].key.g, 'base64');
				let pub = dh.generateKeys('base64');
				let pri = dh.getPrivateKey('base64');

				signData.push({
					trusteeID: t.trusteeID,
					email: t.email,
					y: pub
				})
				fullData.push({
					trusteeID: t.trusteeID,
					email: t.email,
					y: pub,
					x: pri
				})
			})
			var tempID = uuidv4();
			reqCache.set(tempID, {
				signData: signData,
				fullData: fullData
			}, 600);

			res.json({success: true, tempID: tempID, signData: signData});
		})
	},

	addTrusteeConfirm: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add trustee receive admin sign:"), chalk.grey(JSON.stringify(data)));

		var cacheData = reqCache.get(data.tempID);
		reqCache.del(data.tempID);
		var blockData = {
			trustees: cacheData.signData
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Save new trustees success");

			let promArr = [];
			let failArr = [];
			cacheData.fullData.forEach(function(t){
				let subject = "[eVoting] Trustee invitation";
				let html = [
					"<p>You have been invited to be a trustee in an election.</p>",
					"<p>Your trustee ID: " + t.trusteeID + "</p>",
					"<p>Here is your trustee private key for this election:</p>",
					"<p>" + t.x + "</p>",
					"<p>Please change the private key ASAP, and keep the new key confidential:</p>",
					"<p>" + indexURL+"election/manage/"+req.params.electionID+"/trustees/changeKey" + "</p>",
				].join('');

				promArr.push(email.sendEmail([], [t.email], html, "", subject, []).then(function(data){
					// console.log(data)
				}).catch(function(err){
					console.log(err);
				}))
			})

			Promise.all(promArr).then(function(){
				console.log(chalk.black.bgMagenta("[Election]"), "Sent email.");
				res.json({success: true});
			})
		}, true);
	},

	delTrustee: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Delete trustee:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			trustees: JSON.parse(data.trustees)
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Delete trustees success (marked public_key as empty).");
		}, true);
	},

	getForTrusteeChangeKey: function(req, res, next){
		module.exports.latestDetails(req.params.electionID, ["key"], function(result){
			res.render('eKeyTrustee', {
				electionKey: result[0].key
			});
		});
	},

	trusteeKeyChangeReq: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Trustee change key request:"), chalk.grey(JSON.stringify(data)));

		var verifyData = {
			trusteeID: data.trusteeID,
			y: data.y,
			a: data.a,
			f: data.f
		}

		module.exports.latestDetails(req.params.electionID, ["key"], function(electRes){
			let p = bigInt(encoding.base64ToHex(electRes[0].key.p),16);
			let g = bigInt(encoding.base64ToHex(electRes[0].key.g),16);

			let y = bigInt(encoding.base64ToHex(verifyData.y),16);
			let a = bigInt(encoding.base64ToHex(verifyData.a),16);
			let f = bigInt(encoding.base64ToHex(verifyData.f),16);
			let e = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(electRes[0].key.g + verifyData.a + verifyData.y).digest('base64')),16);

			let lhs = g.modPow(f,p);
			let rhs = a.multiply(y.modPow(e,p)).mod(p);
			if(!lhs.eq(rhs)){
				res.json({success: false, msg: "Proof created by new private key can not verify."});
				throw chalk.black.bgMagenta("[Election]") + " Trustee ZK proof NOT verified.";
			}
			console.log(chalk.black.bgMagenta("[Election]"), "Trustee ZK proof verified.");

			module.exports.latestTrustees(req.params.electionID, data.trusteeID, null, null, function(trustRes){
				let prev_y = bigInt(encoding.base64ToHex(trustRes.result[0].y),16);

				let trusteeSign = JSON.parse(data.trusteeSign);
				let s1 = bigInt(encoding.base64ToHex(trusteeSign.s1),16);
				let s2 = bigInt(encoding.base64ToHex(trusteeSign.s2),16);
				let m = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(verifyData)).digest('base64')),16);

				let lhs = g.modPow(m,p);
				let rhs = prev_y.modPow(s1,p).multiply(s1.modPow(s2,p)).mod(p);
				if(!lhs.eq(rhs)){
					res.json({success: false, msg: "Trustee current key verification FAIL."});
					throw chalk.black.bgMagenta("[Election]") + " Trustee current key verification FAIL.";
				}
				console.log(chalk.black.bgMagenta("[Election]"), "Trustee current key verified.");

				verifyData["trusteeSign"] = trusteeSign;
				verifyData["timeStamp"] = new Date();
				module.exports.keyChangeActivate(req.params.electionID, 'trustee', verifyData);

				res.json({success: true});
			})
		})
	},

	keyChangeActivate: function(eID, type, pushData){
		if(!keyChangeQueue[eID]){
			keyChangeQueue[eID] = {
				voter: [],
				trustee: [],
				timer: null
			}
		}
		keyChangeQueue[eID][type].push(pushData);

		if(!keyChangeQueue[eID].timer){
			keyChangeQueue[eID].timer = setTimeout(function(){
				keyChangeQueue[eID].timer = null;
				var blockData = {};
				if(keyChangeQueue[eID].voter.length > 0){
					blockData['voters'] = keyChangeQueue[eID].voter;
					keyChangeQueue[eID].voter = []
				}
				if(keyChangeQueue[eID].trustee.length > 0){
					blockData['trustees'] = keyChangeQueue[eID].trustee;
					keyChangeQueue[eID].trustee = []
				}

				module.exports.latestDetails(eID, [], function(result){
					module.exports.createBlock(eID, result[0].blockSeq + 1, "Election Details", [blockData], result[0].hash, null, false, function(){
						console.log(chalk.black.bgMagenta("[Election]"), "Saved new block for key change.");
					}, false);
				});
			}, keyChangeWaitTime)
		}
	},

	verifyAndCreate: function(eID, blockData, adminSign, res, broadcastBlockSign, successCallback, sendSuccessRes){
		var VnC = function(result){
			let adminPubKey = result ? result[0].admin.pubKey : blockData.admin.pubKey;
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(blockData));
			if(verify.verify(adminPubKey, adminSign, "base64")){
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = adminSign;

				let electionID = eID ? eID : uuidv4();
				let blockSeq = result ? result[0].blockSeq + 1 : 0;
				let previousHash = result ? result[0].hash : null
				module.exports.createBlock(electionID, blockSeq, "Election Details", [blockData], previousHash, res, broadcastBlockSign, successCallback, sendSuccessRes);
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		}

		if(eID){
			module.exports.latestDetails(eID, ["admin"], VnC);
		}else{
			VnC(null);
		}
	},

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
		]).then(function(result){
			successCallback(result);
		}).catch(function(err){
			console.log(err);
		})
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
		}).catch(function(err){
			console.log(err);
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
		}).catch(function(err){
			console.log(err);
		})
	},

	create_: function(req, res, next){
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Create election:"), chalk.grey(JSON.stringify(req.body)));
		var data = req.body;

		var publicKey = JSON.parse(data.key);
		var trustees = JSON.parse(data.trustee);
		data.question_list = JSON.parse(data.question_list);
		data.voter = JSON.parse(data.voter);

		var key_y = bigInt(1);
		var p = bigInt(encoding.base64ToHex(publicKey.p),16);
		var g = bigInt(encoding.base64ToHex(publicKey.g),16);
		for(let ti of trustees){
			let y = bigInt(encoding.base64ToHex(ti.y),16);
			let a = bigInt(encoding.base64ToHex(ti.a),16);
			let f = bigInt(encoding.base64ToHex(ti.f),16);
			let e = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(publicKey.g + ti.a + ti.y).digest('base64')),16);

			let lhs = g.modPow(f,p);
			let rhs = a.multiply(y.modPow(e,p)).mod(p);
			if(lhs.eq(rhs)){
				console.log(chalk.black.bgMagenta("[Election]"), "A trustee verified.");
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "A trustee NOT verified.");
				res.json({success: false});
				return;
			}

			key_y = key_y.multiply(y).mod(p);
		}
		console.log(chalk.black.bgMagenta("[Election]"), "Calculate public key (y):", chalk.grey(key_y.toString()));

		var newBlock_ = {};
		newBlock_.blockUUID = uuidv4();
		newBlock_.electionID = uuidv4();
		newBlock_.blockSeq = 0;
		newBlock_.blockType = "Election Details";
		newBlock_.data = [{
			name: data.name,
			description: data.description,
			questions: data.question_list,
			key: {
				p: publicKey.p,
				g: publicKey.g,
				y: encoding.hexToBase64(key_y.toString(16))
			},
			voters: data.voter,
			frozenAt: new Date()
		}];

		var newBlock = new Block();
		Object.keys(newBlock_).forEach(function(key){
			newBlock[key] = newBlock_[key];
		});
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		console.log(chalk.black.bgMagenta("[Election]"), "Created new block");
		newBlock.save().then(function(result){
			console.log(chalk.white.bgBlue("[Block]"), "--> Broadcast block to other nodes");
			connection.broadcast("POST", "/blockchain/broadcastBlock", {
				block: JSON.stringify(newBlock_)
			}, null, null, null);

			blockChainController.initTimer(newBlock_.data[0].frozenAt, newBlock_.electionID);
			
			blockChainController.signBlock(newBlock_);

			res.json({success: true, electionID: newBlock_.electionID});
		}).catch(function(err){
			console.log(err);	
		});
	},

	getDetails: function(req, res, next){
		Block.find({
			electionID: req.query.electionID,
			blockType: "Election Details"
		}).then(function(result){
			res.json(result);
		}).catch(function(err){
			console.log(err)
		})
	},

	getResult: function(req, res, next){
		var data = req.body;

		Block.find({
			electionID: data.electionID
		}).then(function(allBlocks){
			var key = {};
			var ans_c1c2 = [];
			var questions = [];
			var voterCount = 0;
			var p;
			allBlocks.forEach(function(block){
				if(block.blockType == "Election Details"){
					block.data[0].questions.forEach(function(q){
						ans_c1c2.push([]);
						q.answers.forEach(function(a){
							ans_c1c2[ans_c1c2.length-1].push({c1:bigInt(1), c2:bigInt(1)});
						})
					})
					key = block.data[0].key
					p = bigInt(encoding.base64ToHex(key.p),16);

					questions = block.data[0].questions;
					voterCount = block.data[0].voters.length;
				}else if(block.blockType == "Ballot"){
					block.data.forEach(function(ballot){
						for(var i=0; i<ans_c1c2.length; i++){
							for(var j=0; j<ans_c1c2[i].length; j++){
								ans_c1c2[i][j].c1 = ans_c1c2[i][j].c1.multiply(bigInt(encoding.base64ToHex(ballot.answers[i].choices[j].c1),16)).mod(p);
								ans_c1c2[i][j].c2 = ans_c1c2[i][j].c2.multiply(bigInt(encoding.base64ToHex(ballot.answers[i].choices[j].c2),16)).mod(p);
							}
						}
					})
				}
			})

			ans_c1c2.forEach(function(q){
				q.forEach(function(a){
					a.c1 = encoding.hexToBase64(a.c1.toString(16));
					a.c2 = encoding.hexToBase64(a.c2.toString(16));
				})
			})
			console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Aggregate ballots: "), chalk.grey(JSON.stringify(ans_c1c2)));

			res.json({questions: questions, voterCount: voterCount, key: key, ans_c1c2: ans_c1c2});
		}).catch(function(err){
			console.log(err)
		})
	},

	getAllElection: function(req, res, next){
		Block.aggregate([
			{$sort: {electionID: 1, blockSeq: 1}},
			{$group: {
				_id: "$electionID",
				"maxSeq": {$last:"$blockSeq"},
				"lastHash": {$last:"$hash"},
			}}
		]).then(function(result){
			res.json(result);
		}).catch(function(err){
			console.log(err)
		})
	}

}
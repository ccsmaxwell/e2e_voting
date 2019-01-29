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

var reqCache = new NodeCache();

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

		var verify = crypto.createVerify('SHA256');
		verify.update(JSON.stringify(blockData));
		if(verify.verify(blockData.admin.pubKey, data.adminSign, "base64")){
			console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
			blockData["adminSign"] = data.adminSign;

			let newBlock_ = {};
			newBlock_.blockUUID = uuidv4();
			newBlock_.electionID = uuidv4();
			newBlock_.blockSeq = 0;
			newBlock_.blockType = "Election Details";
			newBlock_.data = [blockData];

			var newBlock = new Block();
			Object.keys(newBlock_).forEach(function(key){
				newBlock[key] = newBlock_[key];
			});
			newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
			newBlock_.hash = newBlock.hash;

			newBlock.save().then(function(result){
				console.log(chalk.black.bgMagenta("[Election]"), "Created new election chain");
				blockChainController.signBlock(newBlock_, false);

				res.json({success: true, electionID: newBlock_.electionID});
			}).catch(function(err){
				console.log(err);
				res.json({success: false, msg: "Cannot save new block."});
			});
		}else{
			console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
			res.json({success: false, msg: "Cannot verify Admin key."});
		}
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

		module.exports.latestDetails(req.params.electionID, ["admin"], function(result){
			var verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(blockData));
			if(verify.verify(result[0].admin.pubKey, data.adminSign, "base64")){
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = data.adminSign;

				let newBlock_ = {};
				newBlock_.blockUUID = uuidv4();
				newBlock_.electionID = req.params.electionID;
				newBlock_.blockSeq = result[0].blockSeq + 1;
				newBlock_.blockType = "Election Details";
				newBlock_.data = [blockData];

				var newBlock = new Block();
				Object.keys(newBlock_).forEach(function(key){
					newBlock[key] = newBlock_[key];
				});
				newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
				newBlock_.hash = newBlock.hash;

				newBlock.save().then(function(result){
					console.log(chalk.black.bgMagenta("[Election]"), "Edited election details");
					blockChainController.signBlock(newBlock_, false);

					res.json({success: true, electionID: newBlock_.electionID});
				}).catch(function(err){
					console.log(err);
					res.json({success: false, msg: "Cannot save new block."});
				});
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		})
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

		module.exports.latestDetails(req.params.electionID, ["admin"], function(result){
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(blockData));
			if(verify.verify(result[0].admin.pubKey, data.adminSign, "base64")){
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = data.adminSign;

				let newBlock_ = {};
				newBlock_.blockUUID = uuidv4();
				newBlock_.electionID = req.params.electionID;
				newBlock_.blockSeq = result[0].blockSeq + 1;
				newBlock_.blockType = "Election Details";
				newBlock_.data = [blockData];

				var newBlock = new Block();
				Object.keys(newBlock_).forEach(function(key){
					newBlock[key] = newBlock_[key];
				});
				newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
				newBlock_.hash = newBlock.hash;

				newBlock.save().then(function(result){
					console.log(chalk.black.bgMagenta("[Election]"), "Edit question success");
					blockChainController.signBlock(newBlock_, false);

					res.json({success: true, electionID: newBlock_.electionID});
				}).catch(function(err){
					console.log(err);
					res.json({success: false, msg: "Cannot save new block."});
				});
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		})
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

		module.exports.latestDetails(req.params.electionID, ["admin"], function(result){
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(blockData));
			if(verify.verify(result[0].admin.pubKey, data.adminSign, "base64")){
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = data.adminSign;

				let newBlock_ = {};
				newBlock_.blockUUID = uuidv4();
				newBlock_.electionID = req.params.electionID;
				newBlock_.blockSeq = result[0].blockSeq + 1;
				newBlock_.blockType = "Election Details";
				newBlock_.data = [blockData];

				var newBlock = new Block();
				Object.keys(newBlock_).forEach(function(key){
					newBlock[key] = newBlock_[key];
				});
				newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
				newBlock_.hash = newBlock.hash;

				newBlock.save().then(function(result){
					console.log(chalk.black.bgMagenta("[Election]"), "Edit server success");
					blockChainController.signBlock(newBlock_, false);

					res.json({success: true, electionID: newBlock_.electionID});
				}).catch(function(err){
					console.log(err);
					res.json({success: false, msg: "Cannot save new block."});
				});
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		})
	},

	getManageVoterList: function(req, res, next){
		var page = parseInt(req.query.page);
		var limit = parseInt(req.query.limit);
		var skip = (page-1)*limit;

		Block.aggregate([
			{$match: {
				"electionID": req.params.electionID,
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
			{ $group :{
				_id: null,
				total: { $sum:1 },
				result: { $push:"$$ROOT" }
			}},
			{ $project :{
				total: 1,
				result: { $slice:["$result", skip, limit] }
			}}  
		]).then(function(result){
			res.json(result[0]);
		}).catch(function(err){
			console.log(err);
			res.json({success: false, msg: "Can't access DB."});
		})
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

		module.exports.latestDetails(req.params.electionID, ["admin"], function(result){
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(blockData));
			if(verify.verify(result[0].admin.pubKey, data.adminSign, "base64")){
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = data.adminSign;

				let newBlock_ = {};
				newBlock_.blockUUID = uuidv4();
				newBlock_.electionID = req.params.electionID;
				newBlock_.blockSeq = result[0].blockSeq + 1;
				newBlock_.blockType = "Election Details";
				newBlock_.data = [blockData];

				var newBlock = new Block();
				Object.keys(newBlock_).forEach(function(key){
					newBlock[key] = newBlock_[key];
				});
				newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
				newBlock_.hash = newBlock.hash;

				newBlock.save().then(function(result){
					console.log(chalk.black.bgMagenta("[Election]"), "Save new voters success");
					blockChainController.signBlock(newBlock_, false);

					// to be replaced by email
					console.log(cacheData.fullData);

					res.json({success: true, electionID: newBlock_.electionID});
				}).catch(function(err){
					console.log(err);
					res.json({success: false, msg: "Cannot save new block."});
				});
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		})
	},

	latestDetails: function(eID, fields, successCallback){
		var group = {
			_id: "$electionID",
			"blockSeq": {$max:"$blockSeq"}
		};
		var project = {
			"_id": "$_id",
			"blockSeq": "$blockSeq",
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

		// var key = crypto.createDiffieHellman(256, 3);
		// console.log("Prime");
		// console.log(key.getPrime('base64'));
		// console.log("G");
		// console.log(key.getGenerator('base64'));
		// key.generateKeys();
		// console.log("Private");
		// console.log(key.getPrivateKey('base64'));
		// console.log("Public");
		// console.log(key.getPublicKey('base64'));
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
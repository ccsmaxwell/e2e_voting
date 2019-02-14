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
var block = require('./lib/block');

var reqCache = new NodeCache();
var keyChangeQueue = {};

const {keyChangeWaitTime, indexURL} = _config;

module.exports = {

	create: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Create election:"), chalk.grey(JSON.stringify(data)));
		
		var blockData = {
			name: data.name,
			description: data.description,
			start: new Date(data.start),
			end: new Date(data.end),
			key: JSON.parse(data.key),
			admin: JSON.parse(data.admin),
			servers: JSON.parse(data.servers)
		}

		module.exports.verifyAndCreate(null, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Created new election chain");
		}, true);
	},

	getManage: function(req, res, next){
		block.latestDetails(req.params.electionID, ["name", "description", "start", "end", "questions", "servers"], function(result){
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

	getManageStat: function(req, res, next){
		var voterRes, trusteeRes;
		var vProm = new Promise(function(resolve, reject){
			block.latestVoters(req.params.electionID, null, 0, 1, function(result){
				voterRes = result;
				resolve();
			})
		})
		var tProm = new Promise(function(resolve, reject){
			block.latestTrustees(req.params.electionID, null, 0, 1, function(result){
				trusteeRes = result;
				resolve();
			})
		})

		Promise.all([vProm, tProm]).then(function(){
			res.json({
				voterCount: voterRes ? voterRes.total : 0,
				trusteeCount: trusteeRes ? trusteeRes.total : 0,
			})
		})
	},

	getManageDetail: function(req, res, next){
		block.latestDetails(req.params.electionID, ["name", "description", "start", "end", "key", "admin"], function(result){
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
			start: new Date(data.start),
			end: new Date(data.end),
		}

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edited election details");
		}, true);
	},

	getManageQuestion: function(req, res, next){
		block.latestDetails(req.params.electionID, ["questions"], function(result){
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
		block.latestDetails(req.params.electionID, ["servers"], function(result){
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

		block.latestVoters(req.params.electionID, null, skip, limit, function(result){
			res.json(result);
		});
	},

	addVoterReq: function(req, res, next){
		var voters = JSON.parse(req.body.voters);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add voter request:"), chalk.grey(JSON.stringify(voters)));

		var signData = [], fullData = [];
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

			let promArr = [], failArr = [];
			cacheData.fullData.forEach(function(v){
				let subject = "[eVoting] Vote invitation";
				let html = `
					<p>You have been invited to vote in an election.</p>
					<p>Your voter ID: ${v.id}</p>
					<p>Here is your private key for this election, please keep it confidential:</p>
					<p>${v.private_key.replace(/\n/g,'<br/>')}</p>
					<p>You can change the key via this link if you want to do so:</p>
					<p>${indexURL}election/manage/${req.params.electionID}/voters/changeKey</p>
					<p>Please vote via this link when the election started:</p>
					<p>${indexURL}ballot/prepare/${req.params.electionID}</p>`

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

		block.latestVoters(req.params.electionID, data.id, null, null, function(result){
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

		block.latestTrustees(req.params.electionID, null, skip, limit, function(result){
			res.json(result);
		});
	},

	addTrusteeReq: function(req, res, next){
		var trustees = JSON.parse(req.body.trustees);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add trustee request:"), chalk.grey(JSON.stringify(trustees)));

		var signData = [], fullData = [];
		block.latestDetails(req.params.electionID, ["key"], function(result){
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

			let promArr = [], failArr = [];
			cacheData.fullData.forEach(function(t){
				let subject = "[eVoting] Trustee invitation";
				let html = `
					<p>You have been invited to be a trustee in an election.</p>
					<p>Your trustee ID: ${t.trusteeID}</p>
					<p>Here is your trustee private key for this election:</p>
					<p>${t.x}</p>
					<p>Please change the private key ASAP, and keep the new key confidential:</p>
					<p>${indexURL}election/manage/${req.params.electionID}/trustees/changeKey</p>`

				promArr.push(email.sendEmail([], [t.email], html, "", subject, []).then(function(data){
					// console.log(data)
				}).catch((err) => console.log(err)))
			})

			Promise.all(promArr).then(function(){
				console.log(chalk.black.bgMagenta("[Election]"), "Sent email.");
				res.json({success: true});
			})
		}, false);
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
		block.latestDetails(req.params.electionID, ["key"], function(result){
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

		block.latestDetails(req.params.electionID, ["key"], function(electRes){
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

			block.latestTrustees(req.params.electionID, data.trusteeID, null, null, function(trustRes){
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

	freezeReq: function(req, res, next){
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Election freeze request"));

		var eleRes, trustRes;
		var eProm = new Promise(function(resolve, reject){
			block.latestDetails(req.params.electionID, ['key'], function(result){
				eleRes = result;
				resolve();
			})
		})
		var tProm = new Promise(function(resolve, reject){
			block.latestTrustees(req.params.electionID, null, null, null, function(result){
				trustRes = result;
				resolve();
			})
		})

		Promise.all([eProm, tProm]).then(function(){
			let p = bigInt(encoding.base64ToHex(eleRes[0].key.p),16);
			let y = bigInt(1);
			trustRes.result.forEach(function(t){
				if(!t.a || !t.f){
					throw "All trustee must generate their private key and proof."
				}
				y = y.multiply(bigInt(encoding.base64ToHex(t.y),16)).mod(p);
			})

			let signData = {
				key: {
					p: eleRes[0].key.p,
					g: eleRes[0].key.g,
					y: encoding.hexToBase64(y.toString(16))
				},
				frozenAt: new Date()
			}
			let tempID = uuidv4();
			reqCache.set(tempID, {
				signData: signData
			}, 600);

			res.json({success: true, tempID: tempID, signData: signData});
		}).catch(function(err){
			console.log(err);
			res.json({success: false, msg: err});
		})
	},

	freezeConfirm: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Election freeze receive sign: "), chalk.grey(JSON.stringify(data)));

		var blockData = reqCache.get(data.tempID).signData;
		reqCache.del(data.tempID);

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Election freeze.");

			let allBlock, serverRes;
			let blockProm = new Promise(function(resolve, reject){
				block.allBlocks(req.params.electionID, null, null, function(result){
					allBlock = result
					resolve();
				})
			})
			let eleProm = new Promise(function(resolve, reject){
				block.latestDetails(req.params.electionID, ['servers'], function(result){
					serverRes = result[0].servers
					resolve();
				})
			})

			Promise.all([blockProm, eleProm]).then(function(){
				let form = {
					blocks: JSON.stringify(allBlock),
				}
				let servers = serverRes.map((s) => s.serverID)
				connection.broadcast("POST", "/blockchain/sync/electionFreeze", form, false, servers, null, null, null);
			})

			// blockChainController.initTimer(newBlock_.data[0].frozenAt, newBlock_.electionID);
		}, true);
	},

	getIndex: function(req, res, next){
		block.cachedDetails(req.params.electionID, ["name", "description", "start", "end", "questions", "servers"], false, function(eDetails){
			res.render('eIndex', {electionID: req.params.electionID, eDetails: eDetails});
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

				block.latestDetails(eID, [], function(result){
					block.createBlock(eID, result[0].blockSeq + 1, "Election Details", [blockData], result[0].hash, null, false, function(){
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
				block.createBlock(electionID, blockSeq, "Election Details", [blockData], previousHash, res, broadcastBlockSign, successCallback, sendSuccessRes);
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		}

		if(eID){
			block.latestDetails(eID, ["admin"], VnC);
		}else{
			VnC(null);
		}
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
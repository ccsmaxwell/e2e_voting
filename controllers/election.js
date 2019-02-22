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
var zkProof = require('./lib/zkProof');
var blockQuery = require('./lib/blockQuery');
var blockUpdate = require('./lib/blockUpdate');

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

		module.exports.verifyAndCreate(null, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Created new election chain");
		}, true);
	},

	getManage: function(req, res, next){
		blockQuery.latestDetails(req.params.electionID, ["name", "description", "start", "end", "questions", "servers"], function(result){
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
			blockQuery.latestVoters(req.params.electionID, null, 0, 1, function(result){
				voterRes = result;
				resolve();
			})
		})
		var tProm = new Promise(function(resolve, reject){
			blockQuery.latestTrustees(req.params.electionID, null, 0, 1, function(result){
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
		blockQuery.latestDetails(req.params.electionID, ["name", "description", "start", "end", "key", "admin"], function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edited election details");
		}, true);
	},

	getManageQuestion: function(req, res, next){
		blockQuery.latestDetails(req.params.electionID, ["questions"], function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edit question success");
		}, true);
	},

	getManageServer: function(req, res, next){
		blockQuery.latestDetails(req.params.electionID, ["servers"], function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Edit server success");
		}, true);
	},

	getManageVoterList: function(req, res, next){
		var page = parseInt(req.query.page);
		var limit = parseInt(req.query.limit);
		var skip = (page-1)*limit;

		blockQuery.latestVoters(req.params.electionID, null, skip, limit, function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
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

		blockQuery.latestVoters(req.params.electionID, data.id, null, null, function(result){
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

		blockQuery.latestTrustees(req.params.electionID, null, skip, limit, function(result){
			res.json(result);
		});
	},

	addTrusteeReq: function(req, res, next){
		var trustees = JSON.parse(req.body.trustees);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Add trustee request:"), chalk.grey(JSON.stringify(trustees)));

		var signData = [], fullData = [];
		blockQuery.latestDetails(req.params.electionID, ["key"], function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Delete trustees success (marked public_key as empty).");
		}, true);
	},

	getForTrusteeChangeKey: function(req, res, next){
		blockQuery.latestDetails(req.params.electionID, ["key"], function(result){
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

		blockQuery.latestDetails(req.params.electionID, ["key"], function(electRes){
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

			blockQuery.latestTrustees(req.params.electionID, data.trusteeID, null, null, function(trustRes){
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
			blockQuery.latestDetails(req.params.electionID, ['key'], function(result){
				eleRes = result;
				resolve();
			})
		})
		var tProm = new Promise(function(resolve, reject){
			blockQuery.latestTrustees(req.params.electionID, null, null, null, function(result){
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

		module.exports.verifyAndCreate(req.params.electionID, blockData, data.adminSign, res, false, false, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Election freeze.");

			let allBlock, serverRes;
			let blockProm = new Promise(function(resolve, reject){
				blockQuery.allBlocks(req.params.electionID, null, null, function(result){
					allBlock = result
					resolve();
				})
			})
			let eleProm = new Promise(function(resolve, reject){
				blockQuery.latestDetails(req.params.electionID, ['servers'], function(result){
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
		blockQuery.cachedDetails(req.params.electionID, ["name", "description", "start", "end", "questions", "servers"], false, function(eDetails){
			res.render('eIndex', {electionID: req.params.electionID, eDetails: eDetails});
		})
	},

	getIndexInfo: function(req, res, next){
		var allTrustee, allTallyBlock;
		var tProm = new Promise(function(resolve, reject){
			blockQuery.latestTrustees(req.params.electionID, null, null, null, function(result){
				allTrustee = result.result
				resolve();
			})
		})
		var bProm = new Promise(function(resolve, reject){
			blockQuery.allTallyBlocks(req.params.electionID, null, true, function(tBlocks){
				allTallyBlock = tBlocks
				resolve();
			})
		})

		Promise.all([tProm, bProm]).then(function(){
			res.json({success: true, trustee: allTrustee, tallyBlock: allTallyBlock});
		})
	},

	getVoterList: function(req, res, next){
		var page = parseInt(req.query.page);
		var limit = parseInt(req.query.limit);
		var skip = (page-1)*limit;

		blockQuery.getVoterBallot(req.params.electionID, true, skip, limit, function(bRes){
			res.json(bRes)
		})
	},

	endElection: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("End election:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			endAt: new Date(data.endAt)
		}

		module.exports.verifyAndCreateTallyBlock(req.params.electionID, blockData, data.adminSign, res, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Ended election.");
		}, true);
	},

	tallyReq: function(req, res, next){
		var serverList = JSON.parse(req.body.serverList);
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Tally request:"), chalk.grey(JSON.stringify(serverList)));

		if(serverList.length==0) return res.json({success: false, msg: "Need at least 1 server to tally."});

		var voterRes, allServers;
		var vProm = new Promise(function(resolve, reject){
			blockQuery.latestVoters(req.params.electionID, null, 0, 1, function(result){
				voterRes = result
				resolve();
			})
		})
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(req.params.electionID, ['servers'], false, function(result){
				allServers = result.servers.map((s) => s.serverID)
				resolve();
			})
		})

		Promise.all([vProm, eProm]).then(function(){
			if(!serverList.every(s => allServers.includes(s))) return res.json({success: false, msg: "All tallying server must in the election setting."});
			if(serverList.length > voterRes.total) return res.json({success: false, msg: "Number of server more than the number of voters."});

			let signData = {
				tallyInfo: [],
				tallyAt: new Date()
			};
			let size = Math.floor(voterRes.total / serverList.length);
			serverList.forEach(function(s, i){
				signData.tallyInfo.push({
					serverID: s,
					start: size*i,
					end: i==serverList.length-1 ? voterRes.total-1 : size*(i+1)-1
				})
			})
			let tempID = uuidv4();
			reqCache.set(tempID, {
				signData: signData
			}, 600);

			res.json({success: true, tempID: tempID, signData: signData});
		})
	},

	tallyConfirm: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Start tally receive admin sign:"), chalk.grey(JSON.stringify(data)));

		var cacheData = reqCache.get(data.tempID);
		reqCache.del(data.tempID);
		var blockData = cacheData.signData

		module.exports.verifyAndCreateTallyBlock(req.params.electionID, blockData, data.adminSign, res, function(){
			console.log(chalk.black.bgMagenta("[Election]"), "Tallying election.");
		}, true);
	},

	decryptReq: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Start decrypt election request:"), chalk.grey(JSON.stringify(data)));

		var blockData = {
			decryptAt: new Date(data.decryptAt)
		}

		blockQuery.allTallyBlocks(req.params.electionID, null, true, function(tBlocks){
			let allServers=[], serverDone=[];
			for(let b of tBlocks){
				if(b.data[0].tallyInfo){
					allServers = b.data[0].tallyInfo.map((s) => s.serverID)
				}else if(b.data[0].partialTally){
					serverDone.push(b.data[0].serverID)
				}else if(b.data[0].decryptAt){
					return res.json({success: false, msg: "Already started decrypt process."});
				}
			}

			if(allServers.length==0) return res.json({success: false, msg: "No server selected for Tallying yet."});
			if(allServers.filter(v => serverDone.includes(v)).length != allServers.length) return res.json({success: false, msg: "Some server have not finish Tallying."});
			module.exports.verifyAndCreateTallyBlock(req.params.electionID, blockData, data.adminSign, res, function(){
				module.exports.notifyNextDecrypt(req.params.electionID);
			}, true);
		})
	},

	getForTrusteeDecrypt: function(req, res, next){
		var eDetails, lastPartialDecrypt;
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(req.params.electionID, ['key'], false, function(result){
				eDetails = result
				resolve();
			})
		})
		var bProm = new Promise(function(resolve, reject){
			blockQuery.allTallyBlocks(req.params.electionID, {"data.partialDecrypt": {$ne: null}}, true, function(result){
				lastPartialDecrypt = result.length>0 ? result[result.length-1].data[0].partialDecrypt : null
				resolve();
			})
		})

		Promise.all([eProm, bProm]).then(function(){
			if(lastPartialDecrypt){
				return res.render('eTallyDecrypt', {electionID: req.params.electionID, eDetails: eDetails, partialDecrypt: lastPartialDecrypt})
			}
			blockQuery.allTallyBlocks(req.params.electionID, {"data.partialTally": {$ne: null}}, true, function(result){
				let partialDecrypt = [];
				for(let b of result){
					partialDecrypt.push(b.data[0].partialTally)
				}
				res.render('eTallyDecrypt', {electionID: req.params.electionID, eDetails: eDetails, partialDecrypt: partialDecrypt})
			})
		})
	},

	trusteeSubmitDecrypt: function(req, res, next){
		var data = req.body;
		var partialDecrypt = JSON.parse(data.partialDecrypt)
		var proof = JSON.parse(data.proof)
		console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Trustee submit partial decrypt:"), chalk.grey(JSON.stringify(data)));

		var electionKey, trusteeInfo, lastBlock;
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(data.electionID, ['key'], false, function(result){
				electionKey = result.key
				resolve();
			})
		})
		var tProm = new Promise(function(resolve, reject){
			blockQuery.latestTrustees(data.electionID, data.trusteeID, null, null, function(result){
				trusteeInfo = result.result[0]
				resolve();
			})
		})
		var bProm = new Promise(function(resolve, reject){
			blockQuery.lastBlock(data.electionID, true, function(result){
				lastBlock = result[0];
				resolve();
			})
		})

		Promise.all([eProm, tProm, bProm]).then(function(){
			if(!zkProof.trusteeDecryptVerify(electionKey, trusteeInfo.y, partialDecrypt, proof)){
				console.log(chalk.black.bgMagenta("[Election]"), chalk.whiteBright("Trustee decrypt proof verification FAIL."));
				return res.json({success: false, msg: "Verification fail."});
			}

			console.log(chalk.black.bgMagenta("[Election]"), chalk.whiteBright("Trustee decrypt proof verification success."));
			let blockData = {
				trusteeID: data.trusteeID,
				partialDecrypt: partialDecrypt,
				proof: proof
			}
			blockUpdate.createBlock(data.electionID, null, lastBlock.blockSeq+1, "Election Tally", [blockData], lastBlock.hash, res, true, true, function(){
				console.log(chalk.black.bgMagenta("[Election]"), chalk.whiteBright("Trustee decrypt proof block created, wait a few seconds for next step."));
				setTimeout(function(){
					module.exports.notifyNextDecrypt(data.electionID);
				}, 3000)
			}, true);
		}).catch(function(err){
			console.log(err);
			res.json({success: false, msg: "Database fail."});
		})
	},

	getResult: function(req, res, next){
		var eDetails, eResult;
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(req.params.electionID, ['questions', 'name', 'description'], false, function(result){
				eDetails = result;
				resolve();
			})
		})
		var rProm = new Promise(function(resolve, reject){
			blockQuery.allTallyBlocks(req.params.electionID, {"data.result": {$ne: null}}, true, function(result){
				eResult = result[0].data[0].result
				resolve();
			})
		})

		Promise.all([eProm, rProm]).then(function(){
			res.render('eTallyResult', {electionID: req.params.electionID, eDetails: eDetails, result: eResult})
		})
	},

	notifyNextDecrypt: function(eID){
		var allTrustee, trusteeDone;
		var tProm = new Promise(function(resolve, reject){
			blockQuery.latestTrustees(eID, null, null, null, function(result){
				allTrustee = result.result;
				resolve();
			});
		})
		var bProm = new Promise(function(resolve, reject){
			blockQuery.allTallyBlocks(eID, {"data.partialDecrypt": {$ne: null}}, true, function(result){
				trusteeDone = result.map((b) => b.data[0].trusteeID)
				resolve();
			})
		})

		Promise.all([tProm, bProm]).then(function(){
			for(let t of allTrustee){
				if(!trusteeDone.includes(t._id)){
					let subject = "[eVoting] Trustee partial decrypt request";
					let html = `
						<p>An election has finished voting, waiting for all trustee(s) to fully decrypt the tally.</p>
						<p>Trustee ID: ${t._id}</p>
						<p>Election ID: ${eID}</p>
						<p>Please apply your trustee private key to the election tally ASAP, via the following link:</p>
						<p>${indexURL}election/tally/${eID}/trustee-decrypt</p>`

					email.sendEmail([], [t.email], html, "", subject, []).then(function(data){
						console.log(chalk.black.bgMagenta("[Election]"), chalk.whiteBright("Email sent to trustee: "), chalk.grey(data));
					}).catch((err) => console.log(err))
					return;
				}
			}
			module.exports.computeResult(eID);
		}).catch((err) => console.log(err))
	},

	computeResult: function(eID){
		var eKey, maxVoter, lastBlock;
		var eProm = new Promise(function(resolve, reject){
			blockQuery.cachedDetails(eID, ['key'], false, function(result){
				eKey = encoding.bulkBase64ToBinInt(result.key, ['p', 'g']);
				resolve();
			})
		})
		var mProm = new Promise(function(resolve, reject){
			blockQuery.allTallyBlocks(eID, {"data.tallyInfo": {$ne: null}}, true, function(result){
				let tallyInfo = result[0].data[0].tallyInfo;
				maxVoter = Math.max(tallyInfo[0].end-tallyInfo[0].start+1, tallyInfo[tallyInfo.length-1].end-tallyInfo[tallyInfo.length-1].start+1);
				resolve();
			})
		})
		var lProm = new Promise(function(resolve, reject){
			blockQuery.lastBlock(eID, true, function(result){
				lastBlock = result[0];
				resolve();
			})
		})

		Promise.all([eProm, mProm, lProm]).then(function(){
			console.log(chalk.black.bgMagentaBright("[Election]"), chalk.whiteBright("Start compute result"));
			let disLogTable = {}
			let gCurr = bigInt(1);
			for(let i=0; i<=maxVoter; i++){
				disLogTable[gCurr.toString(16)] = i;
				gCurr = gCurr.multiply(eKey.g).mod(eKey.p);
			}

			let eResult = [];
			lastBlock.data[0].partialDecrypt[0].forEach(function(q, qi){
				eResult.push([]);
				q.forEach(function(a, ai){
					eResult[qi].push([]);
					lastBlock.data[0].partialDecrypt.forEach(function(s, si){
						let c1x = bigInt(encoding.base64ToHex(lastBlock.data[0].partialDecrypt[si][qi][ai].c1x),16);
						let c2 = bigInt(encoding.base64ToHex(lastBlock.data[0].partialDecrypt[si][qi][ai].c2),16);
						let gm = c1x.modInv(eKey.p).multiply(c2).mod(eKey.p);
						eResult[qi][ai].push(disLogTable[gm.toString(16)]);
					})
				})
			})

			let blockData = {
				result: eResult
			}
			blockUpdate.createBlock(eID, null, lastBlock.blockSeq+1, "Election Tally", [blockData], lastBlock.hash, null, true, true, function(){
				console.log(chalk.black.bgMagenta("[Election]"), chalk.whiteBright("Election result compute success."));
			}, false);
		}).catch((err) => console.log(err))
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

				blockQuery.latestDetails(eID, [], function(result){
					blockUpdate.createBlock(eID, null, result[0].blockSeq + 1, "Election Details", [blockData], result[0].hash, null, false, false, function(){
						console.log(chalk.black.bgMagenta("[Election]"), "Saved new block for key change.");
					}, false);
				});
			}, keyChangeWaitTime)
		}
	},

	verifyAndCreate: function(eID, blockData, adminSign, res, broadcastBlock, broadcastSign, successCallback, sendSuccessRes){
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
				blockUpdate.createBlock(electionID, null, blockSeq, "Election Details", [blockData], previousHash, res, broadcastBlock, broadcastSign, successCallback, sendSuccessRes);
			}else{
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
				res.json({success: false, msg: "Cannot verify Admin key."});
			}
		}

		if(eID){
			blockQuery.latestDetails(eID, ["admin"], VnC);
		}else{
			VnC(null);
		}
	},

	verifyAndCreateTallyBlock: function(eID, blockData, adminSign, res, successCallback, sendSuccessRes){
		blockQuery.cachedDetails(eID, ["admin"], false, function(eDetails){
			blockQuery.lastBlock(eID, true, function(lastBlock){
				if(!crypto.createVerify('SHA256').update(JSON.stringify(blockData)).verify(eDetails.admin.pubKey, adminSign, "base64")){
					console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification FAIL");
					res.json({success: false, msg: "Cannot verify Admin key."});
				}
				console.log(chalk.black.bgMagenta("[Election]"), "Admin key verification success");
				blockData["adminSign"] = adminSign;

				blockUpdate.createBlock(eID, null, lastBlock[0].blockSeq+1, "Election Tally", [blockData], lastBlock[0].hash, res, true, true, successCallback, sendSuccessRes);
			})
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
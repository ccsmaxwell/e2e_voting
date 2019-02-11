var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var NodeCache = require("node-cache");
var chalk = require('chalk');
var bigInt = require("big-integer");

var Ballot = require('../models/ballot');

var encoding = require('./lib/encoding');
var zkProof = require('./lib/zkProof');
var connection = require('./lib/connection');
var block = require('./lib/block');

var ballotCache = new NodeCache();

const {serverID, serverPriKey} = _config;

module.exports = {

	getEmptyBallot: function(req, res, next){
		block.cachedDetails(req.params.electionID, ["name", "description", "start", "end", "key", "questions"], false, function(eDetails){
			res.render('bPrepare', {electionID: req.params.electionID, eDetails: eDetails});
		})
	},

	ballotSubmit: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgCyanBright("[Ballot]"), chalk.whiteBright("Ballot submit from voter: "), chalk.grey(data.voterID));

		var ballotData = {
			electionID: data.electionID,
			voterID: data.voterID,
			answers: JSON.parse(data.answers),
			voterSign: data.voterSign,
			receiveTime: new Date()
		}
		var verifyData = {
			electionID: ballotData.electionID,
			voterID: ballotData.voterID,
			answers: ballotData.answers,
		}
		module.exports.ballotVerification(verifyData, ballotData.voterSign, function(){
			block.cachedDetails(ballotData.electionID, ["servers"], false, function(eDetails){
				console.log(chalk.black.bgCyan("[Ballot]"), "--> Broadcast ballot to other nodes");
				connection.broadcast("POST", "/ballot/broadcast", {
					ballotData: JSON.stringify(ballotData)
				}, false, eDetails.servers.map((s) => s.serverID), null, null, null);
			})

			module.exports.saveAndSignBallot(ballotData);
			res.json({success: true});
		});
	},

	ballotReceive: function(req, res, next){
		var ballotData = JSON.parse(req.body.ballotData);
		console.log(chalk.black.bgCyanBright("[Ballot]"), chalk.whiteBright("<-- Receive from broadcast: "), chalk.grey(ballotData.voterID), chalk.grey(ballotData.electionID));

		var verifyData = {
			electionID: ballotData.electionID,
			voterID: ballotData.voterID,
			answers: ballotData.answers,
		}
		module.exports.ballotVerification(verifyData, ballotData.voterSign, function(){
			module.exports.saveAndSignBallot(ballotData);
		})

		res.json({success: true});
	},

	signReceive: function(req, res, next){
		var data = req.body;
		console.log(chalk.black.bgCyan("[Ballot]"), "<-- Receive sign: ", chalk.grey(JSON.stringify(data)));

		var signData = JSON.parse(data.sign);
		module.exports.saveSign(data.electionID, data.voterSign, [signData], function(result){
			res.json({success: true});

			if(result){
				console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign from: ", chalk.grey(signData.serverID));
				return;
			}
			let allSign = ballotCache.get(data.voterSign);
			if(!allSign){
				allSign = []
			}
			allSign.push(signData);
			ballotCache.set(data.voterSign, allSign, 600);
			console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign in cache.")
		});
	},

	ballotVerification: function(verifyData, voterSign, successCallBack){
		var voterProm = new Promise(function(resolve, reject){
			block.latestVoters(verifyData.electionID, verifyData.voterID, null, null, function(voterRec){
				let voterPublicKey = voterRec.result[0].public_key;
				let verify = crypto.createVerify('SHA256');
				verify.update(JSON.stringify(verifyData));

				if(!verify.verify(voterPublicKey, voterSign, "base64")){
					throw chalk.black.bgCyan("[Ballot]") + " Voter key verification FAIL";
				}
				resolve();
			})
		})

		var questProm = new Promise(function(resolve, reject){
			block.cachedDetails(verifyData.electionID, ["key", "questions"], false, function(eDetails){
				let p = bigInt(encoding.base64ToHex(eDetails.key.p),16);
				let g = bigInt(encoding.base64ToHex(eDetails.key.g),16);
				let y = bigInt(encoding.base64ToHex(eDetails.key.y),16);

				eDetails.questions.forEach(function(q,i){
					let question_c1 = bigInt(1);
					let question_c2 = bigInt(1);

					q.answers.forEach(function(a,j){
						let c1 = bigInt(encoding.base64ToHex(verifyData.answers[i].choices[j].c1),16);
						question_c1 = question_c1.multiply(c1).mod(p);
						let c2 = bigInt(encoding.base64ToHex(verifyData.answers[i].choices[j].c2),16);
						question_c2 = question_c2.multiply(c2).mod(p);

						let msg = {
							electionID: verifyData.electionID,
							questionIndex: i,
							choiceIndex: j,
							c1: verifyData.answers[i].choices[j].c1,
							c2: verifyData.answers[i].choices[j].c2
						}
						if(!zkProof.ballotProofVerify(msg,p,g,y,0,1,c1,c2,verifyData.answers[i].choices[j].proof)){
							throw chalk.black.bgCyan("[Ballot]") + " Choice 0/1 verification FAIL (q:"+i+",c:"+j+")";
						}
					})

					let msg = {
						electionID: verifyData.electionID,
						questionIndex: i,
						question_c1: encoding.hexToBase64(question_c1.toString(16)),
						question_c2: encoding.hexToBase64(question_c2.toString(16)),
					}
					if(!zkProof.ballotProofVerify(msg,p,g,y,q.min_choice,q.max_choice,question_c1,question_c2,verifyData.answers[i].overall_proof)){
						throw chalk.black.bgCyan("[Ballot]") + " Question overall proof verification FAIL (q:"+i+")";
					}
				})
				resolve();
			})
		})

		Promise.all([voterProm, questProm]).then(function(){
			console.log(chalk.black.bgCyan("[Ballot]"), "Ballot verification success");
			successCallBack();
		}).catch(function(err){
			console.log(err);
		})
	},

	saveAndSignBallot: function(ballotData){
		var newBallot = new Ballot();
		newBallot.electionID = ballotData.electionID;
		newBallot.voterID = ballotData.voterID;
		newBallot.answers = ballotData.answers;
		newBallot.voterSign = ballotData.voterSign;
		newBallot.receiveTime = ballotData.receiveTime;
		newBallot.save().then(function(row){
			console.log(chalk.black.bgCyan("[Ballot]"), "Saved ballot");

			let cacheSign = ballotCache.get(newBallot.voterSign);
			if(cacheSign){
				ballotCache.del(newBallot.voterSign);
				module.exports.saveSign(ballotData.electionID, ballotData.voterSign, cacheSign, () => console.log(chalk.black.bgCyan("[Ballot]"), "Saved cache sign."));
			}

			let sign = {
				serverID: serverID,
				ballotSign: crypto.createSign('SHA256').update(JSON.stringify(ballotData)).sign(serverPriKey, 'base64')
			}
			module.exports.saveSign(ballotData.electionID, ballotData.voterSign, [sign], () => console.log(chalk.black.bgCyan("[Ballot]"), "Saved self sign."));

			block.cachedDetails(ballotData.electionID, ["servers"], false, function(eDetails){
				console.log(chalk.black.bgCyan("[Ballot]"), "--> Broadcast sign to other nodes");
				connection.broadcast("POST", "/ballot/broadcast/sign", {
					electionID: ballotData.electionID,
					voterSign: ballotData.voterSign,
					sign: JSON.stringify(sign)
				}, false, eDetails.servers.map((s) => s.serverID), null, null, null);
			})
		}).catch(function(err){
			console.log(err);
		});	
	},

	saveSign: function(eID, voterSign, signArr, successCallBack){
		Ballot.findOneAndUpdate({
			electionID: eID,
			voterSign: voterSign
		},{
			$push: {sign: {
				$each: signArr
			}}
		}).then(function(result){
			if(successCallBack){
				successCallBack(result);
			}
		})
	}

}
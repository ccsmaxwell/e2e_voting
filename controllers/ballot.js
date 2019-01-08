var request = require('request');
var ip = require('ip');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var NodeCache = require("node-cache");
var chalk = require('chalk');
var bigInt = require("big-integer");

var ballotCache = new NodeCache();

var Node_server = require('../models/node_server');
var Ballot = require('../models/ballot');
var Block = require('../models/block');

var encoding = require('./lib/encoding');
var zkProof = require('./lib/zkProof');

module.exports = {

	ballotVerification: function(verifyData, voterSign, successCallBack){
		Block.aggregate([
			{$match: {
				"electionID": verifyData.electionID,
				"data.voters.id": verifyData.voterID
			}},
			{$unwind: "$data"},
			{$unwind: "$data.voters"},
			{$match: {"data.voters.id": verifyData.voterID}},
			{$project: {"data.voters": 1}}
		]).then(function(voterBlock){
			let voterPublicKey = voterBlock[0].data.voters.public_key;
			let verify = crypto.createVerify('SHA256');
			verify.update(JSON.stringify(verifyData));
			if(verify.verify(voterPublicKey, voterSign, "base64")){
				console.log(chalk.black.bgCyan("[Ballot]"), "Voter key verification success");
			}else{
				throw chalk.black.bgCyan("[Ballot]") + " Voter key verification FAIL";
			}

			Block.aggregate([
				{$match: {
					"electionID": verifyData.electionID,
					$or: [
						{"data.key": { $exists: true }},
						{"data.questions": { $exists: true }}
					]
				}},
				{$unwind: "$data"},
				{$project: {"data.key": 1, "data.questions": 1}}
			]).then(function(dataBlock){
				let p = bigInt(encoding.base64ToHex(dataBlock[0].data.key.p),16);
				let g = bigInt(encoding.base64ToHex(dataBlock[0].data.key.g),16);
				let y = bigInt(encoding.base64ToHex(dataBlock[0].data.key.y),16);

				dataBlock[0].data.questions.forEach(function(q,i){
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
						let e_all = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')),16).mod(p);
						let e_sum = bigInt(0);
						for(let v=0 ; v<=1 ; v++){
							let proof = zkProof.proofToHex(verifyData.answers[i].choices[j].proof[v]);
							e_sum = e_sum.add(proof.e).mod(p);

							if(!zkProof.verifyBallot(p,g,y,proof.a1,proof.a2,proof.e,proof.f,c1,c2,v)){
								throw chalk.black.bgCyan("[Ballot]") + " Choice 0/1 verification FAIL (q:"+i+",c:"+j+",v:"+v+")";
							}
						}

						if(!e_sum.eq(e_all)){
							throw chalk.black.bgCyan("[Ballot]") + " Choice 0/1 (e_sum) verification FAIL (q:"+i+",c:"+j+")";
						}
					})

					let msg = {
						electionID: verifyData.electionID,
						questionIndex: i,
						question_c1: encoding.hexToBase64(question_c1.toString(16)),
						question_c2: encoding.hexToBase64(question_c2.toString(16)),
					}
					let e_all = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')),16).mod(p);
					let e_sum = bigInt(0);
					for(let v=q.min_choice ; v<=q.max_choice ; v++){
						let proof = zkProof.proofToHex(verifyData.answers[i].overall_proof[v-q.min_choice]);
						e_sum = e_sum.add(proof.e).mod(p);

						if(!zkProof.verifyBallot(p,g,y,proof.a1,proof.a2,proof.e,proof.f,question_c1,question_c2,v)){
							throw chalk.black.bgCyan("[Ballot]") + " Question overall proof verification FAIL (q:"+i+",v:"+v+")";
						}
					}

					if(!e_sum.eq(e_all)){
						throw chalk.black.bgCyan("[Ballot]") + " Question overall proof (e_sum) verification FAIL (q:"+i+")";
					}

					console.log(chalk.black.bgCyan("[Ballot]"), "Question "+i+" verification success");
				})

				successCallBack();
			}).catch(function(err){
				console.log(err);
			})
			
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
		newBallot.ballotID = ballotData.ballotID;
		newBallot.receiveTime = ballotData.receiveTime;
		newBallot.save().then(function(row){
			console.log(chalk.black.bgCyan("[Ballot]"), "Saved ballot");

			let cacheSign = ballotCache.get(newBallot.ballotID);
			if(cacheSign){
				ballotCache.del(newBallot.ballotID);
				let pushSign = []
				cacheSign.forEach(function(s){
					pushSign.push({
						trusteeID: s.trusteeID,
						signHash: s.signHash
					})
				})

				Ballot.findOneAndUpdate({
					electionID: ballotData.electionID,
					ballotID: ballotData.ballotID
				},{
					$push: {sign: {
						$each: pushSign
					}}
				}).then(function(result){
					console.log(chalk.black.bgCyan("[Ballot]"), "Saved cache sign.");
				}).catch(function(err){
					console.log(err);
				})
			}

			var signHash = crypto.createHash('sha256').update(JSON.stringify(ballotData)).digest('base64');
			Ballot.findOneAndUpdate({
				electionID: ballotData.electionID,
				ballotID: ballotData.ballotID
			},{
				$push: {sign: {
					trusteeID: (process.env.PORT+"").trim(),
					signHash: signHash
				}}
			}).then(function(result){
				console.log(chalk.black.bgCyan("[Ballot]"), "Signed ballot: ", chalk.grey(ballotData.ballotID));
			}).catch(function(err){
				console.log(err);
			})

			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						console.log(chalk.black.bgCyan("[Ballot]"), "--> Broadcast sign to: ", chalk.grey(e.IP+":"+e.port));

						request
							.post({url:"http://"+e.IP+":"+e.port+"/ballot/broadcastSign", form:{
								electionID: ballotData.electionID,
								ballotID: ballotData.ballotID,
								trusteeID: (process.env.PORT+"").trim(),
								signHash: signHash
							}})
							.on('data', function(data){
								// console.log(data.toString());
							})							
							.on('error', function(err){
								console.log(err);
							})
					}
				})
			});	
		}).catch(function(err){
			console.log(err);
		});	
	},

	voterSubmit: function(req, res, next){
		var ballotData = req.body;
		ballotData.answers = JSON.parse(ballotData.answers);
		ballotData.ballotID = uuidv4();
		ballotData.receiveTime = new Date();
		console.log(chalk.black.bgCyanBright("[Ballot]"), chalk.whiteBright("Ballot submit: "), chalk.grey(ballotData.voterID), chalk.grey(ballotData.electionID));

		var verifyData = {
			electionID: ballotData.electionID,
			voterID: ballotData.voterID,
			answers: ballotData.answers,
		}
		module.exports.ballotVerification(verifyData, ballotData.voterSign, function(){
			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						console.log(chalk.black.bgCyan("[Ballot]"), "--> Broadcast ballot to: ", chalk.grey(e.IP+":"+e.port));

						request
							.post({url:"http://"+e.IP+":"+e.port+"/ballot/broadcastBallot", form:{
								electionID: ballotData.electionID,
								voterID: ballotData.voterID,
								answers: JSON.stringify(ballotData.answers),
								voterSign: ballotData.voterSign,
								ballotID: ballotData.ballotID,
								receiveTime: ballotData.receiveTime
							}})
							.on('data', function(data){
								// console.log(data);
							})							
							.on('error', function(err){
								console.log(err);
							})
					}
				})
			});

			module.exports.saveAndSignBallot(ballotData);
			res.json({success: true});
		});
	},

	ballotReceive: function(req, res, next){
		var ballotData = req.body;
		ballotData.answers = JSON.parse(ballotData.answers);
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
		var signData = req.body;
		console.log(chalk.black.bgCyan("[Ballot]"), "<-- Receive sign: ", chalk.grey(signData.trusteeID), chalk.grey(signData.ballotID));

		Ballot.findOneAndUpdate({
			electionID: signData.electionID,
			ballotID: signData.ballotID
		},{
			$push: {sign: {
				trusteeID: signData.trusteeID,
				signHash: signData.signHash
			}}
		}).then(function(result){
			if(result){
				console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign from: ", chalk.grey(signData.trusteeID));
			}else{
				let allSign = ballotCache.get(signData.ballotID);
				if(!allSign){
					allSign = []
				}
				allSign.push(signData);
				ballotCache.set(signData.ballotID, allSign, 600);
				console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign in cache.")
			}

			res.json({success: true});
		}).catch(function(err){
			console.log(err);
		})		
	}

}
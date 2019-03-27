global._config = JSON.parse(process.argv[2]);
const {serverID, serverPriKey, blockTimerInterval} = _config;
require('../../config/db');

var crypto = require('crypto');
var chalk = require('chalk');
var bigInt = require("big-integer");
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');

var Ballot = require('../../models/ballot');

var encoding = require('../lib/encoding');
var zkProof = require('../lib/zkProof');
var connection = require('../lib/connection');
var blockQuery = require('../lib/blockQuery');
var server = require('../lib/server');

process.on('message', function(msg, socket){
	try{
		switch(msg.func){
			case "getEmptyBallot":
				verifyMiddleware(msg.params, msg.body, () => getEmptyBallot(msg.params, msg.body, socket));
				break;
			case "ballotSubmit":
				verifyMiddleware(msg.params, msg.body, () => ballotSubmit(msg.params, msg.body, socket));
				break;
			case "ballotReceive":
				verifyMiddleware(msg.params, msg.body, () => ballotReceive(msg.params, msg.body, socket));
				break;
			case "signReceive":
				signReceive(msg.params, msg.body, socket);
				break;
		}
	}catch(err){
		console.log(err)
	}
})

function jsonResponse(socket, obj){
	socket.end([
		'HTTP/1.1 200 OK',
		'Content-Type: application/json; charset=utf-8',
		'Connection: keep-alive',
	].join('\n') + '\n\n' + JSON.stringify(obj))
}

function verifyMiddleware(params, body, next){
	var eID = body.ballotData ? JSON.parse(body.ballotData).electionID : (body.electionID?body.electionID:params.electionID);
	blockQuery.latestDetails(eID, ["frozenAt", "end"], function(result){
		if(result.length==0 || !result[0].frozenAt || new Date() > new Date(result[0].end)) return res.status(404).send('Election not exist / not yet frozen / already ended.');
		blockQuery.allTallyBlocks(eID, {"data.endAt": {$ne: null}}, true, function(result){
			if(result.length>0) return res.status(404).send('Election already ended.');
			next();
		})
	})
}

function getEmptyBallot(params, body, socket){
	blockQuery.cachedDetails(params.electionID, ["name", "description", "start", "end", "key", "questions"], false, function(eDetails){
		let bPrepare = fs.readFileSync('../../views/bPrepare.ejs', 'utf-8');
		socket.end([
			'HTTP/1.1 200 OK',
			'Content-Type: text/html; charset=utf-8',
			'Connection: keep-alive',
		].join('\n') + '\n\n' + ejs.render(bPrepare, {electionID: params.electionID, eDetails: eDetails}, {filename: path.resolve(__dirname, "../../views/bPrepare.ejs")}))
	})
}

function ballotSubmit(params, body, socket){
	var data = body;
	console.log(chalk.black.bgCyanBright("[Ballot]"), chalk.whiteBright("Ballot submit from voter: "), chalk.grey(data.voterID));

	var ballotData = {
		electionID: data.electionID,
		voterID: data.voterID,
		answers: JSON.parse(data.answers),
		voterSign: data.voterSign,
		voterTimestamp: data.voterTimestamp,
		receiveTime: new Date()
	}
	var verifyData = {
		electionID: ballotData.electionID,
		voterID: ballotData.voterID,
		answers: ballotData.answers,
	}
	verifyBallot(verifyData, ballotData.voterSign, function(){
		blockQuery.cachedDetails(ballotData.electionID, ["servers"], false, function(eDetails){
			console.log(chalk.black.bgCyan("[Ballot]"), "--> Broadcast ballot to other nodes");
			connection.broadcast("POST", "/ballot/broadcast", {
				ballotData: JSON.stringify(ballotData)
			}, false, eDetails.servers.map((s) => s.serverID), null, null, null);
		})

		saveAndSignBallot(ballotData);
		jsonResponse(socket, {success: true});
	});
}

function ballotReceive(params, body, socket){
	var ballotData = JSON.parse(body.ballotData);
	console.log(chalk.black.bgCyanBright("[Ballot]"), chalk.whiteBright("<-- Receive from broadcast: "), chalk.grey(ballotData.voterID), chalk.grey(ballotData.electionID));

	var verifyData = {
		electionID: ballotData.electionID,
		voterID: ballotData.voterID,
		answers: ballotData.answers,
	}
	verifyBallot(verifyData, ballotData.voterSign, function(){
		saveAndSignBallot(ballotData);
	})

	jsonResponse(socket, {success: true});
}

function signReceive(params, body, socket){
	var data = body;
	console.log(chalk.black.bgCyan("[Ballot]"), "<-- Receive sign: ", chalk.grey(JSON.stringify(data)));

	var signData = JSON.parse(data.sign);
	verifySign(data.electionID, data.voterSign, [signData], function(verifiedArr){
		if(verifiedArr){
			saveSign(data.electionID, data.voterSign, verifiedArr, function(result){
				console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign from: ", chalk.grey(signData.serverID));
				jsonResponse(socket, {success: true});
			});
		}else{
			saveSign(data.electionID, data.voterSign, [signData], function(result){
				console.log(chalk.black.bgCyan("[Ballot]"), "Saved sign temporarily.");
				jsonResponse(socket, {success: true});
			});
		}
	})
}

function verifyBallot(verifyData, voterSign, successCallBack){
	var voterProm = new Promise(function(resolve, reject){
		blockQuery.latestVoters(verifyData.electionID, verifyData.voterID, null, null, function(voterRec){
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
		blockQuery.cachedDetails(verifyData.electionID, ["key", "questions"], false, function(eDetails){
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
}

function saveAndSignBallot(ballotData){
	Ballot.findOneAndUpdate({
		electionID: ballotData.electionID,
		voterSign: ballotData.voterSign
	},{
		voterID: ballotData.voterID,
		answers: ballotData.answers,
		voterTimestamp: ballotData.voterTimestamp,
		receiveTime: ballotData.receiveTime,
		sign: []
	}, {
		upsert: true
	}).then(function(originalData){
		console.log(chalk.black.bgCyan("[Ballot]"), "Saved ballot");

		if(originalData && originalData.sign){
			verifySign(ballotData.electionID, ballotData.voterSign, originalData.sign, function(verifiedArr){
				saveSign(ballotData.electionID, ballotData.voterSign, verifiedArr, () => console.log(chalk.black.bgCyan("[Ballot]"), "Saved cache sign."));
			})
		}

		let sign = {
			serverID: serverID,
			ballotSign: crypto.createSign('SHA256').update(JSON.stringify(ballotData)).sign(serverPriKey, 'base64')
		}
		saveSign(ballotData.electionID, ballotData.voterSign, [sign], () => console.log(chalk.black.bgCyan("[Ballot]"), "Saved self sign."));

		blockQuery.cachedDetails(ballotData.electionID, ["servers"], false, function(eDetails){
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
}

function verifySign(eID, voterSign, signArr, successCallBack){
	var bRes, eRes;
	var bProm = Ballot.find({
		electionID: eID,
		voterSign: voterSign,
		receiveTime: {$exists: true}
	}).then((result) => bRes = result);

	var eProm = new Promise(function(resolve, reject){
		blockQuery.cachedDetails(eID, ["servers"], false, function(result){
			eRes = result;
			resolve();
		});
	})

	Promise.all([bProm, eProm]).then(function(){
		if(!bRes || bRes.length == 0){
			return successCallBack(null);
		}
		let resArr = [], promArr = [];
		let verifyData = {
			electionID: eID,
			voterID: bRes[0].voterID,
			answers: bRes[0].answers,
			voterSign: voterSign,
			voterTimestamp: bRes[0].voterTimestamp,
			receiveTime: bRes[0].receiveTime
		}

		signArr.forEach(function(s){
			if(eRes.servers.filter(servers => (servers.serverID == s.serverID)).length == 0){
				return console.log(chalk.black.bgCyan("[Ballot]"), "Sign verification fail: server ID not exist in this election. ", chalk.grey(s.serverID));
			}
			if(bRes[0].sign.filter(sign => (sign.serverID == s.serverID)).length > 0){
				return console.log(chalk.black.bgCyan("[Ballot]"), "Sign verification fail: server ID already exist in this ballot. ", chalk.grey(s.serverID));
			}
			promArr.push(new Promise(function(resolve, reject){
				server.keyByServerID(s.serverID, false, function(serverKey){
					if(crypto.createVerify('SHA256').update(JSON.stringify(verifyData)).verify(serverKey, s.ballotSign, "base64")){
						resArr.push(s);
					}else{
						return console.log(chalk.black.bgCyan("[Ballot]"), "Sign verification fail.", chalk.grey(s.serverID));
					}
					resolve();
				})
			}))
		})

		Promise.all(promArr).then(function(){
			successCallBack(resArr);
		})
	})
}

function saveSign(eID, voterSign, signArr, successCallBack){
	Ballot.findOneAndUpdate({
		electionID: eID,
		voterSign: voterSign
	},{
		$push: {sign: {
			$each: signArr
		}}
	}, {
		upsert: true
	}).then(function(result){
		if(successCallBack){
			successCallBack(result);
		}
	})
}
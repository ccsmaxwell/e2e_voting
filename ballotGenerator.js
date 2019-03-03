// BEGIN config
const electionID = "e284a977-3bf1-4c46-8fce-4ada9a3049a8";
const voterID = "e40aa6ef-1476-41e6-8c8f-ddc461a0f9b0";
const voterPriKey = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAIChxE/AY7Dy7Q2I
Mk/78CFqKoIPQJcWBag4euWwYxBlZ/jiS+eaDwZ/RT4O33CzdqrvIpJjT8hg6ET8
vefdec9AV1g9MvM+O9j/4SNCU/p42CoDPktlNcysPeehLJ+eeaKSR67/epBPavlN
1pqJQM5Ksz/kRjSXqBtZ1UXzl8sjAgMBAAECgYAe8szgw1E5CbmvP82bIOqtn3WK
xVCtCUdjKfOnv8CV+VACua+5kX97+LMYM0vfOc6bYd3Xir1vYKGBt62ZU9gyhKo1
ZIcRGCPxl9SmlVBXpHgctSy+Qi01S4I7OHhHQ3ScEQ57sX6lpNUkpqPUpsqJn/To
TFIrWxfJfgWr+xdZwQJBANYxR+2CfAk6ByaUSPaRU5hd0uVYnq/zYI86cmsr1zDe
wtPs/g8Q4b1qkPSWfPRw10bqLsj0pOFFIyfmeUyH/u0CQQCZvTboOtR55LKdlRf1
Z8hwQ0Ar5qhwfrJeWj2TuNT3WSkqYDLz4bVEi7+RnKs9zcAInWwBTUfNMe3XBy9Z
/KBPAkAYa6X3vljF9Ie8LkvjUM5nIMtauq/c/7KSoedJsMXoHH26C9srfJFAN1Yv
jLjSZcslmq2a28mwpWFMu0o5H4hBAkBszC3OPMvfE0ygHkHdRrvfTohcSRiMu+yo
vv3yy4vTG8L5HSkR1Ho+bxN8Db5Vt4Sd1CH57eHRQfNKB+inqxMbAkEAjVay6rz4
TDMl9hBmB0e3Oo5dBe+EjzcnpD2Q2Upnu3PG1CnOnE1ZJqY5+dKK4CHK3YNWXDz5
E3myTx3IEQjOxw==
-----END PRIVATE KEY-----`;
const ballotPerTime = 10;
const timeUnitInMs = 1*1000;
const totalTimeInMs = 3*1000;
// END config

// BEGIN import/init
var bigInt = require("big-integer");
var crypto = require('crypto');

var Config = require('./config/configGlobal');
Config.init();
var mongoose = require('./config/db');

var encoding = require('./controllers/lib/encoding');
var connection = require('./lib/connection');
var server = require('./lib/server');
var blockQuery = require('./controllers/lib/blockQuery');
// END import/init

blockQuery.latestDetails(electionID, ["key", "questions"], function(result){
	let loopSend = function(){
		for(let i=0; i<ballotPerTime; i++){
			console.log(genBallot(result[0], voterID, voterPriKey))
		}
	}

	loopSend();
	let intervalObj = setInterval(loopSend, timeUnitInMs);
	setTimeout(function(){
		clearInterval(intervalObj);
		process.exit();
	}, totalTimeInMs);
})

function genBallot(eDetails, vID, privateKey){
	let eID = eDetails._id;
	let y = bigInt(encoding.base64ToHex(eDetails.key.y), 16);
	let g = bigInt(encoding.base64ToHex(eDetails.key.g), 16);
	let p = bigInt(encoding.base64ToHex(eDetails.key.p), 16);

	let answers = [];
	eDetails.questions.forEach(function(q, qi){
		answers.push({choices:[], overall_proof:[]})
		let min_choice = parseInt(q.min_choice);
		let max_choice = parseInt(q.max_choice);
		let question_c1 = bigInt(1);
		let question_c2 = bigInt(1);
		let question_value = 0;
		let question_r = bigInt(0);

		let numToChoose = Math.floor(Math.random()*max_choice)+min_choice;
		let arrToChoose = Array.apply(null, {length: q.answers.length}).map(Number.call, Number);
		for(let i=0; i<q.answers.length-numToChoose; i++){
			arrToChoose.splice(Math.floor(Math.random()*arrToChoose.length), 1);
		}

		q.answers.forEach(function(a, ai){
			answers[qi].choices.push({})

			let value = arrToChoose.includes(ai) ? 1 : 0;
			question_value += value;
			let r = bigInt.randBetween(1, p.minus(2));
			question_r = question_r.add(r).mod(p.minus(1));

			let c1 = g.modPow(r,p);
			let c1_base64 = encoding.hexToBase64(c1.toString(16));
			answers[qi].choices[ai]["c1"] = c1_base64;
			question_c1 = question_c1.multiply(c1).mod(p);
			
			let c2 = (y.modPow(r,p)).multiply(g.modPow(value,p)).mod(p);
			let c2_base64 = encoding.hexToBase64(c2.toString(16));
			answers[qi].choices[ai]["c2"] = c2_base64;
			question_c2 = question_c2.multiply(c2).mod(p);

			let msg = {
				electionID: eID,
				questionIndex: qi,
				choiceIndex: ai,
				c1: c1_base64,
				c2: c2_base64
			}
			let e_sum = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')),16).mod(p);

			let simProof = genSimProof(p,g,y,c1,c2,1-value);
			let realProof = genRealProof(p,g,y,e_sum,simProof.e,r);

			let proof = [];
			proof[1-value] = proofToBase64(simProof);
			proof[value] = proofToBase64(realProof);

			answers[qi].choices[ai]["proof"] = proof;
		})

		let msg = {
			electionID: eID,
			questionIndex: qi,
			question_c1: encoding.hexToBase64(question_c1.toString(16)),
			question_c2: encoding.hexToBase64(question_c2.toString(16)),
		}
		let e_sum = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')),16).mod(p);
		let e_sim_sum = bigInt(0);
		
		for (let v=min_choice ; v<=max_choice ; v++){
			answers[qi].overall_proof.push({});

			if(v != question_value){
				let simProof = genSimProof(p,g,y,question_c1,question_c2,v);
				e_sim_sum = e_sim_sum.add(simProof.e).mod(p);
				answers[qi].overall_proof[v-min_choice] = proofToBase64(simProof);
			}
		}

		if(answers[qi].overall_proof[question_value-min_choice]){
			answers[qi].overall_proof[question_value-min_choice] = proofToBase64(genRealProof(p,g,y,e_sum,e_sim_sum,question_r));
		}
	})

	let ballot = {
		electionID: eID,
		voterID: vID,
		answers: answers
	}
	let sign = crypto.createSign('SHA256').update(JSON.stringify(ballot)).sign(privateKey, 'base64');

	return {
		electionID: eID,
		voterID: vID,
		answers: answers,
		voterSign: sign,
		voterTimestamp: new Date()
	}
}

function genSimProof(p,g,y,c1,c2,v){
	var e_sim = bigInt.randBetween(1, p.minus(1));
	var f_sim = bigInt.randBetween(1, p.minus(1));
	var a1_sim = g.modPow(f_sim,p).multiply(c1.modPow(e_sim,p).modInv(p)).mod(p);
	var a2_sim = y.modPow(f_sim,p).multiply((c2.multiply(g.modPow(v,p).modInv(p))).modPow(e_sim,p).modInv(p)).mod(p);

	return {
		a1: a1_sim,
		a2: a2_sim,
		e: e_sim,
		f: f_sim
	}
}

function genRealProof(p,g,y,e_sum,e_sim_sum,r){
	let s = bigInt.randBetween(1, p.minus(1));
	let a1_real = g.modPow(s,p);
	let a2_real = y.modPow(s,p);
	let e_real = e_sum.minus(e_sim_sum).add(p).mod(p);
	let f_real = s.add(e_real.multiply(r)).mod(p.minus(1));

	return {
		a1: a1_real,
		a2: a2_real,
		e: e_real,
		f: f_real
	}
}

function proofToBase64(proof){
	return {
		a1: encoding.hexToBase64(proof.a1.toString(16)),
		a2: encoding.hexToBase64(proof.a2.toString(16)),
		e: encoding.hexToBase64(proof.e.toString(16)),
		f: encoding.hexToBase64(proof.f.toString(16)),
	}
}
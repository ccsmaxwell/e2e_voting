var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var bigInt = require("big-integer");
var chalk = require('chalk');

var Block = require('../models/block');

var blockChainController = require('./blockchain');

var encoding = require('./lib/encoding');
var connection = require('./lib/connection');

module.exports = {

	create: function(req, res, next){
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
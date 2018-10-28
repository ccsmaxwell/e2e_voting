var request = require('request');
var ip = require('ip');
var uuidv4 = require('uuid/v4');
var crypto = require('crypto');
var bigInt = require("big-integer");

var Node_server = require('../models/node_server');
var Block = require('../models/block');

var blockChainController = require('../controllers/blockchain');

module.exports = {

	create: function(req, res, next){
		console.log("Election create request:");
		console.log(req.body);
		var data = req.body;

		var publicKey = JSON.parse(data.key);
		var key_y = bigInt(1);
		var p = bigInt(Buffer.from(publicKey.p, 'base64').toString('hex'),16);
		publicKey.trustees_y.forEach(function(e){
			let y = bigInt(Buffer.from(e, 'base64').toString('hex'),16);
			key_y = key_y.multiply(y).mod(p);
		})

		var newBlock_ = {};
		newBlock_.blockUUID = uuidv4();
		newBlock_.electionID = uuidv4();
		newBlock_.blockSeq = 0;
		newBlock_.blockType = "Election Details";
		newBlock_.data = [{
			name: data.name,
			description: data.description,
			questions: JSON.parse(data.question_list),
			key: {
				p: publicKey.p,
				g: publicKey.g,
				y: Buffer.from(key_y.toString(16), 'hex').toString('base64')
			},
			voters: JSON.parse(data.voter),
			frozenAt: new Date()
		}];

		var newBlock = new Block();
		Object.keys(newBlock_).forEach(function(key){
			newBlock[key] = newBlock_[key];
		});
		newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(newBlock_)).digest('base64');
		newBlock_.hash = newBlock.hash;

		newBlock.save().then(function(result){
			console.log("Saved new block (election data)");

			var myIP = ip.address();
			var myPort = (process.env.PORT+"").trim();

			Node_server.find({}).then(function(all_node_server){
				all_node_server.forEach(function(e){
					if (e.IP != myIP || e.port != myPort){
						console.log("Broadcast block to: "+e.IP+":"+e.port);

						request
							.post({url:"http://"+e.IP+":"+e.port+"/blockchain/broadcastBlock", form:{
								block: JSON.stringify(newBlock_)
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

			blockChainController.signBlock(newBlock_);
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

		res.json({success: true});
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

	getAllResult: function(req, res, next){
		var data = req.body;

		Block.find({
			electionID: data.electionID
		}).then(function(allBlocks){
			var key = {};
			var ans_c1c2 = [];
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
					p = bigInt(Buffer.from(key.p, 'base64').toString('hex'),16);
				}else if(block.blockType == "Ballot"){
					block.data.forEach(function(ballot){
						for(var i=0; i<ans_c1c2.length; i++){
							for(var j=0; j<ans_c1c2[i].length; j++){
								ans_c1c2[i][j].c1 = ans_c1c2[i][j].c1.multiply(bigInt(Buffer.from(ballot.answers[i][j].c1, 'base64').toString('hex'),16)).mod(p);
								ans_c1c2[i][j].c2 = ans_c1c2[i][j].c2.multiply(bigInt(Buffer.from(ballot.answers[i][j].c2, 'base64').toString('hex'),16)).mod(p);
							}
						}
					})
				}
			})

			ans_c1c2.forEach(function(q){
				q.forEach(function(a){
					a.c1 = Buffer.from(a.c1.toString(16), 'hex').toString('base64');
					a.c2 = Buffer.from(a.c2.toString(16), 'hex').toString('base64');
				})
			})

			res.json({key: key, ans_c1c2: ans_c1c2});
		}).catch(function(err){
			console.log(err)
		})
	}

}
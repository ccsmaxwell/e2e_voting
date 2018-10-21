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
	}

}
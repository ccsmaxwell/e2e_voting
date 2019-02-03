var request = require('request');
var ip = require('ip');
var crypto = require('crypto');

var Node_server = require('../../models/node_server');

const {serverID, serverPriKey} = _config;

module.exports = {

	broadcast: function(method, path, form, signOnData, destID, onData, onError, callback){
		if(signOnData){
			module.exports.signOnFormData(form);
		}

		var myAddr = module.exports.getSelfAddr();
		var match = destID ? {serverID: {$in: destID}} : {};

		Node_server.find(match).then(function(all_node_server){
			all_node_server.forEach(function(e){
				if (e.IP != myAddr.IP || e.port != myAddr.port){
					request({
						method: method,
						url: "http://"+e.IP+":"+e.port+path,
						form: form
					}).on('data', function(data){
						if(onData){
							onData(e.IP, e.port, myAddr.IP, myAddr.port, data);
						}
					})
					.on('error', function(err){
						if(onError){
							onError(e.IP, e.port, myAddr.IP, myAddr.port, err);
						}else{
							console.log(err);
						}
					})
				}
			})

			if(callback){
				callback();
			}
		}).catch(function(err){
			console.log(err);
		})
	},

	sendRequest: function(method, addr, path, form, signOnData, onData, onError){
		if(signOnData){
			module.exports.signOnFormData(form);
		}
		
		request({
			method: method,
			url: "http://"+addr+path,
			form: form
		}).on('data', function(data){
			if(onData){
				onData(data);
			}
		}).on('error', function(err){
			if(onError){
				onError(err);
			}else{
				console.log(err);
			}
		})
	},

	signOnFormData: function(formData){
		formData['serverID'] = serverID;
		var sign = crypto.createSign('SHA256');
		sign.write(JSON.stringify(formData));
		formData['serverSign'] = sign.sign(serverPriKey, 'base64');
	},

	getSelfAddr: function(){
		return {
			IP: ip.address(),
			port: _config.port
		}
	}

};
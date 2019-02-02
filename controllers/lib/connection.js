var request = require('request');
var ip = require('ip');

var Node_server = require('../../models/node_server');

const serverID = _config.serverID;
const serverPriKey = _config.serverPriKey;

module.exports = {

	broadcast: function(method, path, form, signOnData, dest, onData, onError, callback){
		if(signOnData){
			form['serverID'] = serverID;
			let sign = crypto.createSign('SHA256');
			sign.write(JSON.stringify(form));
			form['serverSign'] = sign.sign(serverPriKey, 'base64');
		}

		var myAddr = module.exports.getSelfAddr();
		Node_server.find({}).then(function(all_node_server){
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

	sendRequest: function(method, addr, path, form, onData, onError){
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

	getSelfAddr: function(){
		return {
			IP: ip.address(),
			port: _config.port
		}
	}

};
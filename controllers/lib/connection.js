var request = require('request');
var ip = require('ip');

var Node_server = require('../../models/node_server');

module.exports = {

	broadcast: function(method, path, form, onData, onError, callback){
		var myAddr = module.exports.getSelfAddr();

		Node_server.find({}).then(function(all_node_server){
			all_node_server.forEach(function(e){
				if (e.IP != myAddr.IP || e.port != myAddr.port){
					request({
						method: method,
						url:"http://"+e.IP+":"+e.port+path,
						form:form
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

	getSelfAddr: function(){
		return {
			IP: ip.address(),
			port: (process.env.PORT+"").trim()
		}
	}

};
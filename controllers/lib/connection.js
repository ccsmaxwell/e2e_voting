var request = require('request');
var ip = require('ip');

var Node_server = require('../../models/node_server');

module.exports = {

	broadcast: function(method, path, form, onData, onError, callback){
		var myIP = ip.address();
		var myPort = (process.env.PORT+"").trim();

		Node_server.find({}).then(function(all_node_server){
			all_node_server.forEach(function(e){
				if (e.IP != myIP || e.port != myPort){
					request({
						method: method,
						url:"http://"+e.IP+":"+e.port+path,
						form:form
					}).on('data', function(data){
						if(onData){
							onData(e.IP, e.port, myIP, myPort, data);
						}
					})
					.on('error', function(err){
						console.log(err);

						if(onError){
							onError(e.IP, e.port, myIP, myPort, err);
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
	}

};
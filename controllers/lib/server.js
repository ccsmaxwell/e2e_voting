var Node_server = require('../../models/node_server');

module.exports = {

	updateNode: function(ip, port, serverID, serverKey, successCallback){
		var edit = {}
		if(serverID){
			edit["serverID"] = serverID;
		}
		if(serverKey){
			edit["serverKey"] = serverKey;
		}

		Node_server.findOneAndUpdate({
			IP: ip,
			port: port
		}, edit, {
			upsert: true
		}).then(function(result){
			if(successCallback){
				successCallback();
			}
		}).catch((err) => console.log(err))
	},

	deleteNode: function(ip, port, successCallback){
		Node_server.deleteOne({
			IP: ip,
			port: port
		}).then(function(result){
			if(successCallback){
				successCallback();
			}
		}).catch((err) => console.log(err))
	},

	findByServerID: function(serverID, successCallback){
		module.exports.findAll({serverID: serverID}, null, successCallback);
	},

	findAll: function(filter, sort, successCallback){
		var f = filter ? filter : {};
		var s = sort ? sort : {};
		Node_server.find(f).sort(s).then(successCallback);
	}

}
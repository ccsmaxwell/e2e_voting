var Node_server = require('../../models/node_server');

var serverDetails = {};

module.exports = {

	updateNode: function(ip, port, instanceID, serverID, serverKey, successCallback){
		var edit = {}
		if(serverID) edit["serverID"] = serverID;
		if(serverKey) edit["serverKey"] = serverKey;
		if(instanceID) edit["instanceID"] = instanceID;

		Node_server.findOneAndUpdate({
			IP: ip,
			port: port
		}, edit, {
			upsert: true
		}).then(function(result){
			if(successCallback) successCallback();
		}).catch((err) => console.log(err))
	},

	deleteNode: function(ip, port, successCallback){
		Node_server.deleteMany({
			IP: ip,
			port: port
		}).then(function(result){
			if(successCallback) successCallback();
		}).catch((err) => console.log(err))
	},

	keyByServerID: function(serverID, forceUpdate, successCallback){
		if(!serverDetails[serverID]) serverDetails[serverID] = {serverKey: null};

		if(forceUpdate || !serverDetails[serverID].serverKey){
			module.exports.findAll({serverID: serverID}, null, function(result){
				serverDetails[serverID].serverKey = result[0] ? result[0].serverKey : null;
				successCallback(serverDetails[serverID].serverKey);
			});
		}else{
			successCallback(serverDetails[serverID].serverKey);
		}
	},

	findAll: function(filter, sort, successCallback){
		var f = filter ? filter : {};
		var s = sort ? sort : {};
		Node_server.find(f).sort(s).then(successCallback).catch((err) => console.log(err));
	}

}
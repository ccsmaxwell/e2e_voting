var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var uuidv4 = require('uuid/v4');

var configSchema = {
	"port": "",
	"serverType": "",
	"serverPubKeyPath": "",
	"serverPriKeyPath": "",
	"indexURL": "",
	"mongoDbPath": "",
	"awsEmailEnable": true,
	"awsEmailFrom": "",
	"awsAccessKeyId": "",
	"awsSecretAccessKeyPath": "",
	"awsRegion": "",
	"awsProxy": "",
	"blockTimerInterval": 0,
	"blockTimerBuffer": 0,
	"pingInterval": 0,
	"keyChangeWaitTime": 0
}

module.exports = {

	init: function(){
		var configPath = path.resolve(process.cwd(), process.argv[2]);
		var config = JSON.parse(fs.readFileSync(configPath));

		Object.keys(configSchema).forEach(function(k){
			if(!k in config || typeof config[k] !== typeof configSchema[k]){
				throw "Config key: " + k + " not exist / type mismatch";
			}
		})

		var configDir = path.dirname(configPath);
		var pubKeyPath = path.resolve(configDir, config.serverPubKeyPath);
		config["serverPubKey"] = fs.readFileSync(pubKeyPath).toString();
		config["serverID"] = crypto.createHash('sha256').update(config.serverPubKey.split("-----")[2].replace(/[\r\n]*/g,'')).digest('base64');
		var priKeyPath = path.resolve(configDir, config.serverPriKeyPath);
		config["serverPriKey"] = fs.readFileSync(priKeyPath);
		
		config["instanceID"] = uuidv4();

		if(config.awsEmailEnable){
			config.awsSecretAccessKeyPath = path.resolve(configDir, config.awsSecretAccessKeyPath);
		}

		global._config = config;
	}

}
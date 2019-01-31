var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var configSchema = {
	"port": "",
	"serverType": "",
	"serverPubKeyPath": "",
	"serverPriKeyPath": "",
	"indexURL": "",
	"mongoDbPath": "",
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
			if(!config[k] || typeof config[k] !== typeof configSchema[k]){
				throw "Config key: " + k + " not exist / type mismatch";
			}
		})

		var configDir = path.dirname(configPath);
		var pubKeyPath = path.resolve(configDir, config.serverPubKeyPath);
		config["serverPubKey"] = fs.readFileSync(pubKeyPath);
		config["serverID"] = crypto.createHash('sha256').update(config.serverPubKey.toString().split("-----")[2].replace(/[\r\n]*/g,'')).digest('base64');
		var priKeyPath = path.resolve(configDir, config.serverPriKeyPath);
		config["serverPriKey"] = fs.readFileSync(priKeyPath);

		global._config = config;
	}

}
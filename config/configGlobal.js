var path = require('path');
var fs = require('fs');

var configSchema = {
	"port": "",
	"serverType": "",
	"mongoDbPath": "",
	"blockTimerInterval": 0,
	"blockTimerBuffer": 0,
	"pingInterval": 0
}

module.exports = {

	init: function(){
		var config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), process.argv[2])));

		Object.keys(configSchema).forEach(function(k){
			if(!config[k] || typeof config[k] !== typeof configSchema[k]){
				throw "Config key: " + k + " not exist / type mismatch";
			}
		})

		global._config = config;
	}

}
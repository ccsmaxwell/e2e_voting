module.exports = {

	base64ToHex: function(base64){
		return Buffer.from(base64+"", 'base64').toString('hex');
	},

	hexToBase64: function(hex){
		if(hex.length % 2 == 1){
			hex = "0"+hex;
		}
		return Buffer.from(hex+"", 'hex').toString('base64');
	},

};
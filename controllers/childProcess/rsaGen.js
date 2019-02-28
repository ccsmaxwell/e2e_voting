var nodeRSA = require('node-rsa');

var count = parseInt(process.argv[2]);
var size = parseInt(process.argv[3]);
for(let i=0; i<count; i++){
	let k = new nodeRSA({b: size});
	process.send({
		pub: k.exportKey("public"),
		pri: k.exportKey("pkcs8")
	})
}
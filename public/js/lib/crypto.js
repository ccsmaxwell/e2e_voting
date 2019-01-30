function rsaGenerate(successCallback) {
	window.crypto.subtle.generateKey({
		name: "RSASSA-PKCS1-v1_5",
		modulusLength: 1024,
		publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
		hash: {name: "SHA-256"},
	}, true, ["sign", "verify"]).then(function(key){
		let pubKey = null;
		let priKey = null;

		let promPub = window.crypto.subtle.exportKey("spki", key.publicKey).then(function(keyData){
			pubKey = "-----BEGIN PUBLIC KEY-----\n" + arrayBufferToBase64(keyData) + "\n-----END PUBLIC KEY-----";
		}).catch(function(err){
			console.log(err);
		});
		let promPri = window.crypto.subtle.exportKey("pkcs8", key.privateKey).then(function(keyData){
			priKey = "-----BEGIN PRIVATE KEY-----\n" + arrayBufferToBase64(keyData) + "\n-----END PRIVATE KEY-----";
		}).catch(function(err){
			console.log(err);
		});

		Promise.all([promPub, promPri]).then(function(){
			successCallback(pubKey, priKey);
		})
	}).catch(function(err){
		console.log(err);
	});
}

function rsaSign(priKeyStr, textStr, successCallback) {
	window.crypto.subtle.importKey(
		"pkcs8",
		base64ToArrayBuffer(priKeyStr.split("-----")[2].replace(/[\r\n]*/g,'')),
		{
			name: "RSASSA-PKCS1-v1_5",
			hash: {name: "SHA-256"}
		},
		false,
		["sign"]
	).then(function(privateKey) {
		window.crypto.subtle.sign(
			{name: "RSASSA-PKCS1-v1_5"},
			privateKey,
			new TextEncoder('utf-8').encode(textStr)
		)
		.then(function(signBuff){
			successCallback(signBuff);
		})
	})
}

function uuidv4() {
	return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	)
}
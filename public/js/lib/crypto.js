function rsaGenerate(successCallback) {
	forge.pki.rsa.generateKeyPair({bits: 1024, workers: -1}, function(err, keypair) {
		if(err){
			return console.log(err)
		}

		let pubKey = forge.pki.publicKeyToPem(keypair.publicKey)
		let priKey = forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keypair.privateKey)))
		successCallback(pubKey, priKey);
	});
}

function rsaSign(priKeyStr, textStr, successCallback) {
	var key = forge.pki.privateKeyFromPem(priKeyStr);
	var sign = key.sign(forge.md.sha256.create().update(textStr, 'utf8'))
	successCallback(hexToBase64(forge.util.createBuffer(sign, 'raw').toHex()));
}

function uuidv4() {
	return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	)
}
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
function base64toHex(base64) {
	var raw = atob(base64);
	var hex = '';

	for (i = 0; i < raw.length; i++) {
		var _hex = raw.charCodeAt(i).toString(16)
		hex += (_hex.length==2? _hex : '0'+_hex);
	}

	return hex;
}

// function base64ToHex(str) {
// 	for (var i = 0, bin = atob(str.replace(/[ \r\n]+$/, "")), hex = []; i < bin.length; ++i) {
// 		hex[hex.length] = bin.charCodeAt(i).toString(16);
// 	}
// 	return hex.join("");
// }

function hexToBase64(hex) {
	// if(hex.length % 2 == 1){
	// 	hex = "0"+hex;
	// }
	return btoa( String.fromCharCode.apply(null, hex.replace(/\r|\n/g, "").replace(/([\da-fA-F]{2}) ?/g, "0x$1 ").replace(/ +$/, "").split(" ")) );
}

function base64ToArrayBuffer(base64) {
	var byteString = atob(base64);
	var byteArray = new Uint8Array(byteString.length);
	for(var i=0; i < byteString.length; i++) {
		byteArray[i] = byteString.charCodeAt(i);
	}

	return byteArray;
}

function arrayBufferToBase64(arrayBuffer) {
	var binary = '';
	var bytes = new Uint8Array(arrayBuffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
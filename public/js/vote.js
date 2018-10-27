$("#btn_vote").click(function(e){
	$.ajax({
		type: "GET",
		url: "/election/getDetails",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			// console.log(res);

			var y = bigInt(base64toHex(res[0].data[0].key.y), 16);
			var g = bigInt(base64toHex(res[0].data[0].key.g), 16);
			var p = bigInt(base64toHex(res[0].data[0].key.p), 16);

			var answers = [];
			if ($("#Q1_opt1").val()){
				var option_ans = [];

				var r = bigInt.randBetween(1, p.minus(2));
				var c1 = g.modPow(r,p);
				var c2 = (y.modPow(r,p)).multiply(g.modPow($("#Q1_opt1").val(),p)).mod(p);
				option_ans.push({c1: hexToBase64(c1.toString(16)), c2: hexToBase64(c2.toString(16))});

				var r = bigInt.randBetween(1, p.minus(2));
				var c1 = g.modPow(r,p);
				var c2 = (y.modPow(r,p)).multiply(g.modPow($("#Q1_opt2").val(),p)).mod(p);
				option_ans.push({c1: hexToBase64(c1.toString(16)), c2: hexToBase64(c2.toString(16))});

				answers.push(option_ans);
			}

			if ($("#Q2_opt1").val()){
				var option_ans = [];

				var r = bigInt.randBetween(1, p.minus(2));
				var c1 = g.modPow(r,p);
				var c2 = (y.modPow(r,p)).multiply(g.modPow($("#Q2_opt1").val(),p)).mod(p);
				option_ans.push({c1: hexToBase64(c1.toString(16)), c2: hexToBase64(c2.toString(16))});

				var r = bigInt.randBetween(1, p.minus(2));
				var c1 = g.modPow(r,p);
				var c2 = (y.modPow(r,p)).multiply(g.modPow($("#Q2_opt2").val(),p)).mod(p);
				option_ans.push({c1: hexToBase64(c1.toString(16)), c2: hexToBase64(c2.toString(16))});

				answers.push(option_ans);
			}

			var ballot = {
				electionID: $("#election_id").val(),
				voterID: $("#voter_id").val(),
				answers: answers
			}

			window.crypto.subtle.importKey(
				"pkcs8",
				base64ToArrayBuffer($("#private_key").val().split("-----")[2].replace(/[\r\n]*/g,'')),
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
					new TextEncoder('utf-8').encode(JSON.stringify(ballot))
				)
				.then(function(sign){
					$.ajax({
						type: "POST",
						url: "/ballot/submit",
						data:{			
							electionID: $("#election_id").val(),
							voterID: $("#voter_id").val(),
							answers: JSON.stringify(answers),
							voterSign: arrayBufferToBase64(sign)
						},	
						success: function(res){
							console.log(res);
						}
					})
				})
			})
		}
	})
})

function base64toHex(base64) {
	var raw = atob(base64);
	var hex = '';

	for (i = 0; i < raw.length; i++) {
		var _hex = raw.charCodeAt(i).toString(16)
		hex += (_hex.length==2? _hex : '0'+_hex);
	}

	return hex;
}

function hexToBase64(hex) {
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
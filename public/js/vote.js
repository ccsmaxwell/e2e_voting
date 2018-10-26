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

				answer.push(option_ans);
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

				answer.push(option_ans);
			}

			var ballot = {
				voterID: $("#voter_id").val(),
				answers: answers
			}

			crypto.subtle.digest('SHA-256', TextEncoder('utf-8').encode(JSON.stringify(ballot))).then(function(hashBuffer){
				Array.from(new Uint8Array(hashBuffer)).map(b => ('00' + b.toString(16)).slice(-2)).join('');
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
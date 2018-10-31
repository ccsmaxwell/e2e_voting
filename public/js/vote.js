$("#btn_vote").click(function(e){
	$.ajax({
		type: "GET",
		url: "/election/getDetails",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			// console.log(res);

			var y = bigInt(base64ToHex(res[0].data[0].key.y), 16);
			var g = bigInt(base64ToHex(res[0].data[0].key.g), 16);
			var p = bigInt(base64ToHex(res[0].data[0].key.p), 16);

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
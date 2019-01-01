var _result = null;

$("#btn_result").click(function(e){
	$.ajax({
		type: "POST",
		url: "/election/getAllResult",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			console.log(res);
			_result = res

			var trustee_y = $("#public_key").val().split(";");
			var trustee_x = $("#private_key").val().split(";");
			for(var i=0; i<trustee_y.length; i++){
				trustee_y[i] = bigInt(base64ToHex(trustee_y[i]),16);
				trustee_x[i] = bigInt(base64ToHex(trustee_x[i]),16);
			}

			var p = bigInt(base64ToHex(res.key.p),16);
			var g = bigInt(base64ToHex(res.key.g),16);
			$("#msg").html("");
			$("#msg").append($("<p>").text("Election public key (in base 10) - p: " + p.toString()));
			$("#msg").append($("<p>").text("Election public key (in base 10) - g: " + g.toString()));

			var disLogTable = {};
			var gCurr = bigInt(1);
			for(var i=0; i<10000; i++){
				disLogTable[gCurr.toString()] = i;

				gCurr = gCurr.multiply(g).mod(p);
			}

			var proof = [];
			res.ans_c1c2.forEach(function(q, qi){
				proof.push([]);

				$("#msg").append($("<p style='font-weight:bold;'>").text("Question " + (qi+1) + " decrypt: " + res.questions[qi].question));

				q.forEach(function(a, ai){
					proof[qi].push([]);

					$("#msg").append($("<p style='font-weight:bold;'>").text("Option " + (ai+1) + ": " + res.questions[qi].answers[ai]));
					let c1 = bigInt(base64ToHex(a.c1),16);
					let c2 = bigInt(base64ToHex(a.c2),16);
					$("#msg").append($("<p>").text("c1 (from aggregation): " + c1.toString()));
					$("#msg").append($("<p>").text("c2 (from aggregation): " + c2.toString()));

					let c1x = bigInt(1);
					trustee_x.forEach(function(x, xi){
						proof[qi][ai].push({});
						let d = c1.modPow(x, p);
						let s = bigInt.randBetween(1, p);
						let a1 = bigInt(g).modPow(s, p);
						let a2 = bigInt(c1).modPow(s, p);
						let msg = res.key.g + hexToBase64(a1.toString(16)) + hexToBase64(trustee_y[xi].toString(16)) + hexToBase64(a2.toString(16)) + hexToBase64(d.toString(16));

						window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(msg)).then(function(hashBuffer){
							let e = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16);
							let f = s.add(e.multiply(x)).mod(p.minus(1));
							
							proof[qi][ai][xi] = {
								a1: hexToBase64(a1.toString(16)),
								a2: hexToBase64(a2.toString(16)),
								f: hexToBase64(f.toString(16)),
								d: hexToBase64(d.toString(16)),
							}

							$("#proof_a1a2f").val(JSON.stringify(proof));
						})

						c1x = c1x.multiply(d).mod(p);
						$("#msg").append($("<p>").text("c1x (c1x = c1x * c1^x mod p; apply trustee private key): " + c1x.toString()));
					})

					let gm = c1x.modInv(p).multiply(c2).mod(p);
					$("#msg").append($("<p>").text("gm (c2 * c1x^-1 mod p; mod multi inverse): " + gm.toString()));
					let m = disLogTable[gm.toString()];
					$("#msg").append($("<p style='font-weight:bold;'>").text("RESULT (discrete log on gm base g): " + m));
				})
				$("#msg").append($("<br>"));
			})
		}
	})
})

$("#btn_proof").click(function(e){
	var res = _result;
	var proof = JSON.parse($("#proof_a1a2f").val());
	$("#verify_msg").html("");

	var p = bigInt(base64ToHex(res.key.p),16);
	var g = bigInt(base64ToHex(res.key.g),16);

	var trustee_y = $("#public_key").val().split(";");
	for(var i=0; i<trustee_y.length; i++){
		trustee_y[i] = bigInt(base64ToHex(trustee_y[i]),16);
	}

	res.ans_c1c2.forEach(function(q, qi){
		q.forEach(function(a, ai){
			let c1 = bigInt(base64ToHex(a.c1),16);

			trustee_y.forEach(function(x, xi){
				let a1 = bigInt(base64ToHex(proof[qi][ai][xi].a1),16);
				let a2 = bigInt(base64ToHex(proof[qi][ai][xi].a2),16);
				let f = bigInt(base64ToHex(proof[qi][ai][xi].f),16);
				let d = bigInt(base64ToHex(proof[qi][ai][xi].d),16);

				let msg = res.key.g + proof[qi][ai][xi].a1 + hexToBase64(trustee_y[xi].toString(16)) + proof[qi][ai][xi].a2 + proof[qi][ai][xi].d;

				window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(msg)).then(function(hashBuffer){
					let e = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16);

					let lhs1 = g.modPow(f,p);
					let rhs1 = a1.multiply(trustee_y[xi].modPow(e,p)).mod(p);
					let lhs2 = c1.modPow(f,p);
					let rhs2 = a2.multiply(d.modPow(e,p)).mod(p);
					if(lhs1.eq(rhs1) && lhs2.eq(rhs2)){
						$("#verify_msg").append($("<p>").text("Verify Question " + (qi+1) + " Answer " + (ai+1) + " Trustee " + (xi+1) + ": success"));
					}else{
						$("#verify_msg").append($("<p>").text("Verify Question " + (qi+1) + " Answer " + (ai+1) + " Trustee " + (xi+1) + ": NOT success"));
					}
				})
			})
		})
	})
})
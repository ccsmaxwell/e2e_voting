$("#btn_result").click(function(e){
	$.ajax({
		type: "POST",
		url: "/election/getAllResult",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			console.log(res);

			var trustee_x = $("#private_key").val().split(";");
			for(var i=0; i<trustee_x.length; i++){
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

			res.ans_c1c2.forEach(function(q, qi){
				$("#msg").append($("<p style='font-weight:bold;'>").text("Question " + (qi+1) + " decrypt: " + res.questions[qi].question));

				q.forEach(function(a, ai){
					$("#msg").append($("<p style='font-weight:bold;'>").text("Option " + (ai+1) + ": " + res.questions[qi].answers[ai]));
					let c1 = bigInt(base64ToHex(a.c1),16);
					let c2 = bigInt(base64ToHex(a.c2),16);
					$("#msg").append($("<p>").text("c1 (from aggregation): " + c1.toString()));
					$("#msg").append($("<p>").text("c2 (from aggregation): " + c2.toString()));

					let c1x = bigInt(1);
					trustee_x.forEach(function(x){
						c1x = c1x.multiply(c1.modPow(x, p)).mod(p);
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
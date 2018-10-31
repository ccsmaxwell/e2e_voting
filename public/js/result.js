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

			var disLogTable = {};
			var gCurr = bigInt(1);
			for(var i=0; i<10000; i++){
				disLogTable[gCurr.toString()] = i;

				gCurr = gCurr.multiply(g).mod(p);
			}

			$("#result").html("")
			res.ans_c1c2.forEach(function(q, qi){
				$("#result").append($("<p>").text(res.questions[qi].question));

				q.forEach(function(a, ai){
					let c1 = bigInt(base64ToHex(a.c1),16);
					let c2 = bigInt(base64ToHex(a.c2),16);

					let c1x = bigInt(1);
					trustee_x.forEach(function(x){
						c1x = c1x.multiply(c1.modPow(x, p)).mod(p);
					})

					let gm = c1x.modInv(p).multiply(c2).mod(p);
					let m = disLogTable[gm.toString()];
					$("#result").append($("<p>").text(res.questions[qi].answers[ai] + " - Vote: " + m + " (gm:" + gm.toString() + ")"));
				})
			})
		}
	})
})
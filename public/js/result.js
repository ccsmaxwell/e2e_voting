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
				trustee_x[i] = bigInt(base64toHex(trustee_x[i]),16);
			}

			var p = bigInt(base64toHex(res.key.p),16);
			var g = bigInt(base64toHex(res.key.g),16);

			res.ans_c1c2.forEach(function(q){
				q.forEach(function(a){
					var c1 = bigInt(base64toHex(a.c1),16);
					var c2 = bigInt(base64toHex(a.c2),16);

					var c1x = bigInt(1);
					trustee_x.forEach(function(x){
						c1x = c1x.multiply(c1.modPow(x, p)).mod(p);
					})

					console.log(c2.divide(c1x).mod(p))
				})
			})
		}
	})
})
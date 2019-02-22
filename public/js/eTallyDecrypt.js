$("#btn_decrypt").click(function(){
	var p = bigInt(base64ToHex($("#key_p").val()),16);
	var g = bigInt(base64ToHex($("#key_g").val()),16);
	var trustee_y = bigInt(base64ToHex($("#pubKey").val()),16);
	var trustee_x = bigInt(base64ToHex($("#priKey").val()),16);

	var currTally = JSON.parse($("#currentTally").text())
	var partialDecrypt = [], proof = [], promArr = [];
	currTally.forEach(function(s, si){
		partialDecrypt.push([]);
		proof.push([]);
		s.forEach(function(q, qi){
			partialDecrypt[si].push([]);
			proof[si].push([]);
			q.forEach(function(a, ai){
				partialDecrypt[si][qi].push({});
				proof[si][qi].push({});

				let c1 = bigInt(base64ToHex(a.c1),16);
				let d = c1.modPow(trustee_x, p);
				let c1x = bigInt(base64ToHex(a.c1x),16).multiply(d).mod(p);
				partialDecrypt[si][qi][ai] = {
					c1: a.c1,
					c2: a.c2,
					c1x: hexToBase64(c1x.toString(16))
				}

				let s = bigInt.randBetween(1, p);
				let a1 = g.modPow(s, p);
				let a2 = c1.modPow(s, p);
				let msg = $("#key_g").val() + hexToBase64(a1.toString(16)) + $("#pubKey").val() + hexToBase64(a2.toString(16)) + hexToBase64(d.toString(16));

				promArr.push(window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(JSON.stringify(msg))).then(function(hashBuffer){
					let e = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16);
					let f = s.add(e.multiply(trustee_x)).mod(p.minus(1));
					
					proof[si][qi][ai] = {
						a1: hexToBase64(a1.toString(16)),
						a2: hexToBase64(a2.toString(16)),
						f: hexToBase64(f.toString(16)),
						d: hexToBase64(d.toString(16)),
					}
				}))
			})
		})
	})

	Promise.all(promArr).then(function(){
		$("#partially_decrypted").text(JSON.stringify(partialDecrypt));
		$("#zkProof").text(JSON.stringify(proof));
		$("#decrypted_card").removeClass('hide');

		$("#priKey").val("");
		M.updateTextFields();
	})
})

$("#btn_submit").click(function(){
	$.ajax({
		type: "POST",
		url: "./trustee-decrypt",
		data:{			
			electionID: $("#electionID").val(),
			trusteeID: $("#trusteeID").val(),
			partialDecrypt: $("#partially_decrypted").text(),
			proof: $("#zkProof").text()
		},	
		success: function(res){
			if(res.success){
				M.toast({html: 'Submit success', classes: 'rounded'})
				console.log(res);
			}else{
				console.log(res);
			}
		}
	})
})

$(".truncate").click(function(){
	if($(this).hasClass('truncate')){
		$(this).removeClass('truncate');
	}else{
		$(this).addClass('truncate');
	}
})
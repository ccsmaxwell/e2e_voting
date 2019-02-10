$("#btn_gen_key").click(function(){
	var key = dh.createDiffieHellman($("#eKey_p").text(),'base64',$("#eKey_g").text(),'base64')

	$("#new_pub_key").val(arrayBufferToBase64(key.generateKeys()));
	M.textareaAutoResize($('#new_pub_key'));
	$("#new_pri_key").val(arrayBufferToBase64(key.getPrivateKey()));
	M.textareaAutoResize($('#new_pri_key'));

	M.updateTextFields();
})

$("#btn_submit").click(function(){
	var p = bigInt(base64ToHex($("#eKey_p").text()), 16);
	var g_b64 = $("#eKey_g").text()
	var g = bigInt(base64ToHex(g_b64), 16);
	var y_b64 = $("#new_pub_key").val();
	var x = bigInt(base64ToHex($("#new_pri_key").val()), 16);

	var s = bigInt.randBetween(1, p.minus(1));
	var a = bigInt(g).modPow(s, p);

	var msg = g_b64 + hexToBase64(a.toString(16)) + y_b64;
	window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(msg)).then(function(hashBuffer){
		let e = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16);

		let f_b64 = hexToBase64(s.add(e.multiply(x)).mod(p.minus(1)).toString(16));
		let a_b64 = hexToBase64(a.toString(16))

		var data = {
			trusteeID: $("#trusteeID").val(),
			y: y_b64,
			a: a_b64,
			f: f_b64
		}

		let curr_x = bigInt(base64ToHex($("#curr_pri").val()), 16);
		window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(JSON.stringify(data))).then(function(hashBuffer){
			let m = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16);

			let r = bigInt.randBetween(1, p.minus(2));
			while(!bigInt.gcd(r,p.minus(1)).eq(1)){
				r = bigInt.randBetween(1, p.minus(2));
			}
			
			let s1 = g.modPow(r,p);
			let s2 = m.minus(curr_x.multiply(s1).mod(p.minus(1))).add(p.minus(1)).multiply(r.modInv(p.minus(1))).mod(p.minus(1));

			data["trusteeSign"] = JSON.stringify({
				s1: hexToBase64(s1.toString(16)),
				s2: hexToBase64(s2.toString(16))
			})

			$.ajax({
				type: "POST",
				url: "./changeKey",
				data: data,	
				success: function(res){
					if(res.success){
						M.toast({html: 'Change trustee key success', classes: 'rounded'})
						console.log(res);
					}else{
						console.log(res);
					}
				}
			})
		})
	})
})
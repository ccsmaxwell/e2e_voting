$("#btn_create_proof").click(function(e){
	var p = bigInt(base64ToHex($("#elgamal_p").val()), 16);
	var g = bigInt(base64ToHex($("#elgamal_g").val()), 16);
	var public_keys = $("#elgamal_y").val().split(";");
	var private_keys = $("#trustee_x").val().split(";");

	var s = [];
	var a = [];
	var e = [];
	var f = [];
	public_keys.forEach(function(yi, i){
		s.push(bigInt.randBetween(1, p-1));
		a.push(bigInt(g).modPow(s[i], p));

		let msg = $("#elgamal_g").val() + hexToBase64(a[i].toString(16)) + yi;
		window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(msg)).then(function(hashBuffer){
			e.push(bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16));

			f.push(hexToBase64(s[i].add(e[i].multiply(bigInt(base64ToHex(private_keys[i]), 16))).mod(p.minus(1)).toString(16)));
			a[i] = hexToBase64(a[i].toString(16))

			$("#proof_a").val(a.join(';'));
			$("#proof_f").val(f.join(';'));
		})
	})
})

$("#btn_create").click(function(e){
	var q_list = [];
	if($("#question_1").val()){
		q_list.push({
			question: $("#question_1").val(),
			answers:  $("#question_1_opt").val().split(";"),
			max_choice: parseInt($("#question_1_max").val()),
			min_choice: parseInt($("#question_1_min").val()),
		})
	}
	if($("#question_2").val()){
		q_list.push({
			question: $("#question_2").val(),
			answers:  $("#question_2_opt").val().split(";"),
			max_choice: parseInt($("#question_2_max").val()),
			min_choice: parseInt($("#question_s_min").val()),
		})
	}

	var trustees = []
	var trustees_y = $("#elgamal_y").val().split(";");
	var proof_a = $("#proof_a").val().split(";");
	var proof_f = $("#proof_f").val().split(";");
	trustees_y.forEach(function(yi, i){
		trustees.push({
			y: yi,
			a: proof_a[i],
			f: proof_f[i]
		})
	})

	var key = {
		p: $("#elgamal_p").val(),
		g: $("#elgamal_g").val(),
	};

	var voter = []
	if($("#voter_1_key").val()){
		voter.push({
			id: "v_1",
			public_key: $("#voter_1_key").val()	
		})
	}
	if($("#voter_2_key").val()){
		voter.push({
			id: "v_2",
			public_key: $("#voter_2_key").val()	
		})
	}
	if($("#voter_3_key").val()){
		voter.push({
			id: "v_3",
			public_key: $("#voter_3_key").val()	
		})
	}

	$.ajax({
		type: "POST",
		// url: "/election/create",
		data:{			
			name: $("#election_name").val(),
			description: $("#election_description").val(),
			question_list: JSON.stringify(q_list),
			key: JSON.stringify(key),
			trustee: JSON.stringify(trustees),
			voter: JSON.stringify(voter)
		},	
		success: function(res){
			console.log(res);
			$("#msg").append($("<p>").text("success, election ID: " + res.electionID));
		}
	})
})
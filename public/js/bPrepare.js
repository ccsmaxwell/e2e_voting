function genSimProof(p,g,y,c1,c2,v){
	var e_sim = bigInt.randBetween(1, p.minus(1));
	var f_sim = bigInt.randBetween(1, p.minus(1));
	var a1_sim = g.modPow(f_sim,p).multiply(c1.modPow(e_sim,p).modInv(p)).mod(p);
	var a2_sim = y.modPow(f_sim,p).multiply((c2.multiply(g.modPow(v,p).modInv(p))).modPow(e_sim,p).modInv(p)).mod(p);

	return {
		a1: a1_sim,
		a2: a2_sim,
		e: e_sim,
		f: f_sim
	}
}

function genRealProof(p,g,y,e_sum,e_sim_sum,r){
	let s = bigInt.randBetween(1, p.minus(1));
	let a1_real = g.modPow(s,p);
	let a2_real = y.modPow(s,p);
	let e_real = e_sum.minus(e_sim_sum).add(p).mod(p);
	let f_real = s.add(e_real.multiply(r)).mod(p.minus(1));

	return {
		a1: a1_real,
		a2: a2_real,
		e: e_real,
		f: f_real
	}
}

function proofToBase64(proof){
	return {
		a1: hexToBase64(proof.a1.toString(16)),
		a2: hexToBase64(proof.a2.toString(16)),
		e: hexToBase64(proof.e.toString(16)),
		f: hexToBase64(proof.f.toString(16)),
	}
}

$("#btn_encrypt").click(function(){
	var eID = $("#electionID").val();
	var y = bigInt(base64ToHex($("#key_y").val()), 16);
	var g = bigInt(base64ToHex($("#key_g").val()), 16);
	var p = bigInt(base64ToHex($("#key_p").val()), 16);

	var answers = [];
	$(".q_card").each(function(i){
		answers.push({choices:[], overall_proof:[]})
		let min_choice = parseInt($(this).find(".min_choice").val());
		let max_choice = parseInt($(this).find(".max_choice").val());
		let question_c1 = bigInt(1);
		let question_c2 = bigInt(1);
		let question_value = 0;
		let question_r = bigInt(0);

		$(this).find(".q_checkbox").each(function(j){
			answers[i].choices.push({})

			let value = $(this).prop('checked') ? 1 : 0;
			question_value += value;
			let r = bigInt.randBetween(1, p.minus(2));
			question_r = question_r.add(r).mod(p.minus(1));

			let c1 = g.modPow(r,p);
			let c1_base64 = hexToBase64(c1.toString(16));
			answers[i].choices[j]["c1"] = c1_base64;
			question_c1 = question_c1.multiply(c1).mod(p);
			
			let c2 = (y.modPow(r,p)).multiply(g.modPow(value,p)).mod(p);
			let c2_base64 = hexToBase64(c2.toString(16));
			answers[i].choices[j]["c2"] = c2_base64;
			question_c2 = question_c2.multiply(c2).mod(p);

			let msg = {
				electionID: eID,
				questionIndex: i,
				choiceIndex: j,
				c1: c1_base64,
				c2: c2_base64
			}
			let e_sum = bigInt(forge.md.sha256.create().update(JSON.stringify(msg)).digest().toHex(), 16).mod(p);

			let simProof = genSimProof(p,g,y,c1,c2,1-value);
			let realProof = genRealProof(p,g,y,e_sum,simProof.e,r);

			let proof = [];
			proof[1-value] = proofToBase64(simProof);
			proof[value] = proofToBase64(realProof);

			answers[i].choices[j]["proof"] = proof;
		})

		let msg = {
			electionID: eID,
			questionIndex: i,
			question_c1: hexToBase64(question_c1.toString(16)),
			question_c2: hexToBase64(question_c2.toString(16)),
		}
		let e_sum = bigInt(forge.md.sha256.create().update(JSON.stringify(msg)).digest().toHex(), 16).mod(p);
		let e_sim_sum = bigInt(0);
		
		for (let v=min_choice ; v<=max_choice ; v++){
			answers[i].overall_proof.push({});

			if(v != question_value){
				let simProof = genSimProof(p,g,y,question_c1,question_c2,v);
				e_sim_sum = e_sim_sum.add(simProof.e).mod(p);
				answers[i].overall_proof[v-min_choice] = proofToBase64(simProof);
			}
		}

		if(answers[i].overall_proof[question_value-min_choice]){
			answers[i].overall_proof[question_value-min_choice] = proofToBase64(genRealProof(p,g,y,e_sum,e_sim_sum,question_r));
		}
	})

	let ballot = {
		electionID: eID,
		voterID: $("#voterID").val(),
		answers: answers
	}

	rsaSign($("#priKey").val(), JSON.stringify(ballot), function(sign){
		$("#encrypted_ans").text(JSON.stringify(answers));
		$("#signature").text(sign);
		$("#encrypted_ballot_card").removeClass('hide');

		$("#priKey").val("");
		M.textareaAutoResize($("#priKey"));
		M.updateTextFields();
		$(".q_checkbox").prop('checked', false);
	})
})

$("#btn_submit").click(function(){
	$.ajax({
		type: "POST",
		url: "/ballot/submit",
		data:{
			electionID: $("#electionID").val(),
			voterID: $("#voterID").val(),
			answers: $("#encrypted_ans").text(),
			voterSign: $("#signature").text(),
			voterTimestamp: (new Date()).toISOString()
		},	
		success: function(res){
			if(res.success){
				$(location).attr('href', '/election/' + $("#electionID").val() + '/voters');
			}else{
				console.log(res);
			}
		}
	})
})

$("#encrypted_ans").click(function(){
	if($("#encrypted_ans.truncate")[0]){
		$("#encrypted_ans").removeClass('truncate');
	}else{
		$("#encrypted_ans").addClass('truncate');
	}
})

M.textareaAutoResize($('#priKey'));
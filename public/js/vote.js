var electionDetails = {};

$("#btn_details").click(function(e){
	$.ajax({
		type: "GET",
		url: "/election/getDetails",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			console.log(res);

			electionDetails = res;

			$("#details").html("");
			$("#details").append($("<p>").text("Election name: " + electionDetails[0].data[0].name));
			$("#details").append($("<p>").text("Election description: " + electionDetails[0].data[0].description));
			$("#details").append($("<p>").text("Election public key - p: " + electionDetails[0].data[0].key.p));
			$("#details").append($("<p>").text("Election public key - g: " + electionDetails[0].data[0].key.g));
			$("#details").append($("<p>").text("Election public key - y: " + electionDetails[0].data[0].key.y));

			$("#options").html("");
			electionDetails[0].data[0].questions.forEach(function(q, i){
				$("#options").append($("<p>").text("Question: " + q.question));

				q.answers.forEach(function(opt, j){
					template = [
						$("<label>").text("Option: " + opt).prop('outerHTML'),
						$("<input type='text'>").attr('id', "Q"+(i+1)+"_opt"+(j+1)).prop('outerHTML')
					].join("\n");

					$("#options").append($("<div>").append(template));
				})
			})
		}
	})
})

$("#btn_vote").click(function(e){
	var y = bigInt(base64ToHex(electionDetails[0].data[0].key.y), 16);
	var g = bigInt(base64ToHex(electionDetails[0].data[0].key.g), 16);
	var p = bigInt(base64ToHex(electionDetails[0].data[0].key.p), 16);

	var answers = [];
	var promArr = [];
	$("#msg").html("");
	electionDetails[0].data[0].questions.forEach(function(q, i){
		answers.push({choices:[], overall_proof:[]})
		let question_c1 = bigInt(1);
		let question_c2 = bigInt(1);
		let question_value = 0;
		let question_r = bigInt(0);

		$("#msg").append($("<p>").text("Question " + (i+1) + " encrypt:"));
		q.answers.forEach(function(opt, j){
			answers[i].choices.push({})

			let id = "#Q"+(i+1)+"_opt"+(j+1);
			$("#msg").append($("<p>").text("Option " + (j+1) + ":"));

			let value = parseInt($(id).val());
			question_value += value;
			let r = bigInt.randBetween(1, p.minus(2));
			question_r = question_r.add(r).mod(p.minus(1));
			$("#msg").append($("<p>").text("r (random): " + r.toString()));
			let c1 = g.modPow(r,p);
			let c1_base64 = hexToBase64(c1.toString(16));
			question_c1 = question_c1.multiply(c1).mod(p);
			$("#msg").append($("<p>").text("c1 (g^r mod p): " + c1.toString()));
			let c2 = (y.modPow(r,p)).multiply(g.modPow(value,p)).mod(p);
			let c2_base64 = hexToBase64(c2.toString(16));
			question_c2 = question_c2.multiply(c2).mod(p);
			$("#msg").append($("<p>").text("c2 (y^r g^i mod p): " + c2.toString()));

			let msg = {
				electionID: electionDetails[0].electionID,
				questionIndex: i,
				choiceIndex: j,
				c1: c1_base64,
				c2: c2_base64
			}

			promArr.push(window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(JSON.stringify(msg))).then(function(hashBuffer){
				let e_sum = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16).mod(p);

				let simProof = genSimProof(p,g,y,c1,c2,1-value);
				let realProof = genRealProof(p,g,y,e_sum,simProof.e,r);

				let proof = [];
				proof[1-value] = proofToBase64(simProof);
				proof[value] = proofToBase64(realProof);

				answers[i].choices[j]["proof"] = proof;
			}))

			answers[i].choices[j]["c1"] = c1_base64;
			answers[i].choices[j]["c2"] = c2_base64;
		})

		let msg = {
			electionID: electionDetails[0].electionID,
			questionIndex: i,
			question_c1: hexToBase64(question_c1.toString(16)),
			question_c2: hexToBase64(question_c2.toString(16)),
		}

		promArr.push(window.crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(JSON.stringify(msg))).then(function(hashBuffer){
			let e_sum = bigInt(base64ToHex(arrayBufferToBase64(hashBuffer)), 16).mod(p);
			let e_sim_sum = bigInt(0);
			
			for (let v=q.min_choice ; v<=q.max_choice ; v++){
				answers[i].overall_proof.push({});

				if(v != question_value){
					let simProof = genSimProof(p,g,y,question_c1,question_c2,v);
					e_sim_sum = e_sim_sum.add(simProof.e).mod(p);
					answers[i].overall_proof[v-q.min_choice] = proofToBase64(simProof);
				}
			}

			if(answers[i].overall_proof[question_value]){
				answers[i].overall_proof[question_value] = proofToBase64(genRealProof(p,g,y,e_sum,e_sim_sum,question_r));
			}
		}))
	})

	Promise.all(promArr).then(function(result){
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
				$("#msg").append($("<p>").text("Voter signature: " + arrayBufferToBase64(sign)));
				$("#msg").append($("<p>").text("Ballot with proof: " + JSON.stringify(ballot)));

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
	})
})

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
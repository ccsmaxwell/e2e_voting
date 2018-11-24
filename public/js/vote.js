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
	$("#msg").html("");
	electionDetails[0].data[0].questions.forEach(function(q, i){
		var option_ans = [];

		$("#msg").append($("<p>").text("Question " + (i+1) + " encrypt:"));
		q.answers.forEach(function(opt, j){
			let id = "#Q"+(i+1)+"_opt"+(j+1);
			$("#msg").append($("<p>").text("Option " + (j+1) + ":"));

			let r = bigInt.randBetween(1, p.minus(2));
			$("#msg").append($("<p>").text("r (random): " + r.toString()));
			let c1 = g.modPow(r,p);
			$("#msg").append($("<p>").text("c1 (g^r mod p): " + c1.toString()));
			let c2 = (y.modPow(r,p)).multiply(g.modPow($(id).val(),p)).mod(p);
			$("#msg").append($("<p>").text("c2 (y^r g^i mod p): " + c2.toString()));

			option_ans.push({c1: hexToBase64(c1.toString(16)), c2: hexToBase64(c2.toString(16))});
		})

		answers.push(option_ans);
	})

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
$("#btn_create").click(function(e){
	var q_list = [];
	if($("#question_1").val()){
		q_list.push({
			question: $("#question_1").val(),
			answers:  $("#question_1_opt").val().split(";")
		})
	}
	if($("#question_2").val()){
		q_list.push({
			question: $("#question_2").val(),
			answers:  $("#question_2_opt").val().split(";")
		})
	}

	var key = {
		p: $("#elgamal_p").val(),
		g: $("#elgamal_g").val(),
		trustees_y: $("#elgamal_y").val().split(";")
	};

	$.ajax({
		type: "POST",
		url: "/election/create",
		data:{			
			name: $("#election_name").val(),
			description: $("#election_description").val(),
			description: $("#election_description").val(),
			question_list: JSON.stringify(q_list),
			key: JSON.stringify(key)
		},	
		success: function(res){				
			console.log(res);
		}
	})
})
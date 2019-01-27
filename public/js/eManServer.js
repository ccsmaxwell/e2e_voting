$("#btn_add_col").children().click(function(){
	var i = $('.s_card').length;

	var template = [
		'<div class="col s12">',
			'<div class="card s_card">',
				'<div class="row">',
					'<div class="input-field col s12">',
						$('<input type="text" class="s_id">').attr("id", "id"+i).prop('outerHTML'),
						$('<label>Server ID</label>').attr("for", "id"+i).prop('outerHTML'),
					'</div>',
				'</div>',
			'</div>',
		'</div>',
	].join("\n");

	$("#btn_add_col").before($(template));
})

// $("#btn_submit").click(function(){
// 	var questions = [];
// 	$('.q_card').each(function(){
// 		let question = $(this).find('.q_title').val().trim();
		
// 		let answers = [];
// 		$(this).find('.optDiv').find('input').each(function(){
// 			let opt = $(this).val().trim();
// 			if(opt != ''){
// 				answers.push(opt);
// 			}
// 		})

// 		let min_choice = parseInt($(this).find('.q_min').val());
// 		let max_choice = parseInt($(this).find('.q_max').val());

// 		if(question!='' && answers.length>0 && min_choice>=0 && max_choice<=answers.length){
// 			questions.push({
// 				question: question,
// 				answers: answers,
// 				min_choice: min_choice,
// 				max_choice: max_choice
// 			})
// 		}
// 	})

// 	var data = {
// 		questions: questions
// 	}

// 	rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
// 		data["adminSign"] = arrayBufferToBase64(sign);
// 		data.questions = JSON.stringify(data.questions);

// 		$.ajax({
// 			type: "POST",
// 			url: "./questions",
// 			data: data,	
// 			success: function(res){
// 				if(res.success){
// 					$(location).attr('href', '/election/manage/' + res.electionID);
// 				}else{
// 					console.log(res);
// 				}
// 			}
// 		})
// 	})
// })
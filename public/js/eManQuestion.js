function optAddListener(btnObj){
	$(btnObj).children().click(function(){
		let i = $('.q_card').index($(btnObj).parent().parent());
		let j = $(btnObj).parent().find('.optDiv').length;
		let tempID = i + "ans" + j;

		let template = [
			'<div class="input-field col s12 optDiv">',
				$('<i class="material-icons prefix">check_box_outline_blank</i>').prop('outerHTML'),
				$('<input type="text">').attr("id", tempID).prop('outerHTML'),
				$('<label>Option</label>').attr("for", tempID).prop('outerHTML'),
			'</div>',
		].join("\n");

		$(btnObj).before($(template));
	})
}

$(".btn_opt_add").each(function(){
	optAddListener(this);
})

$("#btn_add_col").children().click(function(){
	var i = $('.q_card').length;

	var template = [
		'<div class="col s12">',
			'<div class="card cardRowMargin q_card">',
				'<div class="row">',
					'<div class="input-field col s12">',
						$('<input type="text" class="q_title">').attr("id", "title"+i).prop('outerHTML'),
						$('<label>Question</label>').attr("for", "title"+i).prop('outerHTML'),
					'</div>',
					'<div class="input-field col s12 optDiv">',
						$('<i class="material-icons prefix">check_box_outline_blank</i>').prop('outerHTML'),
						$('<input type="text">').attr("id", i+"ans0").prop('outerHTML'),
						$('<label>Option</label>').attr("for", i+"ans0").prop('outerHTML'),
					'</div>',
					'<div class="col s12 center-align btn_opt_add">',
						'<a class="btn-floating btn-small waves-effect waves-light deep-purple lighten-2"><i class="material-icons">add</i></a>',
					'</div>',
					'<div class="input-field col s12 l6">',
						$('<input type="text" class="q_min">').attr("id", "min"+i).prop('outerHTML'),
						$('<label>Minimium no. of choice(s)</label>').attr("for", "min"+i).prop('outerHTML'),
					'</div>',
					'<div class="input-field col s12 l6">',
						$('<input type="text" class="q_max">').attr("id", "max"+i).prop('outerHTML'),
						$('<label>Maximium no. of choice(s)</label>').attr("for", "max"+i).prop('outerHTML'),
					'</div>',
				'</div>',
			'</div>',
		'</div>',
	].join("\n");

	var element = $(template);
	optAddListener(element.find('.btn_opt_add'));

	$("#btn_add_col").before(element);
})

$("#btn_submit").click(function(){
	var questions = [];
	$('.q_card').each(function(){
		let question = $(this).find('.q_title').val().trim();
		
		let answers = [];
		$(this).find('.optDiv').find('input').each(function(){
			let opt = $(this).val().trim();
			if(opt != ''){
				answers.push(opt);
			}
		})

		let min_choice = parseInt($(this).find('.q_min').val());
		let max_choice = parseInt($(this).find('.q_max').val());

		if(question!='' && answers.length>0 && min_choice>=0 && max_choice<=answers.length){
			questions.push({
				question: question,
				answers: answers,
				min_choice: min_choice,
				max_choice: max_choice
			})
		}
	})

	var data = {
		questions: questions
	}

	rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = arrayBufferToBase64(sign);
		data.questions = JSON.stringify(data.questions);

		$.ajax({
			type: "POST",
			url: "./questions",
			data: data,	
			success: function(res){
				if(res.success){
					$(location).attr('href', '/election/manage/' + res.electionID);
				}else{
					console.log(res);
				}
			}
		})
	})
})
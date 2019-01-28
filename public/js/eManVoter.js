const pageLimit = 20;

function updateList(page){
	$.ajax({
		type: "GET",
		url: "./voters/list", 
		data:{
			page: page || 1,
			limit: pageLimit
		},
		success: function(res){
			$("li.voterLi").remove();

			if(res.total == 0){
				$('#pagination ul').remove();
			}else if(res.success == false){
				console.log(res);
			}else{
				res.result.forEach(function(v){
					var template = [
						'<li class="collection-item voterLi">',
							'<div>',
								$('<span>').text(v._id).prop('outerHTML'),
								'<a class="secondary-content">',
									'<i class="material-icons red-text">delete</i>',
								'</a>',
							'</div>',
						'</li>',
					].join("\n");

					let el = $(template);
					el.find('i').click(function(){
						$("#del_voter_id").val(v._id);
						M.updateTextFields();

						$('#del_modal').modal('open');
					})

					$('#voter_list').append(el);
				})

				if(!page){
					$('#pagination ul').remove();
					$('#pagination').materializePagination({
						align: 'center',
						lastPage:  Math.ceil(res.total/pageLimit),
						firstPage:  1,
						useUrlParameter: false,
						onClickCallback: function(requestedPage){
							updateList(requestedPage);
						}
					});
				}
			}
		}
	});
}

function addVoterLi(){
	var i = $('#add_modal li').length;

	var template = [
		'<li class="collection-item">',
			'<div class="row">',
				'<div class="input-field col s12 m6">',
					$('<input class="add_v_id" type="text">').attr("id", "voterID"+i).attr('value', uuidv4()).prop('outerHTML'),
					$('<label class="active">Voter ID</label>').attr("for", "voterID"+i).prop('outerHTML'),
				'</div>',
				'<div class="input-field col s12 m6">',
					$('<input class="add_v_email" type="text">').attr("id", "voterEmail"+i).prop('outerHTML'),
					$('<label>Voter Email</label>').attr("for", "voterEmail"+i).prop('outerHTML'),
				'</div>',
			'</div>',
		'</li>',
	].join("\n");

	$("#add_modal ul").append($(template));
}

updateList();

$(document).ready(function(){
	$('.modal').modal();
})

$("#add_btn").click(function(){
	$("#add_modal li").remove();
	addVoterLi();

	$('#add_modal').modal('open');
})

$("#btn_add_li").click(function(){
	addVoterLi();
})

$("#btn_add_all").click(function(){
	var voters = [];
	$('#add_modal li').each(function(){
		let id = $(this).find('.add_v_id').val().trim();
		let email = $(this).find('.add_v_email').val().trim();

		if(id != '' && email != ''){
			voters.push({
				id: id,
				email: email
			})
		}
	})

	$.ajax({
		type: "POST",
		url: "./voters/add-request",
		data: {
			voters: JSON.stringify(voters)
		},	
		success: function(res){
			if(res.success){
				console.log(res);
			}else{
				console.log(res);
			}
		}
	})

	// rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
	// 	data["adminSign"] = arrayBufferToBase64(sign);
	// 	data.servers = JSON.stringify(data.servers);


	// })
})
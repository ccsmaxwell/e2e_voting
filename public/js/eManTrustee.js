const pageLimit = 20;

function updateList(page){
	$.ajax({
		type: "GET",
		url: "./trustees/list", 
		data:{
			page: page || 1,
			limit: pageLimit
		},
		success: function(res){
			$("li.trusteeLi").remove();

			if(res.total == 0){
				$('#pagination ul').remove();
			}else if(res.success == false){
				console.log(res);
			}else{
				res.result.forEach(function(v){
					let genText = v.a ? "Key & proof generated" : "Key & proof not yet generated"
					let template = [
						'<li class="collection-item avatar trusteeLi">',
							'<div>',
								$('<span class="title">').text(v._id).prop('outerHTML'),
								$('<p>').text(v.email).prop('outerHTML'),
								$('<p>').text(genText).prop('outerHTML'),
								'<a class="secondary-content">',
									'<i class="material-icons red-text cursorPointer">delete</i>',
								'</a>',
							'</div>',
						'</li>',
					].join("\n");

					let el = $(template);
					el.find('i').click(function(){
						$("#del_trustee_id").val(v._id);
						M.updateTextFields();

						$('#del_modal').modal('open');
					})

					$('#trustee_list').append(el);
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

function addTrusteeLi(){
	var i = $('#add_modal li').length;

	var template = [
		'<li class="collection-item">',
			'<div class="row">',
				'<div class="input-field col s12 m6">',
					$('<input class="add_t_id" type="text">').attr("id", "trusteeID"+i).prop('outerHTML'),
					$('<label>Trustee ID</label>').attr("for", "trusteeID"+i).prop('outerHTML'),
				'</div>',
				'<div class="input-field col s12 m6">',
					$('<input class="add_t_email" type="text">').attr("id", "trusteeEmail"+i).prop('outerHTML'),
					$('<label>Trustee Email</label>').attr("for", "trusteeEmail"+i).prop('outerHTML'),
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
	addTrusteeLi();

	$('#add_modal').modal('open');
})

$("#btn_add_li a").click(function(){
	addTrusteeLi();
})

$("#btn_add_all").click(function(){
	var trustees = [];
	$('#add_modal li').each(function(){
		let id = $(this).find('.add_t_id').val().trim();
		let email = $(this).find('.add_t_email').val().trim();

		if(id != '' && email != ''){
			trustees.push({
				trusteeID: id,
				email: email
			})
		}
	})

	$.ajax({
		type: "POST",
		url: "./trustees/add-request",
		data: {
			trustees: JSON.stringify(trustees)
		},	
		success: function(res){
			if(res.success){
				console.log(res);

				var data = {
					trustees: res.signData
				}

				rsaSign($("#add_admin_pri").val(), JSON.stringify(data), function(sign){
					data["adminSign"] = sign;
					data["tempID"] = res.tempID;
					delete data.trustees;

					$.ajax({
						type: "POST",
						url: "./trustees/add-confirm",
						data: data,	
						success: function(res){
							if(res.success){
								updateList();
							}else{
								console.log(res);
							}
						}
					})
				})
			}else{
				console.log(res);
			}
		}
	})
})

$("#btn_del_submit").click(function(){
	var data = {
		trustees: [{
			trusteeID: $("#del_trustee_id").val(),
			y: ""
		}]
	}

	rsaSign($("#del_admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = sign;
		data.trustees = JSON.stringify(data.trustees);

		$.ajax({
			type: "POST",
			url: "./trustees/del",
			data: data,	
			success: function(res){
				if(res.success){
					updateList(parseInt($("#pagination li.active").attr('data-page')));
				}else{
					console.log(res);
				}
			}
		})
	})
})
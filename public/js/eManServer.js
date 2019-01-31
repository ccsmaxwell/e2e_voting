$("#btn_add_col").children().click(function(){
	var i = $('.s_card').length;

	var template = [
		'<div class="col s12">',
			'<div class="card cardRowMargin s_card">',
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

$("#btn_submit").click(function(){
	var servers = [];
	$('.s_card').each(function(){
		let id = $(this).find('.s_id').val().trim();

		if(id != ''){
			servers.push({
				serverID: id
			})
		}
	})

	var data = {
		servers: servers
	}

	rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = arrayBufferToBase64(sign);
		data.servers = JSON.stringify(data.servers);

		$.ajax({
			type: "POST",
			url: "./servers",
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
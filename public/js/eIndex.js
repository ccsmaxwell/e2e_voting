$.ajax({
	type: "GET",
	url: "./" + $("#electionID").val() + "/indexInfo",
	data: {},
	success: function(res){
		if(res.success){
			res.trustee.forEach(function(t){
				let template = [
					'<li class="collection-item">',
						$('<span></span>').text(t._id+": "+t.email).prop('outerHTML'),
					'</li>',
				].join("\n");

				$("#trustee_div ul.collection").append(template);
			})
			
			let started = (new Date($("#startTime").text())) <= (new Date())
			let ended = (new Date($("#endTime").text())) <= (new Date());
			let tallied=false, decrypted=false, result=false;
			res.tallyBlock.forEach(function(b){
				if(b.data[0].endAt){
					ended=true;
				}else if(b.data[0].tallyAt){
					tallied=true;
				}else if(b.data[0].decryptAt){
					decrypted=true;
				}else if(b.data[0].result){
					result=true;
				}
			})

			if(!started || ended) $("#vote_btn_col a").addClass('disabled')
			if(ended) $("#vote_end_col a").addClass('disabled')
			if(!ended || tallied) $("#start_tally_col a").addClass('disabled')
			if(!tallied || decrypted) $("#start_decrypt_col a").addClass('disabled')
			if(!result) $("#result_col a").addClass('disabled')
		}else{
			console.log(res);
		}
	}
});

$("#vote_end_col a").click(function(){
	$('#end_modal').modal('open');
})

$("#btn_end_submit").click(function(){
	var data = {
		endAt: (new Date()).toISOString()
	}

	rsaSign($("#end_admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = sign;

		$.ajax({
			type: "POST",
			url: "./tally/" + $("#electionID").val() + "/end-election",
			data: data,	
			success: function(res){
				if(res.success){
					M.toast({html: 'Ended election', classes: 'rounded'})
					console.log(res);
				}else{
					console.log(res);
				}
			}
		})
	})
})

$("#start_tally_col a").click(function(){
	$('#tally_modal').modal('open');
})

$("#btn_tally_submit").click(function(){
	var serverList = []
	$(".server_checkbox").each(function(s){
		if($(this).prop('checked')){
			serverList.push($(this).attr('value'))
		}
	})

	$.ajax({
		type: "POST",
		url: "./tally/" + $("#electionID").val() + "/start-tally-request",
		data: {
			serverList: JSON.stringify(serverList)
		},	
		success: function(res){
			if(res.success){
				console.log(res);

				rsaSign($("#tally_admin_pri").val(), JSON.stringify(res.signData), function(sign){
					let data = {
						adminSign: sign,
						tempID: res.tempID
					}

					$.ajax({
						type: "POST",
						url: "./tally/" + $("#electionID").val() + "/start-tally-confirm",
						data: data,	
						success: function(res){
							if(res.success){
								M.toast({html: 'Tallying election', classes: 'rounded'})
								console.log(res);
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

$("#start_decrypt_col a").click(function(){
	$('#decrypt_modal').modal('open');
})

$("#btn_decrypt_submit").click(function(){
	var data = {
		decryptAt: (new Date()).toISOString()
	}

	rsaSign($("#decrypt_admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = sign;

		$.ajax({
			type: "POST",
			url: "./tally/" + $("#electionID").val() + "/decrypt-request",
			data: data,	
			success: function(res){
				if(res.success){
					M.toast({html: 'Started decrypting election', classes: 'rounded'})
					console.log(res);
				}else{
					console.log(res);
				}
			}
		})
	})
})
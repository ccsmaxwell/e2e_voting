$("#vote_end_col a").click(function(){
	$('#end_modal').modal('open');
})

$("#btn_end_submit").click(function(){
	var data = {
		endAt: (new Date()).toISOString()
	}

	rsaSign($("#end_admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = arrayBufferToBase64(sign);

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
						adminSign: arrayBufferToBase64(sign),
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
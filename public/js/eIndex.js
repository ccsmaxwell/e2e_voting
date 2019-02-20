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

// $("#btn_end_submit").click(function(){
// 	$.ajax({
// 		type: "POST",
// 		url: "./" + $("#electionID").val() + "/freeze-request",
// 		data: {},	
// 		success: function(res){
// 			if(res.success){
// 				console.log(res);

// 				rsaSign($("#freeze_admin_pri").val(), JSON.stringify(res.signData), function(sign){
// 					let data = {
// 						adminSign: arrayBufferToBase64(sign),
// 						tempID: res.tempID
// 					}

// 					$.ajax({
// 						type: "POST",
// 						url: "./" + $("#electionID").val() + "/freeze-confirm",
// 						data: data,	
// 						success: function(res){
// 							if(res.success){
// 								$(location).attr('href', '/election/' + $("#electionID").val());
// 							}else{
// 								console.log(res);
// 							}
// 						}
// 					})
// 				})
// 			}else{
// 				console.log(res);
// 			}
// 		}
// 	})
// })
$.ajax({
	type: "GET",
	url: "./" + $("#electionID").val() + "/indexStat",
	data: {},
	success: function(res){
		$("#voterCount").text(res.voterCount);
		$("#trusteeCount").text(res.trusteeCount);
	}
});

$(document).ready(function(){
	$('.modal').modal();
})

$("#freeze_btn_col a").click(function(){
	$('#freeze_modal').modal('open');
})

$("#btn_freeze_submit").click(function(){
	$.ajax({
		type: "POST",
		url: "./" + $("#electionID").val() + "/freeze-request",
		data: {},	
		success: function(res){
			if(res.success){
				console.log(res);

				rsaSign($("#freeze_admin_pri").val(), JSON.stringify(res.signData), function(sign){
					let data = {
						adminSign: arrayBufferToBase64(sign),
						tempID: res.tempID
					}

					$.ajax({
						type: "POST",
						url: "./" + $("#electionID").val() + "/freeze-confirm",
						data: data,	
						success: function(res){
							if(res.success){
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
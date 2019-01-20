$(document).ready(function(){
	$('.datepicker').datepicker({
		autoClose: true
	});
	$('.timepicker').timepicker({
		autoClose: true,
		twelveHour: false,
		defaultTime: '00:00'
	});
});

$("#btn_create").click(function(e){
	var key = {
		p: $("#elgamal_p").val(),
		g: $("#elgamal_g").val(),
	};

	var admin = {
		pubKey: $("#admin_pub").val()
	}

	var data = {			
		name: $("#election_name").val(),
		description: $("#election_description").val(),
		start: (new Date($("#election_startDate").val() + " " + $("#election_startTime").val())).toISOString(),
		end: (new Date($("#election_endDate").val() + " " + $("#election_endTime").val())).toISOString(),
		key: key,
		admin: admin
	};

	rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = arrayBufferToBase64(sign);
		data.key = JSON.stringify(data.key);
		data.admin = JSON.stringify(data.admin);

		$.ajax({
			type: "POST",
			url: "/election/create",
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
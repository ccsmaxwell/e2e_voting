$(document).ready(function(){
	$('.datepicker').each(function(){
		if($(this).val() == ''){
			$(this).datepicker({
				autoClose: true
			});
		}else{
			$(this).datepicker({
				autoClose: true,
				defaultDate: new Date($(this).val()),
				setDefaultDate: true
			});
		}
	})

	$('.timepicker').each(function(){
		if($(this).val() == ''){
			$(this).timepicker({
				autoClose: true,
				twelveHour: false,
				defaultTime: '00:00'
			});
		}else{
			let date = new Date($(this).val())
			$(this).val(date.toLocaleTimeString('en-GB').substring(0,5));

			$(this).timepicker({
				autoClose: true,
				twelveHour: false,
				defaultTime: new Date($(this).val())
			});
		}
	})
});

function ajaxCreateEdit(create){
	var data = {
		name: $("#election_name").val(),
		description: $("#election_description").val(),
		start: (new Date($("#election_startDate").val() + " " + $("#election_startTime").val())).toISOString(),
		end: (new Date($("#election_endDate").val() + " " + $("#election_endTime").val())).toISOString()
	};

	if(create){
		let key = {
			p: $("#elgamal_p").val(),
			g: $("#elgamal_g").val(),
		};
		let admin = {
			pubKey: $("#admin_pub").val()
		}

		data["key"] = key;
		data["admin"] = admin;
	}

	rsaSign($("#admin_pri").val(), JSON.stringify(data), function(sign){
		data["adminSign"] = arrayBufferToBase64(sign);
		if(create){
			data.key = JSON.stringify(data.key);
			data.admin = JSON.stringify(data.admin);
		}

		$.ajax({
			type: "POST",
			url: create? "/election/create" : "./details",
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
}

$("#btn_create").click(function(e){
	ajaxCreateEdit(true);
})
$("#btn_edit").click(function(e){
	ajaxCreateEdit(false);
})
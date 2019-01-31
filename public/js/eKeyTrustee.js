$("#btn_gen_key").click(function(){
	var key = dh.createDiffieHellman($("#eKey_p").text(),'base64',$("#eKey_g").text(),'base64')

	$("#new_pub_key").val(arrayBufferToBase64(key.generateKeys()));
	M.textareaAutoResize($('#new_pub_key'));
	$("#new_pri_key").val(arrayBufferToBase64(key.getPrivateKey()));
	$("#new_pri_key").parent().removeClass('hide');
	M.textareaAutoResize($('#new_pri_key'));

	M.updateTextFields();
})

$("#btn_submit").click(function(){
	// var data = {
	// 	id: $("#voterID").val(),
	// 	public_key: $("#new_pub_key").val(),
	// }

	// rsaSign($("#curr_pri").val(), JSON.stringify(data), function(sign){
	// 	data["voterSign"] = arrayBufferToBase64(sign);

	// 	$.ajax({
	// 		type: "POST",
	// 		url: "./changeKey",
	// 		data: data,	
	// 		success: function(res){
	// 			if(res.success){
	// 				console.log(res);
	// 			}else{
	// 				console.log(res);
	// 			}
	// 		}
	// 	})
	// })
})
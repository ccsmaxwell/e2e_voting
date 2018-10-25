$("#btn_vote").click(function(e){
	$.ajax({
		type: "GET",
		url: "/election/getDetails",
		data:{			
			electionID: $("#election_id").val()
		},	
		success: function(res){				
			// console.log(res);

			var y = bigInt(base64toHex(res[0].data[0].key.y), 16)
			var g = bigInt(base64toHex(res[0].data[0].key.g), 16)
			var p = bigInt(base64toHex(res[0].data[0].key.p), 16)

			var k = bigInt.randBetween(1, p.minus(2))

			console.log(y,g,p,k)
		}
	})
})

function base64toHex(base64) {
	var raw = atob(base64);
	var hex = '';

	for (i = 0; i < raw.length; i++) {
		var _hex = raw.charCodeAt(i).toString(16)
		hex += (_hex.length==2? _hex : '0'+_hex);
	}

	return hex;
}
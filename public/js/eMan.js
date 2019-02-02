$.ajax({
	type: "GET",
	url: "./" + $("#electionID").val() + "/indexStat",
	data: {},
	success: function(res){
		$("#voterCount").text(res.voterCount);
		$("#trusteeCount").text(res.trusteeCount);
	}
});
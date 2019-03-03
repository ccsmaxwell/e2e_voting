$.ajax({
	type: "GET",
	url: "./performance/data", 
	data: {},
	success: function(res){
		if(!res){
			return console.log(res)
		}

		let arrSort_voterTime = res.concat().sort((a,b) => new Date(a.voterTimestamp) - new Date(b.voterTimestamp));
		let data_voterTime = [], count_voterTime = 0;
		arrSort_voterTime.forEach(function(b){
			data_voterTime.push({
				x: new Date(b.voterTimestamp),
				y: ++count_voterTime
			})
		})

		let ctx = $("#ballot_chart");
		let lineChart = new Chart(ctx, {
			type: 'line',
			data: {
				datasets: [{
					data: data_voterTime,
					label: "Vote submit",
					fill: false,
					borderColor: "Blue"
				}]
			},
			options: {
				scales: {
					xAxes: [{
						type: 'time',
						time: {
							displayFormats: {
								millisecond: 'kk:mm:ss.SSS'
							}
						},
						distribution: 'linear'
					}]
				}
			}
		});
	}
})
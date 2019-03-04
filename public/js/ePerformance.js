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
		let arrSort_recTime = res.concat().sort((a,b) => new Date(a.receiveTime) - new Date(b.receiveTime));
		let data_recTime = [], count_recTime = 0;
		let arrSort_blockTime = res.concat().sort((a,b) => new Date(a.blockCreatedAt) - new Date(b.blockCreatedAt));
		let data_blockTime = [], count_blockTime = 0;
		for(let bi in res){
			if(bi>0 && arrSort_voterTime[bi-1].voterTimestamp==arrSort_voterTime[bi].voterTimestamp){
				data_voterTime[data_voterTime.length-1].y = ++count_voterTime;
			}else{
				data_voterTime.push({
					x: new Date(arrSort_voterTime[bi].voterTimestamp),
					y: ++count_voterTime
				})
			}

			if(bi>0 && arrSort_recTime[bi-1].receiveTime==arrSort_recTime[bi].receiveTime){
				data_recTime[data_recTime.length-1].y = ++count_recTime;
			}else{
				data_recTime.push({
					x: new Date(arrSort_recTime[bi].receiveTime),
					y: ++count_recTime
				})
			}

			if(bi>0 && arrSort_blockTime[bi-1].blockCreatedAt==arrSort_blockTime[bi].blockCreatedAt){
				data_blockTime[data_blockTime.length-1].y = ++count_blockTime;
			}else{
				data_blockTime.push({
					x: new Date(arrSort_blockTime[bi].blockCreatedAt),
					y: ++count_blockTime
				})
			}
		}

		let ctx = $("#ballot_chart");
		let lineChart = new Chart(ctx, {
			type: 'line',
			data: {
				datasets: [{
					data: data_voterTime,
					label: "Vote submit",
					fill: false,
					borderColor: "Red",
					steppedLine: true
				},{
					data: data_recTime,
					label: "Vote receive",
					fill: false,
					borderColor: "Yellow",
					steppedLine: true
				},{
					data: data_blockTime,
					label: "Block generate",
					fill: false,
					borderColor: "Green",
					steppedLine: true
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
				},
				animation: {
					duration: 0,
				},
				hover: {
					animationDuration: 0,
				},
				responsiveAnimationDuration: 0,
			}
		});
	}
})
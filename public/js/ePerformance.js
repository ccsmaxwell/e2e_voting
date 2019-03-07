$.ajax({
	type: "GET",
	url: "./performance/data", 
	data: {},
	success: function(res){
		if(!res){
			return console.log(res)
		}

		const second = 1000;
		const minute = 60 * 1000;

		let arrSort_voterTime = res.concat().sort((a,b) => new Date(a.voterTimestamp) - new Date(b.voterTimestamp));
		let data_voterTime = [], count_voterTime = 0;
		let arrSort_recTime = res.concat().sort((a,b) => new Date(a.receiveTime) - new Date(b.receiveTime));
		let data_recTime = [], count_recTime = 0;
		let arrSort_blockTime = res.concat().sort((a,b) => new Date(a.blockCreatedAt) - new Date(b.blockCreatedAt));
		let data_blockTime = [], count_blockTime = 0;
		let data_latency = [];
		let data_throughput = [];
		for(let bi in res){
			if(arrSort_voterTime[bi].voterTimestamp){
				let roundedTime = new Date(Math.round(new Date(arrSort_voterTime[bi].voterTimestamp).getTime() / second) * second);
				if(bi>0 && data_voterTime[data_voterTime.length-1].x.toISOString()==roundedTime.toISOString()){
					data_voterTime[data_voterTime.length-1].y = ++count_voterTime;
				}else{
					data_voterTime.push({
						x: roundedTime,
						y: ++count_voterTime
					})
				}
			}

			if(arrSort_voterTime[bi].receiveTime){
				let roundedTime = new Date(Math.round(new Date(arrSort_recTime[bi].receiveTime).getTime() / second) * second);
				if(bi>0 && data_recTime[data_recTime.length-1].x.toISOString()==roundedTime.toISOString()){
					data_recTime[data_recTime.length-1].y = ++count_recTime;
				}else{
					data_recTime.push({
						x: roundedTime,
						y: ++count_recTime
					})
				}
			}

			if(arrSort_voterTime[bi].blockCreatedAt){
				let roundedTime = new Date(Math.round(new Date(arrSort_blockTime[bi].blockCreatedAt).getTime() / second) * second);
				if(bi>0 && data_blockTime[data_blockTime.length-1].x.toISOString()==roundedTime.toISOString()){
					data_blockTime[data_blockTime.length-1].y = ++count_blockTime;
				}else{
					data_blockTime.push({
						x: roundedTime,
						y: ++count_blockTime
					})
				}

				roundedTime = new Date(Math.round(new Date(arrSort_blockTime[bi].blockCreatedAt).getTime() / minute) * minute);
				if(bi>0 && data_latency[data_latency.length-1].x.toISOString()==roundedTime.toISOString()){
					data_latency[data_latency.length-1].y += (new Date(arrSort_blockTime[bi].blockCreatedAt) - new Date(arrSort_blockTime[bi].voterTimestamp));
					data_throughput[data_latency.length-1].y++;
				}else{
					data_latency.push({
						x: roundedTime,
						y: (new Date(arrSort_blockTime[bi].blockCreatedAt) - new Date(arrSort_blockTime[bi].voterTimestamp)),
					})
					data_throughput.push({
						x: roundedTime,
						y: 1
					})
				}
			}
		}

		for(let di in data_latency){
			data_latency[di].y = data_latency[di].y/data_throughput[di].y/1000
		}

		let ctx1 = $("#ballot_chart");
		let lineChart1 = new Chart(ctx1, {
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
							displayFormats: {millisecond: 'kk:mm:ss.SSS'}
						},
						distribution: 'linear'
					}],
					yAxes: [{
						ticks: {suggestedMin: 0}
					}]
				},
				animation: {duration: 0},
				hover: {animationDuration: 0},
				responsiveAnimationDuration: 0,
			}
		});

		let ctx2 = $("#latency_chart");
		let lineChart2 = new Chart(ctx2, {
			type: 'line',
			data: {
				datasets: [{
					data: data_latency,
					label: "Ballot latency",
					fill: false,
					borderColor: "Green",
					steppedLine: false
				}]
			},
			options: {
				scales: {
					xAxes: [{
						type: 'time',
						time: {
							displayFormats: {second: 'kk:mm:ss'}
						},
						distribution: 'linear'
					}],
					yAxes: [{
						ticks: {suggestedMin: 0}
					}]
				},
				animation: {duration: 0},
				hover: {animationDuration: 0},
				responsiveAnimationDuration: 0,
			}
		});

		let ctx3 = $("#throughput_chart");
		let lineChart3 = new Chart(ctx3, {
			type: 'line',
			data: {
				datasets: [{
					data: data_throughput,
					label: "Ballot throughput",
					fill: false,
					borderColor: "Green",
					steppedLine: false
				}]
			},
			options: {
				scales: {
					xAxes: [{
						type: 'time',
						time: {
							displayFormats: {second: 'kk:mm:ss'}
						},
						distribution: 'linear'
					}],
					yAxes: [{
						ticks: {suggestedMin: 0}
					}]
				},
				animation: {duration: 0},
				hover: {animationDuration: 0},
				responsiveAnimationDuration: 0,
			}
		});
	}
})
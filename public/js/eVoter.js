const pageLimit = 20;

function updateList(page){
	$.ajax({
		type: "GET",
		url: "./voters/list", 
		data:{
			page: page || 1,
			limit: pageLimit
		},
		success: function(res){
			$("li.voterLi").remove();

			if(res.total == 0){
				$('#pagination ul').remove();
			}else if(res.success == false){
				console.log(res);
			}else{
				res.result.forEach(function(v){
					let voteAt = v.ballot[0] ? (new Date(v.ballot[0].receiveTime)).toLocaleString('en-GB') : "";
					let voteSign = v.ballot[0] ? v.ballot[0].voterSign : "";
					let template = [
						'<li class="collection-item avatar voterLi">',
							'<div>',
								$('<span class="title">').text("ID: " + v._id).prop('outerHTML'),
								$('<p>').text("Vote at: " + voteAt).prop('outerHTML'),
								$('<p class="voterLiSign shortSign wordBreakAll truncate">').text("Signature: " + voteSign).prop('outerHTML'),
							'</div>',
						'</li>',
					].join("\n");

					let el = $(template);
					el.find('.voterLiSign').click(function(){
						if($(this).hasClass('truncate')){
							$(this).removeClass('shortSign truncate');
						}else{
							$(this).addClass('shortSign truncate');
						}
					})
					$('#voter_list').append(el);
				})

				if(!page){
					$('#pagination ul').remove();
					$('#pagination').materializePagination({
						align: 'center',
						lastPage:  Math.ceil(res.total/pageLimit),
						firstPage:  1,
						useUrlParameter: false,
						onClickCallback: function(requestedPage){
							updateList(requestedPage);
						}
					});
				}
			}
		}
	});
}

updateList();
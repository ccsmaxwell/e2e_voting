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
					var template = [
						'<li class="collection-item voterLi">',
							'<div>',
								$('<span>').text(v._id).prop('outerHTML'),
								'<a class="secondary-content">',
									'<i class="material-icons red-text">delete</i>',
								'</a>',
							'</div>',
						'</li>',
					].join("\n");

					$('#voter_list').append($(template));

					// a.click(function(e){ getUserDatail(e); });
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
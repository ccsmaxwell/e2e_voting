$('#footerServerIdSpan').click(function(){
	var tempEl = document.createElement("textarea");
	tempEl.value = $("#footerServerId").text();
	document.body.appendChild(tempEl);
	tempEl.focus();
	tempEl.select();
	document.execCommand("copy");
	tempEl.remove();

	M.toast({html: 'Copied Server ID to clipboard', classes: 'rounded'})
})

 M.AutoInit();
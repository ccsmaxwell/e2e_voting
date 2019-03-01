var AWS = require('aws-sdk');
var fs = require('fs');

const {awsEmailEnable, awsEmailFrom, awsAccessKeyId, awsSecretAccessKeyPath, awsRegion, awsProxy} = _config;

if(awsEmailEnable){
	AWS.config.update({ 
		"accessKeyId": awsAccessKeyId,
		"secretAccessKey": fs.readFileSync(awsSecretAccessKeyPath),
		"region": awsRegion,
		"httpOptions": {proxy: awsProxy}
	});
}

module.exports = {

	sendEmail: function(cc, to, html, text, subject, replyto){
		if(awsEmailEnable){
			return module.exports.sendViaAws(cc, to, html, text, subject, replyto);
		}else{
			throw "[Email] NO email service enabled.";
		}
	},

	sendViaAws: function(cc, to, html, text, subject, replyto){
		var params = {
			Destination: {
				CcAddresses: cc,
				ToAddresses: to
			},
			Message: { 
				Body: {
					Html: {
						Charset: "UTF-8",
						Data: html
					},
					Text: {
						Charset: "UTF-8",
						Data: text
					}
				},
				Subject: {
					Charset: 'UTF-8',
					Data: subject
				}
			},
			Source: awsEmailFrom,
			ReplyToAddresses: replyto,
		};       

		return new AWS.SES({apiVersion: 'latest'}).sendEmail(params).promise();
	}
}
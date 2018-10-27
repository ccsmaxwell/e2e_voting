var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

var Schema = mongoose.Schema;

var BallotSchema = new Schema({
	// global (by receive)
	electionID: String,
	voterID: String,
	answers: [],
	voterSign: String,
	// global (by server)
	ballotID: String,
	receiveTime: Date,
	// local
	sign: [{
		trusteeID: String,
		signHash: String
	}],
	inBlock: Boolean
}, { timestamps: {} });

module.exports = mongoose.model('Ballot', BallotSchema);
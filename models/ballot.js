var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

var Schema = mongoose.Schema;

var BallotSchema = new Schema({
	// global
	electionID: String,
	ballotID: String,
	choice: String,
	// local
	sign: [{
		trusteeID: String,
		signHash: String
	}],
	inBlock: Boolean
}, { timestamps: {} });

module.exports = mongoose.model('Ballot', BallotSchema);
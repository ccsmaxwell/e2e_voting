var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

var Schema = mongoose.Schema;

var BallotSchema = new Schema({
	electionID: String,
	ballotID: String,
	choice: String,
	sign: [{
		trusteeID: String,
		signHash: String
	}]
}, { timestamps: {} });

module.exports = mongoose.model('Ballot', BallotSchema);
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
	receiveTime: Date,
	// local
	sign: [{
		serverID: String,
		ballotSign: String
	}],
	inBlock: Boolean
}, { timestamps: {} });

BallotSchema.index({ electionID: 1, voterSign: 1}, { unique: true });

module.exports = mongoose.model('Ballot', BallotSchema);
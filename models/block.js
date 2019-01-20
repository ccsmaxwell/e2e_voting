var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

var Schema = mongoose.Schema;

var BlockSchema = new Schema({
	// global
	blockUUID: String,
	electionID: String,
	blockSeq: Number,
	previousHash: String,
	blockType: String,
	data: [],
	hash:String,
	// local
	sign: [{
		serverID: String,
		BlockHashSign: String
	}]
}, { timestamps: {} });

module.exports = mongoose.model('Block', BlockSchema);
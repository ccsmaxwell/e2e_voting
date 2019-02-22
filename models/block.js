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
		blockHashSign: String
	}]
}, { timestamps: {} });

BlockSchema.index({ electionID: 1, blockUUID: 1}, { unique: true });

module.exports = mongoose.model('Block', BlockSchema);
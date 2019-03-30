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

BlockSchema.index({electionID: 1, blockUUID: 1}, { unique: true });
BlockSchema.index({electionID: 1, blockType: 1, blockSeq: -1, "data.voters.id": 1});
BlockSchema.index({electionID: 1, blockSeq: -1});

module.exports = mongoose.model('Block', BlockSchema);
var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

var Schema = mongoose.Schema;

var Node_serverSchema = new Schema({
  IP: String,
  port: String,
}, { timestamps: {} });

Node_serverSchema.index({ IP: 1, port: 1}, { unique: true });

module.exports = mongoose.model('Node_server', Node_serverSchema, 'node_server');
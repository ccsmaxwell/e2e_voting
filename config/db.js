var mongoose = require('mongoose');
mongoose.connect(_config.mongoDbPath, { useNewUrlParser: true });

module.exports = mongoose;
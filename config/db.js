var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/fyp_voting_'+(process.env.PORT+"").trim(), { useNewUrlParser: true });

module.exports = mongoose;
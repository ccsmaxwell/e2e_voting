var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var Config = require('./config/configGlobal');
Config.init();
var mongoose = require('./config/db');

var indexRouter = require('./routes/index');
var handshakeRouter = require('./routes/handshake');
var ballotRouter = require('./routes/ballot');
var blockchainRouter = require('./routes/blockchain');
var electionRouter = require('./routes/election');
app.use('/', indexRouter);
app.use('/handshake', handshakeRouter);
app.use('/ballot', ballotRouter);
app.use('/blockchain', blockchainRouter);
app.use('/election', electionRouter);

var Handshake = require('./controllers/handshake');
Handshake.init();
var Blockchain = require('./controllers/blockchain');
Blockchain.init();

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

module.exports = app;
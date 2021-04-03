/* eslint-disable no-param-reassign */
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const { createServer } = require('http');
const WebSocket = require('ws');

const usersRouter = require('./routes/users');
const sessionsRouter = require('./routes/sessions');
const storageRouter = require('./routes/storage');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/users', usersRouter);
app.use('/sessions', sessionsRouter);
app.use('/storage', storageRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
app.use((err, req, res) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const server = createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.info('Total connected clients:', wss.clients.size);
  app.locals.clients = wss.clients;
  ws.isAlive = true;

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'join') {
      ws.session = message.sessionId;
      setInterval(() => { ws.ping(); }, 9000);
    }
  });

  ws.on('close', () => {
    console.info('Total connected clients:', wss.clients.size);
    app.locals.clients = wss.clients;
  });
});

module.exports = server;

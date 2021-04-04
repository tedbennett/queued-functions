/* eslint-disable no-param-reassign */
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const { createServer } = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const { default: axios } = require('axios');
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

const spotifyCredentials = async () => {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
  params.append('client_secret', process.env.SPOTIFY_SECRET);
  // const params = {
  //   headers: {
  //     Authorization: `Basic 1e6ef0ef377c443e8ebf714b5b77cad7:${process.env.SPOTIFY_SECRET}`,
  //     'Content-Type': 'application/x-www-form-urlencoded',
  //   },
  // // };
  // const urlencoded = new URLSearchParams();
  // urlencoded.append('grant_type', 'client_credentials');
  const header = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

  const response = await axios.post('https://accounts.spotify.com/api/token', params, header)
    .catch((err) => console.log(err));
  return response.data.access_token;
};

const extractSong = (data) => {
  if (data.items === undefined) return [];
  return data.items.map((track) => ({
    id: track.uri,
    name: track.name,
    album: track.album.name,
    artist: track.artists[0].name,
    image_url: track.album.images[0].url,
  }));
};

app.get('/search', async (req, res) => {
  console.log('Searching');
  const { query } = req.query;
  const accessToken = await spotifyCredentials();
  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`;

  const params = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  axios.get(url, params)
    .then((tracks) => res.send(extractSong(tracks.data.tracks)));
});

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

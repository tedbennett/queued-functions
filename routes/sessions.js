const router = require('express').Router();
const monk = require('monk');
const { nanoid } = require('nanoid');
const axios = require('axios');
const WebSocket = require('ws');
const db = require('../database');

const sessions = db.get('sessions');
const users = db.get('users');

const broadcast = async (id, clients) => {
  console.log('Sending broadcast');
  if (clients === undefined) return;
  const session = await sessions.findOne({ id });
  const array = Array.from(clients);
  if (array.length === 0) return;
  let count = 0;
  array.forEach((client) => {
    if (client.session === id && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(session));
      count += 1;
    }
  });
  console.log(`Sent broadcast to ${count} subscribers`);
};

const getSpotifyToken = async (sessionId) => {
  let {
    // eslint-disable-next-line prefer-const
    hostId, token, refresh, expiry,
  } = await sessions.findOne({ _id: sessionId })
    .then((session) => users.findOne({ id: session.host }))
    .then((host) => ({
      // eslint-disable-next-line no-underscore-dangle
      hostId: host.id,
      token: host.access_token,
      refresh: host.refresh_token,
      expiry: host.expires_at,
    }));

  const now = new Date();
  if (expiry <= now.getTime()) {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
    params.append('client_secret', process.env.SPOTIFY_SECRET);
    params.append('refresh_token', refresh);
    const header = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

    const { newToken, newExpiry } = await axios.post('https://accounts.spotify.com/api/token', params, header)
      .then((response) => ({
        newToken: response.data.access_token,
        refresh: response.data.refresh_token,
        newExpiry: response.data.expires_in,
      }))
      .catch((err) => console.log(err));

    token = newToken;
    expiry = now.getTime() + (newExpiry * 1000);
    users.update({ _id: monk.id(hostId) }, {
      $set: {
        access_token: token,
        expires_at: expiry,
      },
    });
    return newToken;
  }
  return token;
};

// Get session by id
router.get('/:id', async (req, res) => {
  const session = await sessions.findOne({ _id: monk.id(req.params.id) });

  res.json(session);
});

// Get session by 6-digit key
router.get('/key/:key', async (req, res) => {
  const session = await sessions.findOne({ key: req.params.key });

  res.json(session);
});

// Create session
router.post('/', async (req, res) => {
  const key = nanoid(6).toUpperCase();
  const id = monk.id();
  const { host } = req.body;
  const session = {
    _id: id,
    id: id.toString(),
    key,
    name: req.body.name,
    host,
    created_at: new Date().getTime(),
    members: [host],
    queue: [],
  };

  sessions.insert(session)
    .then((doc) => {
      // eslint-disable-next-line no-underscore-dangle
      users.update({ _id: monk.id(host) }, { $set: { session: doc._id } });
      res.send(doc);
    });
});

// Update a session (only name)
router.post('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  sessions.update({ id }, { name })
    .then((doc) => {
      broadcast(id, req.app.locals.clients);
      res.send(doc);
    });
});

// Add user to session
router.post('/:sessionId/members/:userId', async (req, res, next) => {
  const { userId, sessionId } = req.params;
  sessions.update({ _id: monk.id(sessionId) }, { $addToSet: { members: userId } })
    .then(() => users.update({ _id: monk.id(userId) }, { $set: { session: sessionId } }))
    .then(() => sessions.findOne({ _id: monk.id(sessionId) }))
    .then((doc) => {
      broadcast(sessionId, req.app.locals.clients);
      res.send(doc);
    })
    .catch(next);
});

// Add song to session queue
router.post('/:sessionId/queue', async (req, res, next) => {
  const sessionId = monk.id(req.params.sessionId);
  const song = req.body;

  getSpotifyToken(sessionId)
    .then((token) => {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      return axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${song.id}`, {}, auth);
    })
    .then(() => sessions.update({ _id: sessionId }, { $push: { queue: song } }))
    .then(() => sessions.findOne({ _id: sessionId }))
    .then((doc) => {
      broadcast(doc.id, req.app.locals.clients);
      res.send(doc.queue);
    })
    .catch((err) => {
      if (err.response !== undefined) {
        return next(JSON.stringify(err.response.data));
      }
      return next(err);
    });
});

// Remove user from session
router.delete('/:sessionId/members/:userId', async (req, res, next) => {
  const sessionId = monk.id(req.params.sessionId);
  const { userId } = req.params;
  sessions.update({ _id: sessionId }, { $pull: { members: userId } })
    .then(() => users.update({ _id: monk.id(userId) }, { $set: { session: null } }))
    .then(() => {
      broadcast(sessionId, req.app.locals.clients);
      res.send();
    })
    .catch(next);
});

// Delete session
router.delete('/:sessionId', async (req, res, next) => {
  const { sessionId } = req.params;
  sessions.remove({ _id: monk.id(sessionId) })
    .then(() => {
      broadcast(sessionId, req.app.locals.clients);
      return users.update({ session: sessionId }, { $set: { session: null } });
    })
    .then(() => res.send())
    .catch(next);
});

module.exports = router;

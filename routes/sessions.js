const router = require('express').Router();
const monk = require('monk');
const { customAlphabet } = require('nanoid');
const axios = require('axios');
const WebSocket = require('ws');
const db = require('../database');
const { checkAuth, sessionExists } = require('../middleware');

const sessions = db.get('sessions');
const users = db.get('users');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6);

const refreshSpotifyToken = async (hostId, refresh) => {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
  params.append('client_secret', process.env.SPOTIFY_SECRET);
  params.append('refresh_token', refresh);
  const header = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

  const { token, expiry } = await axios.post('https://accounts.spotify.com/api/token', params, header)
    .then((response) => ({
      token: response.data.access_token,
      refresh: response.data.refresh_token,
      expiry: response.data.expires_in,
    }))
    // eslint-disable-next-line no-console
    .catch((err) => console.log(err));

  const expiresAt = new Date().getTime() + (expiry * 1000);
  return users.update({ id: hostId }, {
    $set: {
      access_token: token,
      expires_at: expiresAt,
    },
  }).then(() => token);
};

const getHostToken = async (req, res, next) => {
  const { sessionId } = req.params;
  const {
    hostId, token, refresh, expiry,
  } = await sessions.findOne({ id: sessionId })
    .then((session) => users.findOne({ id: session.host }))
    .then((host) => ({
      hostId: host.id,
      token: host.access_token,
      refresh: host.refresh_token,
      expiry: host.expires_at,
    }))
    .catch((err) => res.status(500).send({
      error: err,
      message: 'Failed to find session host',
    }));
  if (expiry <= new Date().getTime()) {
    refreshSpotifyToken(hostId, refresh)
      .then((refreshedToken) => {
        req.token = refreshedToken;
        next();
      });
  } else {
    req.token = token;
    next();
  }
};

const broadcast = async (id, clients) => {
  // eslint-disable-next-line no-console
  console.log('Sending broadcast');
  if (clients === undefined) return;
  const session = await sessions.findOne({ id });
  const array = Array.from(clients);
  const availableClients = array
    .filter((client) => client.session === id && client.readyState === WebSocket.OPEN);

  availableClients.forEach((client) => {
    // eslint-disable-next-line no-console
    console.log(`Sending broadcast to ${client.user}`);
    client.send(JSON.stringify(session));
  });
  // eslint-disable-next-line no-console
  console.log(`Sent broadcast to ${availableClients.length} subscribers`);
};

// Get session by id
router.get('/:sessionId', checkAuth, sessionExists, async (req, res) => {
  const { session } = req;
  res.json(session);
});

// Get session by 6-digit key
router.get('/key/:key', checkAuth, async (req, res) => {
  const session = await sessions.findOne({ key: req.params.key });

  if (!session) {
    res.status(404).send('Failed to find session');
  } else {
    res.send(session);
  }
});

// Create session
router.post('/', checkAuth, async (req, res) => {
  const { user } = req;
  if (!user.host) {
    res.status(403).send({ error: 'User is not valid host' });
    return;
  }
  const name = req.body.name ?? 'New Session';
  const key = nanoid();
  const id = monk.id();

  const session = {
    _id: id,
    id: id.toString(),
    key,
    name,
    host: user.id,
    created_at: new Date().getTime(),
    members: [user.id],
    queue: [],
  };

  sessions.insert(session)
    .then(() => users.update({ id: user.id }, { $set: { session: id } }))
    .then(() => res.send(session));
});

// Update a session (only name)
router.patch('/:sessionId', checkAuth, sessionExists, async (req, res) => {
  const { session } = req;
  // eslint-disable-next-line camelcase
  const { name, image_url } = req.body;
  sessions.update({ id: session.id }, { $set: { image_url, name } })
    .then(() => {
      broadcast(session.id, req.app.locals.clients);
      res.send();
    });
});

// Add user to session
router.post('/:sessionId/members', checkAuth, sessionExists, async (req, res) => {
  const { user, session } = req;
  console.log(user.id, session.id);
  sessions.update({ id: session.id }, { $addToSet: { members: user.id } })
    .then(() => users.update({ id: user.id }, { $set: { session: session.id } }))
    .then(() => {
      broadcast(session.id, req.app.locals.clients);
      res.send();
    })
    .catch((error) => {
      res.status(500).send({
        error,
        message: 'Error updating collections',
      });
    });
});

// Add song to session queue
router.post('/:sessionId/queue', checkAuth, sessionExists, getHostToken, async (req, res) => {
  const { token, session, user } = req;
  const { song } = req.body;
  song.queued_by = user.id;

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${song.id}`, {}, auth)
    .then(() => sessions.update({ id: session.id }, { $push: { queue: song } }))
    .then(() => {
      broadcast(session.id, req.app.locals.clients);
      res.send();
    })
    .catch((error) => {
      if (error.response?.status === 404) {
        res.status(404).send({
          message: 'No active Spotify devices',
        });
      } else {
        res.status(500).send({
          message: 'Error communicating with spotify',
        });
      }
    });
});

// Check if there's an active device in the session
router.get('/:sessionId/isActive', checkAuth, sessionExists, getHostToken, async (req, res) => {
  const { token } = req;

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  axios.get('https://api.spotify.com/v1/me/player/devices', auth)
    .then((response) => res.send(response.data))
    .catch((error) => {
      console.log(error);
      res.status(500).send({
        message: 'Error communicating with spotify',
      });
    });
});

// Remove user from session
router.delete('/:sessionId/members/', checkAuth, sessionExists, async (req, res) => {
  const { session, user } = req;
  sessions.update({ id: session.id }, { $pull: { members: user.id } })
    .then(() => users.update({ id: user.id }, { $set: { session: null } }))
    .then(() => {
      broadcast(session.id, req.app.locals.clients);
      res.send();
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send({
        message: 'Error updating collections',
      });
    });
});

// Delete session
router.delete('/:sessionId', checkAuth, sessionExists, async (req, res) => {
  const { session } = req;
  sessions.remove({ id: session.id })
    .then(() => {
      broadcast(session.id, req.app.locals.clients);
      return users.update({ session: session.id }, { $set: { session: null } });
    })
    .then(() => res.send())
    .catch((error) => {
      console.log(error);
      res.status(500).send({
        message: 'Error updating collections',
      });
    });
});

module.exports = router;

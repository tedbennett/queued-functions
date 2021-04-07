const router = require('express').Router();
const monk = require('monk');
const axios = require('axios');
require('dotenv').config();
const db = require('../database');
const { checkAuth, userExists } = require('../middleware');

const users = db.get('users');

// Get user by id
router.get('/:userId', checkAuth, userExists, async (req, res) => {
  res.send(req.user);
});

// Create user
router.post('/', async (req, res) => {
  const id = monk.id();
  const user = {
    _id: id,
    id: id.toString(),
    name: req.body.name,
    image_url: req.body.image_url,
    host: false,
  };
  users.insert(user).then(() => {
    res.send(id);
  });
});

// Update user
router.patch('/:userId', checkAuth, userExists, async (req, res) => {
  const { user } = req;
  const data = { name: req.body.name, image_url: req.body.image_url };
  users.update({ id: user.id }, { $set: data })
    .then(() => {
      res.send();
    })
    .catch((error) => {
      res.status(500).send({
        error,
        message: 'Error updating user collection',
      });
    });
});

router.post('/:userId/authoriseWithSpotify', checkAuth, userExists, async (req, res) => {
  const { code } = req.body;
  const { user } = req;

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', 'queued://oauth-callback/');
  params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
  params.append('client_secret', process.env.SPOTIFY_SECRET);

  const header = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

  // eslint-disable-next-line camelcase
  const { access_token, refresh_token, expires_in } = await axios.post('https://accounts.spotify.com/api/token', params, header)
    .then((response) => response.data)
    .catch((error) => {
      res.status(500).send({
        error,
        message: 'Error authenticating with spotify',
      });
    });
  // eslint-disable-next-line camelcase
  const expires_at = new Date().getTime() + (expires_in * 1000);
  users.update({ id: user.id }, {
    $set: {
      host: true,
      access_token,
      refresh_token,
      expires_at,
    },
  }).then(() => res.send())
    .catch((error) => {
      res.status(500).send({
        error,
        message: 'Error updating user collection',
      });
    });
});

router.post('/:userId/logoutFromSpotify', checkAuth, userExists, async (req, res) => {
  const { user } = req;
  users.update({ id: user.id }, {
    $set: {
      host: false,
      access_token: null,
      refresh_token: null,
      expires_at: null,
    },
  })
    .then(() => res.send())
    .catch((error) => {
      res.status(500).send({
        error,
        message: 'Error updating user collection',
      });
    });
});

module.exports = router;

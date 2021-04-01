const router = require('express').Router();
const monk = require('monk');
const axios = require('axios');
require('dotenv').config();
const db = require('../database');

const users = db.get('users');

// Get user by id
router.get('/:id', async (req, res) => {
  const user = await users.findOne({ _id: monk.id(req.params.id) });

  res.json(user);
});

// Get multiple users by id
router.get('/', async (req, res) => {
  const ids = req.body.ids.map((id) => monk.id(id));
  const members = await users.find({ _id: { $in: ids } });

  res.json(members);
});

// Create user
router.post('/', async (req, res) => {
  const id = monk.id();
  const user = {
    _id: id,
    id: id.toString(),
    name: req.body.name,
    image_url: req.body.image_url,
  };
  users.insert(user).then(() => {
    res.status(200);
    res.send(id);
  });
});

// Update user
router.post('/:id', async (req, res, next) => {
  let id;
  try {
    id = monk.id(req.params.id);
  } catch (err) {
    res.status(404);
    next(err);
    return;
  }
  const data = { name: req.body.name, image_url: req.body.image_url };
  users.update({ _id: id }, { $set: data })
    .then(() => {
      res.status(200);
      res.send();
    })
    .catch((err) => {
      next(err);
    });
});

router.post('/:id/authoriseWithSpotify', async (req, res, next) => {
  const { code } = req.body;
  const { id } = req.params;

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
      console.log(`ERROR: ${JSON.stringify(error)}`);
      next(error.response.status);
    });
  // eslint-disable-next-line camelcase
  const expires_at = new Date().getTime() + (expires_in * 1000);
  users.update({ _id: monk.id(id) }, {
    $set: {
      host: true,
      access_token,
      refresh_token,
      expires_at,
    },
  }).then(() => res.send())
    .catch(next);
});

module.exports = router;

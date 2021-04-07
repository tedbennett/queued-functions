const router = require('express').Router();
const axios = require('axios');
const { checkAuth } = require('../middleware');
require('dotenv').config();

const getSpotifyCredentials = async (req, res, next) => {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
  params.append('client_secret', process.env.SPOTIFY_SECRET);

  const header = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

  const response = await axios.post('https://accounts.spotify.com/api/token', params, header);
  if (response?.data?.access_token) {
    req.token = response.data.access_token;
    next();
  } else {
    res.status(500).send('Spotify authorisation error');
  }
};

const parseSongs = (data) => {
  if (data.items === undefined) return [];
  return data.items.map((track) => ({
    id: track.uri,
    name: track.name,
    album: track.album.name,
    artist: track.artists[0].name,
    image_url: track.album.images[0].url,
  }));
};

router.get('/', checkAuth, getSpotifyCredentials, async (req, res) => {
  const { query } = req.query;
  const { token } = req;
  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`;

  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  axios.get(url, params)
    .then((tracks) => res.send(parseSongs(tracks.data.tracks)));
});

module.exports = router;

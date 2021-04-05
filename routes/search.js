const router = require('express').Router();
const axios = require('axios');

require('dotenv').config();

const spotifyCredentials = async () => {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', '1e6ef0ef377c443e8ebf714b5b77cad7');
  params.append('client_secret', process.env.SPOTIFY_SECRET);

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

router.get('/', async (req, res) => {
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

module.exports = router;

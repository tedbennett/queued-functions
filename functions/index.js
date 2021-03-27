const functions = require('firebase-functions');
const axios = require('axios');
const admin = require('firebase-admin');

admin.initializeApp();

exports.addSongToQueue = functions.https.onCall(async (data) => {
  functions.logger.info('Adding song to queue!', { structuredData: true });

  const { sessionId, songUri } = data;

  const session = await admin.firestore().collection('sessions').doc(sessionId).get()
    .then((doc) => {
      if (doc.exists) {
        return doc.data();
      }
      return undefined;
    });
  if (session === undefined) {
    return false;
  }
  const { token } = session;

  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const response = await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${songUri}`, {}, headers)
    .then((res) => res);

  return response.status === 200;
});

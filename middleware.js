const db = require('./database');

const sessions = db.get('sessions');
const users = db.get('users');

// Check whether the user token exists in the db
const checkAuth = async (req, res, next) => {
  const userId = req.body.user_id;
  const user = await users.findOne({ id: userId });
  if (!user) {
    res.status(403).send('Unauthorised');
  } else {
    req.user = user;
    next();
  }
};

// Check whether the user resource exists
const userExists = async (req, res, next) => {
  const { userId } = req.params;
  const user = await users.findOne({ id: userId });
  if (!user) {
    res.status(404).send({ error: 'User not found' });
  } else {
    req.user = user;
    next();
  }
};

// Check whether the session resource exists
const sessionExists = async (req, res, next) => {
  const { sessionId } = req.params;
  const session = await sessions.findOne({ id: sessionId });
  if (!session) {
    res.status(404).send({ error: 'Session not found' });
  } else {
    req.session = session;
    next();
  }
};

module.exports = { sessionExists, userExists, checkAuth };

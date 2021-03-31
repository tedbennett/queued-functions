require('dotenv').config();
module.exports = require('monk')(process.env.MONGO_URI);

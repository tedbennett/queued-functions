const pingmydyno = require('pingmydyno');
const app = require('./app');

require('dotenv').config();

const port = process.env.PORT || 5000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening at http://localhost:${port}`);
  pingmydyno('https://queued1.herokuapp.com');
});

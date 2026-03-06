require('dotenv').config();
const app = require('./config/app');
const { port } = require('./config/env');

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});

const express = require('express');
const cors = require('cors');
const { corsOptions } = require('./cors');
const apiRouter = require('../routes');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRouter);
app.use(errorHandler);

module.exports = app;

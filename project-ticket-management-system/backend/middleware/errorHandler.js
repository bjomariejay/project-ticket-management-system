const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error' });
};

module.exports = { errorHandler };

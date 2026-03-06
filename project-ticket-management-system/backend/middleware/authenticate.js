const { verifyToken } = require('../utils/token');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization header' });
  }

  const token = authHeader.substring('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    console.error('Invalid token', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { authenticate };

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const padTicketNumber = (value) => value.toString().padStart(4, '0');

module.exports = { asyncHandler, padTicketNumber };

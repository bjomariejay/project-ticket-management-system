const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const toNumberOrNull = (value) => (value == null ? null : Number(value));

const logTicketWork = async ({ client = null, ticketRow, userId = null, actualHours = null }) => {
  if (!ticketRow) {
    throw new Error('ticketRow is required to log ticket work');
  }

  const runner = client && typeof client.query === 'function' ? client : { query };
  const exec = runner.query.bind(runner);
 console.log(actualHours , ticketRow.actual_hours)
  await exec(
    `INSERT INTO ticket_work_logs (
        id,
        ticket_number,
        user_id,
        spend_time
      ) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), ticketRow.ticket_number, userId, toNumberOrNull(actualHours ?? ticketRow.actual_hours)]
  );
};

module.exports = { logTicketWork };

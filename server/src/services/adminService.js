import { pool } from "../db/pool.js";

export async function logCancellation(bookingId, start, end, reason) {
  const displayFrom = new Date(start.getTime() - 5 * 60 * 1000);
  const displayTo = new Date(end.getTime() - 10 * 60 * 1000);
  await pool.query(
    `INSERT INTO recent_cancellations
       (booking_id, original_start, original_end, display_from, display_to, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [bookingId, start, end, displayFrom, displayTo, reason]
  );
}

// server/src/services/scheduler.js
import cron from "node-cron";
import { pool } from "../db/pool.js";
import nodemailer from "nodemailer";

export function startScheduler() {
  console.log("⏰ Scheduler started…");

  // run every 1 minute
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

    await sendReminders(oneHourLater);
    await handleCutoffCancellations(fiveMinutesLater);
  });
}

/* -----------------------------------------------------------
   1️⃣  Send 1-hour-before reminders
----------------------------------------------------------- */
async function sendReminders(oneHourLater) {
  const client = await pool.connect();
  try {
    const upcoming = await client.query(
      `SELECT b.id, b.start_time, b.end_time, c.name AS court_name,
              array_agg(p.email) AS emails
         FROM bookings b
         JOIN courts c ON b.court_id=c.id
         JOIN booking_participants p ON p.booking_id=b.id
        WHERE b.status='confirmed'
          AND b.start_time BETWEEN $1 AND $2
        GROUP BY b.id, c.name`,
      [oneHourLater, new Date(oneHourLater.getTime() + 60 * 1000)]
    );
    if (upcoming.rowCount === 0) return;

    const mailer = makeTransporter();
    for (const b of upcoming.rows) {
      const text = `Reminder: Your court booking for ${b.court_name} starts at ${new Date(
        b.start_time
      ).toLocaleTimeString()}.
Please reach the venue 10 min early.`;
      await mailer.sendMail({
        from: process.env.MAIL_FROM,
        to: b.emails,
        subject: "🏸 Booking Reminder",
        text,
      });
    }
  } catch (err) {
    console.error("Reminder error:", err.message);
  } finally {
    client.release();
  }
}

/* -----------------------------------------------------------
   2️⃣  Auto-cancel at pre-start cutoff (start − 5 min)
----------------------------------------------------------- */
async function handleCutoffCancellations(fiveMinutesLater) {
  const client = await pool.connect();
  try {
    const due = await client.query(
      `SELECT b.id, b.court_id, b.start_time, b.end_time, c.name AS court_name
         FROM bookings b
         JOIN courts c ON b.court_id=c.id
        WHERE b.status='pending'
          AND b.start_time <= $1`,
      [fiveMinutesLater]
    );
    if (due.rowCount === 0) return;

    const mailer = makeTransporter();
    for (const b of due.rows) {
      // find pending participants
      const pend = await client.query(
        `SELECT email FROM booking_participants
          WHERE booking_id=$1 AND status='pending'`,
        [b.id]
      );

      // mark cancelled
      await client.query(
        `UPDATE bookings SET status='auto-cancelled', updated_at=now()
           WHERE id=$1`,
        [b.id]
      );

      // insert recent_cancellation window
      const displayFrom = new Date(b.start_time.getTime() - 5 * 60 * 1000);
      const displayTo = new Date(b.end_time.getTime() - 10 * 60 * 1000);
      await client.query(
        `INSERT INTO recent_cancellations
           (booking_id, original_start, original_end, display_from, display_to, reason)
         VALUES ($1,$2,$3,$4,$5,'Cutoff auto-cancel')`,
        [b.id, b.start_time, b.end_time, displayFrom, displayTo]
      );

      // send emails
      const text = `Your booking for ${b.court_name} at ${new Date(
        b.start_time
      ).toLocaleTimeString()} was auto-cancelled because one or more participants did not confirm in time.`;
      await mailer.sendMail({
        from: process.env.MAIL_FROM,
        to: pend.rows.map((r) => r.email),
        subject: "❌ Booking Auto-Cancelled",
        text,
      });
    }
  } catch (err) {
    console.error("Cutoff cancellation error:", err.message);
  } finally {
    client.release();
  }
}

/* -----------------------------------------------------------
   Helper — Nodemailer transporter
----------------------------------------------------------- */
function makeTransporter() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
}

// ---------- Scheduler Service ----------
// Runs periodic reminder + cutoff cancellation tasks
// v2.0 — cleaned, timezone-correct, idempotent

import cron from "node-cron";
import { pool } from "../db/pool.js";
import nodemailer from "nodemailer";

/* -----------------------------------------------------------
   🚀 Start Scheduler
----------------------------------------------------------- */
export function startScheduler() {
  console.log("⏰ Scheduler started (every 1 min, IST)…");

  // Run every minute (Asia/Kolkata)
  cron.schedule(
    "* * * * *",
    async () => {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

      await sendReminders(oneHourLater);
      await handleCutoffCancellations(fiveMinutesLater);
    },
    { timezone: "Asia/Kolkata" }
  );
}

/* -----------------------------------------------------------
   1️⃣  Send 1-hour-before reminders 
----------------------------------------------------------- */
async function sendReminders(oneHourLater) {
  const client = await pool.connect();
  try {
    const from = new Date(oneHourLater.getTime() - 5 * 60 * 1000);
    const to = new Date(oneHourLater.getTime() + 5 * 60 * 1000);
    const mailer = makeTransporter();

    /* ---------------------------------------------
       1️⃣ Confirmed Bookings — Normal Reminder
    --------------------------------------------- */
    const confirmed = await client.query(
      `SELECT b.id, b.start_time, b.end_time, c.name AS court_name,
              array_agg(p.email) AS emails
         FROM bookings b
         JOIN courts c ON b.court_id = c.id
         JOIN booking_participants p 
           ON p.booking_id = b.id AND p.status = 'confirmed'
        WHERE b.status = 'confirmed'
          AND b.reminder_sent = false
          AND b.start_time >= $1 AND b.start_time < $2
        GROUP BY b.id, c.name`,
      [from, to]
    );

    for (const b of confirmed.rows) {
      if (!b.emails || b.emails.length === 0) continue;

      const humanStart = new Date(b.start_time).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      });

      const text = `Reminder: Your court booking for ${b.court_name} starts at ${humanStart}.
Please reach the venue 10 minutes early.`;

      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: b.emails,
          subject: "🏸 Booking Reminder",
          text,
        });
        await client.query(
          `UPDATE bookings SET reminder_sent = true WHERE id = $1`,
          [b.id]
        );
        console.log(`📧 Reminder sent for booking ${b.id}`);
      } catch (e) {
        console.error(`❌ Reminder send failed for ${b.id}:`, e.message);
      }
    }

    /* ---------------------------------------------
       2️⃣ Pending Bookings — “Still Pending” Notice
    --------------------------------------------- */
    const pending = await client.query(
      `SELECT b.id, b.start_time, b.end_time, c.name AS court_name,
              array_agg(bp.email) AS emails
         FROM bookings b
         JOIN courts c ON b.court_id = c.id
         JOIN booking_participants bp ON bp.booking_id = b.id
        WHERE b.status = 'pending'
          AND b.start_time >= $1 AND b.start_time < $2
        GROUP BY b.id, c.name`,
      [from, to]
    );

    for (const b of pending.rows) {
      if (!b.emails || b.emails.length === 0) continue;

      const humanStart = new Date(b.start_time).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      });

      const text = `⚠️ Your booking for ${b.court_name} at ${humanStart} is still pending.
Not all participants have confirmed yet. 

Please remind them to confirm soon, otherwise this booking will be automatically cancelled 5 minutes before the start time.`;

      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: b.emails,
          subject: "⚠️ Booking Still Pending Confirmation",
          text,
        });
        console.log(`📧 Pending reminder sent for booking ${b.id}`);
      } catch (e) {
        console.error(`❌ Pending reminder failed for ${b.id}:`, e.message);
      }
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
         JOIN courts c ON b.court_id = c.id
        WHERE b.status='pending'
          AND b.start_time <= $1`,
      [fiveMinutesLater]
    );

    if (due.rowCount === 0) return;

    const mailer = makeTransporter();

    for (const b of due.rows) {
      // Find still-pending participants
      const pend = await client.query(
        `SELECT email FROM booking_participants
          WHERE booking_id=$1 AND status='pending'`,
        [b.id]
      );

      // Mark booking cancelled
      await client.query(
        `UPDATE bookings SET status='auto-cancelled', updated_at=now()
           WHERE id=$1`,
        [b.id]
      );

      // Insert into recent_cancellations window
      const displayFrom = new Date(b.start_time.getTime() - 5 * 60 * 1000);
      const displayTo = new Date(b.end_time.getTime() - 10 * 60 * 1000);

      await client.query(
        `INSERT INTO recent_cancellations
           (booking_id, original_start, original_end, display_from, display_to, reason)
         VALUES ($1,$2,$3,$4,$5,'Cutoff auto-cancel')`,
        [b.id, b.start_time, b.end_time, displayFrom, displayTo]
      );

      // Send emails to pending participants
      if (pend.rowCount > 0) {
        const humanStart = new Date(b.start_time).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        });
        const text = `Your booking for ${b.court_name} at ${humanStart} was auto-cancelled because one or more participants did not confirm in time.`;

        try {
          await mailer.sendMail({
            from: process.env.MAIL_FROM,
            to: pend.rows.map((r) => r.email),
            subject: "❌ Booking Auto-Cancelled",
            text,
          });
          console.log(`🚫 Auto-cancelled booking ${b.id}`);
        } catch (e) {
          console.error("Auto-cancel email error:", e.message);
        }
      }
    }
  } catch (err) {
    console.error("Cutoff cancellation error:", err.message);
  } finally {
    client.release();
  }
}

/* -----------------------------------------------------------
   Helper — Nodemailer Transporter
----------------------------------------------------------- */
function makeTransporter() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
}

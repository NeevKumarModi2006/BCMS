// server/src/routes/adminBookings.js
import express from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import nodemailer from "nodemailer";

const router = express.Router();

/* -----------------------------------------------------------
   1️⃣ GET /api/admin/bookings?mode=default|explicit
----------------------------------------------------------- */
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const mode = req.query.mode || "default";
    const adminId = req.user.id;

    let query;
    const params = [adminId];

    if (mode === "current") {
      // 🕒 Current Bookings (±1 hour)
      query = `
        SELECT b.id, b.court_id, c.name AS court_name,
               b.start_time, b.end_time, b.status,
               u.email AS creator_email
          FROM bookings b
          JOIN courts c ON c.id=b.court_id
          JOIN users u ON u.id=b.creator_id
         WHERE b.creator_id <> $1
           AND b.start_time <= now() + interval '1 hour'
           AND b.end_time >= now() - interval '1 hour'
         ORDER BY b.start_time ASC
         LIMIT 100;
      `;
    } else if (mode === "explicit") {
      // 🗂️ All Bookings
      query = `
        SELECT b.id, b.court_id, c.name AS court_name,
               b.start_time, b.end_time, b.status,
               u.email AS creator_email
          FROM bookings b
          JOIN courts c ON c.id=b.court_id
          JOIN users u ON u.id=b.creator_id
         WHERE b.creator_id <> $1
         ORDER BY b.start_time DESC
         LIMIT 200;
      `;
    } else {
      // ⏩ Default (Upcoming & Cancelable)
      query = `
        SELECT b.id, b.court_id, c.name AS court_name,
               b.start_time, b.end_time, b.status,
               u.email AS creator_email
          FROM bookings b
          JOIN courts c ON c.id=b.court_id
          JOIN users u ON u.id=b.creator_id
         WHERE b.creator_id <> $1
           AND b.status NOT IN ('cancelled','auto-cancelled')
           AND b.start_time >= now() + interval '1 hour'
         ORDER BY b.start_time ASC
         LIMIT 100;
      `;
    }

    const { rows } = await pool.query(query, params);
    res.json({ items: rows });
  } catch (err) {
    console.error("Admin fetch bookings error:", err);
    next(err);
  }
});

/* -----------------------------------------------------------
   2️⃣ GET /api/admin/bookings/:id/participants
   → Show ALL participants (user_id + email)
----------------------------------------------------------- */
router.get("/:id/participants", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const q = `
      SELECT DISTINCT COALESCE(u.email, bp.email) AS email
      FROM booking_participants bp
      LEFT JOIN users u ON u.id = bp.user_id
      WHERE bp.booking_id = $1
      ORDER BY email ASC;
    `;
    const { rows } = await pool.query(q, [id]);
    res.json({ participants: rows });
  } catch (err) {
    console.error("Admin fetch participants error:", err);
    next(err);
  }
});

/* -----------------------------------------------------------
   3️⃣ POST /api/admin/bookings/:id/cancel
   → Cancel booking + notify all (creator + participants)
----------------------------------------------------------- */
router.post("/:id/cancel", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // 🔍 Fetch booking info
    const bRes = await client.query(
      `
      SELECT b.id, b.start_time, b.end_time, b.status,
             c.name AS court_name, u.email AS creator_email
        FROM bookings b
        JOIN courts c ON c.id=b.court_id
        JOIN users u ON u.id=b.creator_id
       WHERE b.id=$1
      `,
      [id]
    );

    if (bRes.rowCount === 0)
      return res.status(404).json({ error: "Booking not found." });

    const booking = bRes.rows[0];
    const now = new Date();
    const start = new Date(booking.start_time);

    if (["cancelled", "auto-cancelled"].includes(booking.status))
      return res.status(400).json({ error: "Booking already cancelled." });

    if (start.getTime() - now.getTime() < 60 * 60 * 1000)
      return res
        .status(400)
        .json({ error: "Cannot cancel within 1 hour of start time." });

    await client.query("BEGIN");

    // 🚫 Update booking
    await client.query(
      `UPDATE bookings SET status='cancelled', updated_at=now() WHERE id=$1`,
      [id]
    );

    // 🗓️ Log cancellation (for banner display)
    await client.query(
      `
      INSERT INTO recent_cancellations
        (booking_id, original_start, original_end, display_from, display_to, reason)
      VALUES ($1,$2,$3,now(),now()+interval '15 minutes','Admin cancelled')
      `,
      [id, booking.start_time, booking.end_time]
    );

    // 👥 Collect all participant emails + creator
    const pRes = await client.query(
      `
      SELECT DISTINCT COALESCE(u.email, bp.email) AS email
      FROM booking_participants bp
      LEFT JOIN users u ON u.id = bp.user_id
      WHERE bp.booking_id = $1;
      `,
      [id]
    );

    const emails = [
      booking.creator_email,
      ...pRes.rows.map((r) => r.email),
    ].filter(Boolean);
    const uniqueEmails = [...new Set(emails)];

    await client.query("COMMIT");

    // 📧 Send emails outside transaction
    if (uniqueEmails.length > 0) {
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
        tls: { rejectUnauthorized: false },
      });

      const subject = "🏸 Booking Cancelled by Admin";
      const text = (court, startTime, endTime) => `
Dear Player,

Your badminton court booking has been cancelled by an administrator.

Court: ${court}
Start: ${new Date(startTime).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })}
End: ${new Date(endTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

We apologize for the inconvenience.

— Badminton Court Management System
`;

      for (const email of uniqueEmails) {
        try {
          await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: email,
            subject,
            text: text(
              booking.court_name,
              booking.start_time,
              booking.end_time
            ),
          });
          console.log(`📨 Mail sent to ${email}`);
        } catch (mailErr) {
          console.error(
            `❌ Failed to send email to ${email}:`,
            mailErr.message
          );
        }
      }
    }

    res.json({
      ok: true,
      message: "Booking cancelled successfully. All participants notified.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Admin cancel error:", err.message);
    res.status(500).json({ error: "Failed to cancel booking." });
  } finally {
    client.release();
  }
});

export default router;

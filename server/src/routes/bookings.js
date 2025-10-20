import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const router = express.Router();

// 🕐 Local date helper
function localDateFromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/* -----------------------------------------------------------
   1️⃣  GET /bookings/suggest → suggest slots (block-aware)
----------------------------------------------------------- */
router.get("/suggest", requireAuth, async (req, res) => {
  try {
    const { date, participants, window, duration: durationParam } = req.query;
    if (!date) return res.status(400).json({ error: "Date required" });

    const today = localDateFromYMD(new Date().toISOString().slice(0, 10));
    const requested = localDateFromYMD(date);
    const diffDays = Math.round((requested - today) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays > 2) {
      return res.status(400).json({
        error:
          "You can only book for today, tomorrow, or the day after tomorrow.",
      });
    }

    const pCount = parseInt(participants || 2);
    let duration;
    if (pCount === 2) duration = durationParam === "15" ? 15 : 30;
    else if (pCount === 3) duration = 45;
    else duration = 60;

    const day = requested.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = day === 0 || day === 6;

    let windowStart, windowEnd, lot;
    if (window === "morning") {
      windowStart = "06:00";
      windowEnd = isWeekend ? "11:00" : "09:00";
      lot = "morning";
    } else if (window === "evening") {
      windowStart = "16:00";
      windowEnd = "22:00";
      lot = "evening";
    } else {
      // full = both lots
      lot = null;
    }

    const available = [];
    const courts = await pool.query(
      "SELECT * FROM courts WHERE is_active=true ORDER BY id"
    );

    for (const court of courts.rows) {
      // 🧱 Block check: skip blocked courts for that date & lot
      const blockQuery = await pool.query(
        `SELECT 1 FROM blocks
         WHERE court_id=$1
           AND $2::date BETWEEN start_date AND end_date
           AND ($3::text IS NULL OR lot=$3)`,
        [court.id, date, lot]
      );
      if (blockQuery.rowCount > 0) continue; // skip blocked court/time window

      // existing busy slots
      const busy = await pool.query(
        `SELECT start_time, end_time FROM bookings 
         WHERE court_id=$1 AND DATE(start_time)=$2
           AND status IN ('pending','confirmed','auto-cancelled')`,
        [court.id, date]
      );

      const generateSlots = (startTime, endTime) => {
        const slots = [];
        let start = localDateFromYMD(date);
        const [sH, sM] = startTime.split(":").map(Number);
        start.setHours(sH, sM, 0, 0);

        const end = localDateFromYMD(date);
        const [eH, eM] = endTime.split(":").map(Number);
        end.setHours(eH, eM, 0, 0);

        while (start.getTime() + duration * 60000 <= end.getTime()) {
          const slotEnd = new Date(start.getTime() + duration * 60000);
          const now = new Date();
          if (start.getTime() < now.getTime() + 60 * 60 * 1000) {
            start = new Date(start.getTime() + 15 * 60000);
            continue;
          }

          const overlap = busy.rows.some(
            (b) =>
              start < new Date(b.end_time) && slotEnd > new Date(b.start_time)
          );
          if (!overlap)
            slots.push({
              id: `${court.id}-${start.toISOString()}`,
              slot_key: `${court.id}-${start.toISOString()}`,
              court_id: court.id,
              court_name: court.name,
              start_time: start.toISOString(),
              end_time: slotEnd.toISOString(),
            });

          start = new Date(start.getTime() + 15 * 60000);
        }
        return slots;
      };

      if (window === "full") {
        const morningEnd = isWeekend ? "11:00" : "09:00";
        available.push(...generateSlots("06:00", morningEnd));
        available.push(...generateSlots("16:00", "22:00"));
      } else {
        available.push(...generateSlots(windowStart, windowEnd));
      }
    }

    res.json({ slots: available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to suggest slots" });
  }
});

/* -----------------------------------------------------------
   2️⃣  POST /bookings → create booking (block-aware)
----------------------------------------------------------- */
router.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      court_id,
      start_time,
      end_time,
      participants,
      emails = [],
    } = req.body;
    const creator = req.user;
    const totalPlayers = parseInt(participants);

    if (totalPlayers < 2 || totalPlayers > 6)
      return res
        .status(400)
        .json({ error: "Participants must be between 2 and 6." });

    // ensure 1 hour in advance
    const now = new Date();
    const start = new Date(start_time);
    if (start.getTime() < now.getTime() + 60 * 60 * 1000)
      return res
        .status(400)
        .json({ error: "Bookings must be made at least 1 hour in advance." });

    // 🧱 Check if court/time falls inside any block
    const dateStr = start_time.slice(0, 10);
    const lot = start.getHours() < 12 ? "morning" : "evening"; // simple mapping
    const blocked = await pool.query(
      `SELECT 1 FROM blocks 
       WHERE court_id=$1 
         AND $2::date BETWEEN start_date AND end_date 
         AND lot=$3`,
      [court_id, dateStr, lot]
    );
    if (blocked.rowCount > 0)
      return res
        .status(400)
        .json({ error: "Court is blocked for that time window." });

    // validate participant emails
    const invalid = emails.filter(
      (e, i, arr) =>
        !e ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ||
        !e.endsWith("nitw.ac.in") ||
        e === creator.email ||
        arr.indexOf(e) !== i
    );
    if (invalid.length)
      return res
        .status(400)
        .json({ error: `Invalid or duplicate emails: ${invalid.join(", ")}` });

    await client.query("BEGIN");

    // overlap
    const overlap = await client.query(
      `SELECT id FROM bookings 
       WHERE court_id=$1 
       AND status IN ('pending','confirmed','auto-cancelled')
       AND NOT (end_time <= $2 OR start_time >= $3)`,
      [court_id, start_time, end_time]
    );
    if (overlap.rowCount > 0) throw new Error("Slot already taken");

    // collect users
    const foundUsers = [];
    for (const email of emails) {
      const u = await client.query("SELECT * FROM users WHERE email=$1", [
        email,
      ]);
      if (u.rowCount === 0)
        throw new Error(`Participant ${email} is not a registered user.`);
      foundUsers.push(u.rows[0]);
    }

    // bans, cooldowns, etc.
    for (const user of foundUsers) {
      if (user.is_banned)
        return res.status(403).json({ error: `${user.email} is banned.` });

      const freq = await client.query(
        `SELECT start_time FROM bookings b
         JOIN booking_participants p ON p.booking_id=b.id
         WHERE p.user_id=$1 AND b.status IN ('confirmed','auto-cancelled')
         ORDER BY start_time DESC LIMIT 1`,
        [user.id]
      );
      if (freq.rowCount) {
        const last = new Date(freq.rows[0].start_time);
        const days =
          user.play_policy === "2d" ? 2 : user.play_policy === "1d" ? 1 : 3;
        const nextAllowed = new Date(last.getTime() + days * 86400000);
        if (now < nextAllowed) {
          const left = Math.ceil((nextAllowed - now) / 86400000);
          return res.status(400).json({
            cooldown: `${user.email} can book again after ${left} day(s).`,
          });
        }
      }

      const clash = await client.query(
        `SELECT 1 FROM bookings b
         JOIN booking_participants p ON p.booking_id=b.id
         WHERE p.user_id=$1 AND b.status IN ('pending','confirmed')
         AND NOT (b.end_time <= $2 OR b.start_time >= $3)
         LIMIT 1`,
        [user.id, start_time, end_time]
      );
      if (clash.rowCount)
        return res
          .status(400)
          .json({ error: `${user.email} already has a booking at that time.` });
    }

    // self frequency
    const selfFreq = await client.query(
      `SELECT start_time FROM bookings b
       JOIN booking_participants p ON p.booking_id=b.id
       WHERE p.user_id=$1 AND b.status IN ('confirmed','auto-cancelled')
       ORDER BY start_time DESC LIMIT 1`,
      [creator.id]
    );
    if (selfFreq.rowCount) {
      const last = new Date(selfFreq.rows[0].start_time);
      const days =
        creator.play_policy === "2d" ? 2 : creator.play_policy === "1d" ? 1 : 3;
      const nextAllowed = new Date(last.getTime() + days * 86400000);
      if (now < nextAllowed) {
        const left = Math.ceil((nextAllowed - now) / 86400000);
        return res
          .status(400)
          .json({ cooldown: `You can book again after ${left} day(s).` });
      }
    }

    // create booking
    const booking = await client.query(
      `INSERT INTO bookings (court_id, creator_id, start_time, end_time, status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING *`,
      [court_id, creator.id, start_time, end_time]
    );
    const bookingId = booking.rows[0].id;

    // add participants
    await client.query(
      `INSERT INTO booking_participants (booking_id, user_id, email, status)
       VALUES ($1,$2,$3,'confirmed')`,
      [bookingId, creator.id, creator.email]
    );

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const user = foundUsers[i];
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, email, status)
         VALUES ($1,$2,$3,'pending')`,
        [bookingId, user.id, email]
      );
    }

    // send confirmation emails (unchanged)
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
    const secret = process.env.APP_SIGNING_SECRET || "tempsecret";
    for (let i = 0; i < emails.length; i++) {
      const token = jwt.sign(
        { bookingId, email: emails[i], type: "confirm" },
        secret,
        { expiresIn: "60m" }
      );
      const backendBase = process.env.API_ORIGIN;
      const confirmUrl = `${backendBase}/bookings/confirm/${token}`;

      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: emails[i],
        subject: "Confirm your Badminton Court Booking",
        text: `Hello,\n\nYou have been added to a court booking.\nPlease confirm within 60 minutes:\n${confirmUrl}\n\n- Badminton Court System`,
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ booking: booking.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ error: "Slot already booked or unavailable." });
    }
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message || "Booking failed" });
  } finally {
    client.release();
  }
});
/* -----------------------------------------------------------
   3️⃣  GET /bookings/confirm/:token → confirm participant
   ✅ Final fix: skip if cancelled/expired, all participants confirm → booking flips
----------------------------------------------------------- */
router.get("/confirm/:token", async (req, res) => {
  const { token } = req.params;
  const client = await pool.connect();

  try {
    const secret = process.env.APP_SIGNING_SECRET || "tempsecret";
    const decoded = jwt.verify(token, secret);
    const bookingId = decoded.bookingId;
    const email = decoded.email.trim().toLowerCase();

    await client.query("BEGIN");

    // 🔍 1️⃣ Check booking status first
    const bookingCheck = await client.query(
      `SELECT status FROM bookings WHERE id=$1`,
      [bookingId]
    );

    if (bookingCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.send(`
        <h2>❌ Invalid Booking</h2>
        <p>This booking no longer exists.</p>
      `);
    }

    const currentStatus = bookingCheck.rows[0].status;
    if (["cancelled", "auto-cancelled"].includes(currentStatus)) {
      await client.query("ROLLBACK");
      return res.send(`
        <h2>⚠️ Booking Cancelled</h2>
        <p>This booking has already been cancelled and cannot be confirmed.</p>
      `);
    }

    // 🔍 2️⃣ Find participant record (case-insensitive)
    const partRes = await client.query(
      `SELECT status FROM booking_participants 
       WHERE booking_id=$1 AND LOWER(email)=$2`,
      [bookingId, email]
    );
    if (partRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.send(`
        <h2>❌ Invalid Link</h2>
        <p>This confirmation link is invalid or expired.</p>
      `);
    }

    if (partRes.rows[0].status === "confirmed") {
      await client.query("ROLLBACK");
      return res.send(`
        <h2>✅ Already Confirmed!</h2>
        <p>Your confirmation was already recorded earlier.</p>
      `);
    }

    // ✅ 3️⃣ Mark this participant confirmed
    await client.query(
      `UPDATE booking_participants 
         SET status='confirmed', confirmed_at=now()
       WHERE booking_id=$1 AND LOWER(email)=$2`,
      [bookingId, email]
    );

    // ✅ 4️⃣ Check if any participants still pending
    const pendingCheck = await client.query(
      `SELECT COUNT(*) FROM booking_participants
       WHERE booking_id=$1 AND status='pending'`,
      [bookingId]
    );
    const pendingCount = parseInt(pendingCheck.rows[0].count, 10);

    // ✅ 5️⃣ If all confirmed and booking still pending, flip to confirmed
    if (pendingCount === 0 && currentStatus === "pending") {
      await client.query(
        `UPDATE bookings 
           SET status='confirmed', updated_at=now()
         WHERE id=$1`,
        [bookingId]
      );
      console.log(`✅ Booking ${bookingId} confirmed (all participants).`);
    } else {
      console.log(
        `⏳ Booking ${bookingId}: ${pendingCount} participant(s) still pending.`
      );
    }

    await client.query("COMMIT");

    // ✅ 6️⃣ Response HTML
    res.send(`
      <h2>✅ Confirmation Successful!</h2>
      <p>Thank you ${email}, your participation has been confirmed.</p>
      ${
        currentStatus === "cancelled" || currentStatus === "auto-cancelled"
          ? `<p>⚠️ However, this booking was cancelled earlier.</p>`
          : pendingCount === 0
          ? `<p>🎉 All participants have confirmed — the booking is now active.</p>`
          : `<p>⏳ Waiting for remaining participant(s) to confirm.</p>`
      }
    `);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Confirm route error:", err.message);
    res.status(400).send(`<h2>❌ Invalid or expired link</h2>`);
  } finally {
    client.release();
  }
});
/* -----------------------------------------------------------
   4️⃣  GET /bookings/mine  →  list user's bookings
----------------------------------------------------------- */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = (
      await pool.query(
        `SELECT b.id, b.court_id, c.name AS court_name,
                b.start_time, b.end_time, b.status, b.created_at
         FROM bookings b
         JOIN courts c ON b.court_id=c.id
         JOIN booking_participants p ON p.booking_id=b.id
         WHERE p.user_id=$1
         ORDER BY b.start_time DESC
         LIMIT 100`,
        [userId]
      )
    ).rows;

    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});
/* -----------------------------------------------------------
   5️⃣  POST /bookings/:id/cancel  →  user cancels a booking
----------------------------------------------------------- */
router.post("/:id/cancel", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    await client.query("BEGIN");

    // 🔒 Ensure user is participant
    const check = await client.query(
      `SELECT b.status, b.start_time, b.end_time 
         FROM bookings b
         JOIN booking_participants p ON p.booking_id=b.id
        WHERE b.id=$1 AND p.user_id=$2`,
      [bookingId, userId]
    );

    if (check.rowCount === 0) throw new Error("Not your booking.");

    const { status, start_time, end_time } = check.rows[0];

    // 🛑 Already cancelled
    if (status === "cancelled" || status === "auto-cancelled")
      throw new Error("Booking is already cancelled.");

    // 🕐 Check 1-hour rule (user can cancel only ≥ 1 hour before start)
    const now = new Date();
    const start = new Date(start_time);
    if (start.getTime() - now.getTime() < 60 * 60 * 1000)
      throw new Error("Cannot cancel within 1 hour of start time.");

    // ✅ Cancel booking
    await client.query(
      `UPDATE bookings SET status='cancelled', updated_at=now() WHERE id=$1`,
      [bookingId]
    );

    // 🗓️ Log cancellation with original start/end times
    await client.query(
      `INSERT INTO recent_cancellations 
         (booking_id, original_start, original_end, display_from, display_to, reason)
       VALUES ($1, $2, $3, now(), now() + interval '15 minutes', 'User cancelled')`,
      [bookingId, start_time, end_time]
    );

    await client.query("COMMIT");
    res.json({ ok: true, message: "Booking cancelled successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* -----------------------------------------------------------
   6️⃣  GET /bookings/cancellations?now=timestamp
       → Return active banners for Book page
----------------------------------------------------------- */
router.get("/cancellations", async (req, res) => {
  try {
    const now = req.query.now ? new Date(req.query.now) : new Date();
    const rows = (
      await pool.query(
        `SELECT rc.id, rc.original_start, rc.original_end, c.name AS court_name
           FROM recent_cancellations rc
           JOIN bookings b ON rc.booking_id=b.id
           JOIN courts c ON b.court_id=c.id
          WHERE $1 BETWEEN rc.display_from AND rc.display_to
          ORDER BY rc.created_at DESC
          LIMIT 10`,
        [now]
      )
    ).rows;

    const banners = rows.map((r) => ({
      message: `⚠️ Slot ${new Date(r.original_start).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}–${new Date(r.original_end).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} at ${r.court_name} was cancelled.`,
    }));

    res.json({ banners });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch cancellations" });
  }
});

export default router;

import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const router = express.Router();

// 🕐 Local date helper (midnight in server's timezone)
function localDateFromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0); // midnight local time
}

/* -----------------------------------------------------------
   1️⃣  GET /bookings/suggest  →  get available continuous slots
----------------------------------------------------------- */
/* -----------------------------------------------------------
   1️⃣  GET /bookings/suggest  →  get available continuous slots
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

    // Duration logic: for 2 participants, allow 15 or 30 min selection
    let duration;
    if (pCount === 2) {
      duration = durationParam === "15" ? 15 : 30; // default to 30 if not specified
    } else if (pCount === 3) {
      duration = 45;
    } else {
      duration = 60; // 4, 5, 6 participants
    }

    // Determine weekday/weekend
    const day = requested.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = day === 0 || day === 6;

    // Time windows based on selection
    let windowStart, windowEnd;

    if (window === "morning") {
      windowStart = "06:00";
      windowEnd = isWeekend ? "11:00" : "09:00";
    } else if (window === "evening") {
      windowStart = "16:00";
      windowEnd = "22:00";
    } else {
      // Full Day = Morning + Evening (skip afternoon gap)
      windowStart = "06:00";
      windowEnd = isWeekend ? "11:00" : "09:00";
    }

    const available = [];

    const courts = await pool.query(
      "SELECT * FROM courts WHERE is_active=true ORDER BY id"
    );

    for (const court of courts.rows) {
      const busy = await pool.query(
        `SELECT start_time, end_time FROM bookings 
         WHERE court_id=$1 AND DATE(start_time)=$2
           AND status IN ('pending','confirmed','auto-cancelled')`,
        [court.id, date]
      );

      // Function to generate slots for a time range
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

          // ⏰ Skip if slot start < now + 1 hour (too soon)
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
        // Full Day = Morning slots + Evening slots (no afternoon)
        const morningEnd = isWeekend ? "11:00" : "09:00";
        available.push(...generateSlots("06:00", morningEnd));
        available.push(...generateSlots("16:00", "22:00"));
      } else {
        // Single time range
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
   2️⃣  POST /bookings  →  create booking with participants
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

    // Check 1 hour in advance first
    const now = new Date();
    const start = new Date(start_time);
    if (start.getTime() < now.getTime() + 60 * 60 * 1000) {
      return res
        .status(400)
        .json({ error: "Bookings must be made at least 1 hour in advance." });
    }

    // 1️⃣ Basic email checks
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

    // 2️⃣ Check court overlap
    const overlap = await client.query(
      `SELECT id FROM bookings 
       WHERE court_id=$1 
       AND status IN ('pending','confirmed','auto-cancelled')
       AND NOT (end_time <= $2 OR start_time >= $3)`,
      [court_id, start_time, end_time]
    );
    if (overlap.rowCount > 0) throw new Error("Slot already taken");

    // 3️⃣ Collect participant users
    const foundUsers = [];
    for (const email of emails) {
      const u = await client.query("SELECT * FROM users WHERE email=$1", [
        email,
      ]);
      if (u.rowCount === 0) {
        throw new Error(`Participant ${email} is not a registered user.`);
      }
      foundUsers.push(u.rows[0]);
    }

    // 4️⃣ Ban + frequency + overlap per user
    for (const user of foundUsers) {
      if (user.is_banned)
        return res.status(403).json({ error: `${user.email} is banned.` });

      // Frequency rule
      const freq = await client.query(
        `SELECT start_time
         FROM bookings b
         JOIN booking_participants p ON p.booking_id=b.id
         WHERE p.user_id=$1 AND b.status IN ('confirmed','auto-cancelled')
         ORDER BY start_time DESC LIMIT 1`,
        [user.id]
      );
      if (freq.rowCount) {
        const last = new Date(freq.rows[0].start_time);
        const now = new Date();
        const days =
          user.play_policy === "2d" ? 2 : user.play_policy === "1d" ? 1 : 3;
        const nextAllowed = new Date(
          last.getTime() + days * 24 * 60 * 60 * 1000
        );
        if (now < nextAllowed) {
          const left = Math.ceil((nextAllowed - now) / (24 * 60 * 60 * 1000));
          return res.status(400).json({
            cooldown: `${user.email} can book again after ${left} day(s).`,
          });
        }
      }

      // Overlap check
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

    // 5️⃣ Frequency check for creator
    const selfFreq = await client.query(
      `SELECT start_time FROM bookings b
       JOIN booking_participants p ON p.booking_id=b.id
       WHERE p.user_id=$1 AND b.status IN ('confirmed','auto-cancelled')
       ORDER BY start_time DESC LIMIT 1`,
      [creator.id]
    );
    if (selfFreq.rowCount) {
      const last = new Date(selfFreq.rows[0].start_time);
      const now = new Date();
      const days =
        creator.play_policy === "2d" ? 2 : creator.play_policy === "1d" ? 1 : 3;
      const nextAllowed = new Date(last.getTime() + days * 24 * 60 * 60 * 1000);
      if (now < nextAllowed) {
        const left = Math.ceil((nextAllowed - now) / (24 * 60 * 60 * 1000));
        return res
          .status(400)
          .json({ cooldown: `You can book again after ${left} day(s).` });
      }
    }

    // 6️⃣ Create booking
    const booking = await client.query(
      `INSERT INTO bookings (court_id, creator_id, start_time, end_time, status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING *`,
      [court_id, creator.id, start_time, end_time]
    );

    const bookingId = booking.rows[0].id;

    // 7️⃣ Add creator (confirmed)
    await client.query(
      `INSERT INTO booking_participants (booking_id, user_id, email, status)
       VALUES ($1,$2,$3,'confirmed')`,
      [bookingId, creator.id, creator.email]
    );

    // 8️⃣ Add invited participants
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const user = foundUsers[i];
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, email, status)
         VALUES ($1,$2,$3,'pending')`,
        [bookingId, user.id, email]
      );
    }

    // 9️⃣ Send confirmation mails (each token = valid 60m)
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
      const confirmUrl = `${process.env.APP_ORIGIN}/bookings/confirm/${token}`;
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
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message || "Booking failed" });
  } finally {
    client.release();
  }
});

/* -----------------------------------------------------------
   3️⃣  GET /bookings/confirm/:token → confirm participant
----------------------------------------------------------- */
router.get("/confirm/:token", async (req, res) => {
  const { token } = req.params;
  const client = await pool.connect();
  try {
    const secret = process.env.APP_SIGNING_SECRET || "tempsecret";
    const decoded = jwt.verify(token, secret);
    const { bookingId, email } = decoded;

    await client.query("BEGIN");

    // verify pending participant
    const part = await client.query(
      `SELECT * FROM booking_participants
       WHERE booking_id=$1 AND email=$2 AND status='pending'`,
      [bookingId, email]
    );
    if (part.rowCount === 0)
      throw new Error("Already confirmed or invalid link.");

    // mark confirmed
    await client.query(
      `UPDATE booking_participants
       SET status='confirmed', confirmed_at=now()
       WHERE booking_id=$1 AND email=$2`,
      [bookingId, email]
    );

    // check if all confirmed
    const pending = await client.query(
      `SELECT COUNT(*) FROM booking_participants
       WHERE booking_id=$1 AND status='pending'`,
      [bookingId]
    );
    if (parseInt(pending.rows[0].count) === 0)
      await client.query(
        `UPDATE bookings SET status='confirmed', updated_at=now()
         WHERE id=$1`,
        [bookingId]
      );
    // 🎯 Send reminder email 1 hour before slot start
    const booking = await client.query(
      `SELECT b.start_time, c.name AS court_name
     FROM bookings b
     JOIN courts c ON b.court_id=c.id
    WHERE b.id=$1`,
      [bookingId]
    );

    if (booking.rowCount) {
      const startTime = new Date(booking.rows[0].start_time);
      const courtName = booking.rows[0].court_name;

      // Fetch all confirmed participant emails
      const confirmed = await client.query(
        `SELECT email FROM booking_participants WHERE booking_id=$1 AND status='confirmed'`,
        [bookingId]
      );
      const recipientEmails = confirmed.rows.map((r) => r.email);

      // Compute delay until 1 hour before start
      const now = new Date();
      const reminderTime = new Date(startTime.getTime() - 60 * 60 * 1000);
      const delay = reminderTime.getTime() - now.getTime();

      if (delay > 0) {
        // Schedule email using setTimeout (simple for now)
        setTimeout(async () => {
          try {
            const transporter = nodemailer.createTransport({
              host: process.env.MAIL_HOST,
              port: process.env.MAIL_PORT,
              auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
              },
            });
            for (const to of recipientEmails) {
              await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to,
                subject: "Reminder: Your Court Booking starts in 1 hour",
                text: `Hello,\n\nThis is a friendly reminder that your badminton court booking at ${courtName} starts at ${startTime.toLocaleTimeString(
                  [],
                  { hour: "2-digit", minute: "2-digit" }
                )}.\n\n- Badminton Court Management System`,
              });
            }
            console.log(`✅ Reminder emails sent for booking ${bookingId}`);
          } catch (mailErr) {
            console.error(`❌ Reminder mail failed:`, mailErr.message);
          }
        }, delay);
      }
    }

    await client.query("COMMIT");
    res.send(`
      <h2>✅ Booking confirmed!</h2>
      <p>Thank you ${email}. All participants confirmed → booking active.</p>
    `);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
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
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    // user must be participant
    const check = await pool.query(
      `SELECT * FROM booking_participants WHERE booking_id=$1 AND user_id=$2`,
      [bookingId, userId]
    );
    if (check.rowCount === 0)
      return res.status(403).json({ error: "Not your booking" });

    await pool.query(
      `UPDATE bookings SET status='cancelled', updated_at=now()
       WHERE id=$1 AND status!='cancelled'`,
      [bookingId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to cancel booking" });
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

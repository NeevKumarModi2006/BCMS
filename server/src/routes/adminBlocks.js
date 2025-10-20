import express from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import nodemailer from "nodemailer";

const router = express.Router();

/* --------------------------------------------
   Helper — Nodemailer Transporter
--------------------------------------------- */
function makeMailer() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
}

/* --------------------------------------------
   GET /admin/blocks → List all blocks
--------------------------------------------- */
router.get("/", requireAdmin, async (_req, res, next) => {
  try {
    const q = `
      SELECT b.id, b.lot, b.start_date, b.end_date, b.reason,
             c.name AS court_name
      FROM blocks b
      JOIN courts c ON c.id = b.court_id
      ORDER BY b.start_date DESC;
    `;
    const { rows } = await pool.query(q);
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------
   POST /admin/blocks → Create multi-court block
--------------------------------------------- */
router.post("/", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { court_ids, lot, start_date, end_date, reason } = req.body;

    if (!court_ids?.length || !lot?.length || !start_date || !end_date)
      return res
        .status(400)
        .json({
          error: "All fields (court, lot, start & end date) are required.",
        });

    // Date validations
    const today = new Date();
    const start = new Date(start_date);
    if (start < new Date(today.toDateString()))
      return res
        .status(400)
        .json({ error: "Start date cannot be before today." });

    const diffDays = Math.ceil(
      (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)
    );
    if (diffDays > 30)
      return res
        .status(400)
        .json({ error: "Blocks can be at most 30 days long." });

    const mailer = makeMailer();
    let totalCancelled = 0;
    await client.query("BEGIN");

    for (const court_id of court_ids) {
      for (const singleLot of lot) {
        // Create block
        const insert = `
          INSERT INTO blocks (court_id, lot, start_date, end_date, reason, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id;
        `;
        const { rows } = await client.query(insert, [
          court_id,
          singleLot,
          start_date,
          end_date,
          reason || null,
          req.user.id,
        ]);

        // Find bookings overlapping this range
        const overlap = await client.query(
          `SELECT b.id, b.start_time, b.end_time, c.name AS court_name,
                  array_agg(p.email) AS participants
             FROM bookings b
             JOIN courts c ON c.id = b.court_id
             JOIN booking_participants p ON p.booking_id = b.id
            WHERE b.court_id = $1
              AND DATE(b.start_time) <= $3
              AND DATE(b.end_time) >= $2
              AND b.status IN ('pending','confirmed')
            GROUP BY b.id, c.name`,
          [court_id, start_date, end_date]
        );

        totalCancelled += overlap.rowCount;

        // Cancel and notify
        for (const b of overlap.rows) {
          await client.query(
            `UPDATE bookings SET status='cancelled', updated_at=now() WHERE id=$1`,
            [b.id]
          );
          await client.query(
            `INSERT INTO recent_cancellations
               (booking_id, original_start, original_end, display_from, display_to, reason)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              b.id,
              b.start_time,
              b.end_time,
              new Date(b.start_time.getTime() - 5 * 60 * 1000),
              new Date(b.end_time.getTime() - 10 * 60 * 1000),
              `Cancelled due to new ${singleLot} block on court ${b.court_name}`,
            ]
          );

          if (b.participants?.length > 0) {
            const text = `Your booking for ${b.court_name} has been cancelled because the court was blocked for ${singleLot} session. We regret the inconvenience.`;
            try {
              await mailer.sendMail({
                from: process.env.MAIL_FROM,
                to: b.participants,
                subject: "🏸 Booking Cancelled — Court Blocked",
                text,
              });
            } catch (e) {
              console.error("Mail error:", e.message);
            }
          }
        }

        // Log creation
        await client.query(
          `INSERT INTO recent_cancellations (booking_id, display_from, display_to, reason)
           VALUES (NULL, now(), now(), $1)`,
          [`Block created on court ${court_id} (${singleLot})`]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, cancelled: totalCancelled });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Block creation error:", err.message);
    next(err);
  } finally {
    client.release();
  }
});

/* --------------------------------------------
   DELETE /admin/blocks/:id → Remove block
--------------------------------------------- */
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM blocks WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

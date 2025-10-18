// server/src/routes/admin.js
import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const router = express.Router();

/* -----------------------------------------------------------
   0️⃣  Utility: day window helpers for blocks
----------------------------------------------------------- */
const DAY = 24 * 60 * 60 * 1000;

// compute [start,end) for morning/evening for a specific date
function lotWindow(dateYMD, lot) {
  const [y, m, d] = dateYMD.split("-").map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dow = base.getDay(); // 0 Sun .. 6 Sat
  const isWeekend = dow === 0 || dow === 6;

  if (lot === "morning") {
    // Morning: 06:00–09:00 (Mon–Fri), 06:00–11:00 (Sat–Sun)
    const start = new Date(base);
    start.setHours(6, 0, 0, 0);
    const end = new Date(base);
    end.setHours(isWeekend ? 11 : 9, 0, 0, 0);
    return [start, end];
  } else {
    // Evening: 16:00–22:00 (all days)
    const start = new Date(base);
    start.setHours(16, 0, 0, 0);
    const end = new Date(base);
    end.setHours(22, 0, 0, 0);
    return [start, end];
  }
}

/* -----------------------------------------------------------
   1️⃣  GET /admin/bookings  → list bookings (now → +3 days)
----------------------------------------------------------- */
router.get("/bookings", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const plus3 = new Date(now.getTime() + 3 * DAY);

    const rows = (
      await pool.query(
        `SELECT b.id, c.name AS court_name, b.start_time, b.end_time,
                u.email AS creator_email, b.status
           FROM bookings b
           JOIN courts c ON b.court_id = c.id
           JOIN users  u ON b.creator_id = u.id
          WHERE b.start_time BETWEEN $1 AND $2
          ORDER BY b.start_time ASC`,
        [now, plus3]
      )
    ).rows;

    res.json({ items: rows });
  } catch (err) {
    console.error("Admin /bookings error:", err.message);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

/* -----------------------------------------------------------
   2️⃣  POST /admin/bookings/:id/cancel → admin cancels
----------------------------------------------------------- */
router.post(
  "/bookings/:id/cancel",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        "SELECT * FROM bookings WHERE id=$1 AND start_time>now()",
        [id]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Cannot cancel past/invalid booking" });
      }
      const b = rows[0];

      await client.query(
        "UPDATE bookings SET status='cancelled', updated_at=now() WHERE id=$1",
        [id]
      );

      const display_from = new Date(
        new Date(b.start_time).getTime() - 5 * 60 * 1000
      );
      const display_to = new Date(
        new Date(b.end_time).getTime() - 10 * 60 * 1000
      );

      await client.query(
        `INSERT INTO recent_cancellations
         (booking_id, original_start, original_end, display_from, display_to, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          b.start_time,
          b.end_time,
          display_from,
          display_to,
          reason || "Admin cancelled",
        ]
      );

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Admin cancel error:", err.message);
      res.status(500).json({ error: "Cancel failed" });
    } finally {
      client.release();
    }
  }
);

/* -----------------------------------------------------------
   3️⃣  GET /admin/users → list users
----------------------------------------------------------- */
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = (
      await pool.query(
        `SELECT id, email, role, play_policy, is_banned, last_login_at
           FROM users
          ORDER BY created_at DESC`
      )
    ).rows;
    res.json({ items: rows });
  } catch (err) {
    console.error("Admin users error:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/* -----------------------------------------------------------
   4️⃣  POST /admin/users/:id/update → ban/unban or policy
----------------------------------------------------------- */
router.post(
  "/users/:id/update",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { play_policy, is_banned } = req.body; // e.g., "3d"/"2d"/"1d", true/false
    try {
      await pool.query(
        `UPDATE users
          SET play_policy = COALESCE($1, play_policy),
              is_banned   = COALESCE($2, is_banned)
        WHERE id=$3`,
        [play_policy, is_banned, id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Admin update user error:", err.message);
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* -----------------------------------------------------------
   5️⃣  GET /admin/audit → recent cancellations/logs
----------------------------------------------------------- */
router.get("/audit", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = (
      await pool.query(
        `SELECT id, booking_id, original_start, original_end, display_from, display_to, reason, created_at
           FROM recent_cancellations
          ORDER BY created_at DESC
          LIMIT 50`
      )
    ).rows;
    res.json({ items: rows });
  } catch (err) {
    console.error("Admin audit error:", err.message);
    res.status(500).json({ error: "Failed to fetch audit" });
  }
});

/* -----------------------------------------------------------
   6️⃣  BLOCKS
   - GET /admin/blocks           → list active blocks
   - POST /admin/blocks          → create block
   - DELETE /admin/blocks/:id    → delete block
----------------------------------------------------------- */

/**
 * Validate block input
 * - court_id required
 * - lot ∈ {'morning','evening'}
 * - start_date <= end_date
 * - end_date ≤ today + 30 days
 */
function validateBlockPayload({ court_id, lot, start_date, end_date }) {
  if (!court_id || !Number.isInteger(Number(court_id))) {
    return "Invalid court_id";
  }
  if (!["morning", "evening"].includes(lot)) {
    return "Invalid lot (morning/evening)";
  }
  if (!start_date || !end_date) {
    return "start_date and end_date are required (YYYY-MM-DD)";
  }
  const s = new Date(start_date);
  const e = new Date(end_date);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return "Invalid date format";
  }
  if (s > e) {
    return "start_date cannot be after end_date";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + 30 * DAY);
  if (e > limit) {
    return "end_date cannot be more than 30 days ahead";
  }
  return null;
}

/**
 * Overlap check: there must not be an existing block
 * date-range overlaps on same court + lot
 */
async function hasBlockOverlap(client, court_id, lot, start_date, end_date) {
  const q = await client.query(
    `SELECT 1
       FROM blocks
      WHERE court_id=$1
        AND lot=$2
        AND NOT (end_date < $3 OR start_date > $4)
      LIMIT 1`,
    [court_id, lot, start_date, end_date]
  );
  return q.rowCount > 0;
}

/* List blocks */
router.get("/blocks", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = (
      await pool.query(
        `SELECT b.id, b.court_id, c.name AS court_name, b.lot, b.start_date, b.end_date, b.reason, b.created_at
           FROM blocks b
           JOIN courts c ON c.id=b.court_id
          ORDER BY b.start_date ASC, b.court_id ASC`
      )
    ).rows;
    res.json({ items: rows });
  } catch (err) {
    console.error("Admin blocks list error:", err.message);
    res.status(500).json({ error: "Failed to fetch blocks" });
  }
});

/* Create block */
router.post("/blocks", requireAuth, requireAdmin, async (req, res) => {
  const { court_id, lot, start_date, end_date, reason } = req.body;
  const err = validateBlockPayload({ court_id, lot, start_date, end_date });
  if (err) return res.status(400).json({ error: err });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // no overlap
    const overlap = await hasBlockOverlap(
      client,
      court_id,
      lot,
      start_date,
      end_date
    );
    if (overlap) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Overlapping block exists" });
    }

    await client.query(
      `INSERT INTO blocks (court_id, lot, start_date, end_date, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [court_id, lot, start_date, end_date, reason || null, req.user.id]
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Admin block create error:", e.message);
    res.status(500).json({ error: "Failed to create block" });
  } finally {
    client.release();
  }
});

/* Delete block */
router.delete("/blocks/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM blocks WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error("Admin block delete error:", e.message);
    res.status(500).json({ error: "Failed to delete block" });
  }
});

// ✅ List all admins
router.get("/admins", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, created_at FROM users WHERE role='admin' ORDER BY created_at ASC"
    );
    res.json({ admins: result.rows });
  } catch (err) {
    console.error("Error fetching admins:", err.message);
    res.status(500).json({ error: "Failed to fetch admin list" });
  }
});

// ✅ Add new admin
router.post("/admins", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // check if exists
    const existing = await pool.query(
      "SELECT id, role FROM users WHERE email=$1",
      [email]
    );

    if (existing.rowCount > 0) {
      if (existing.rows[0].role === "admin") {
        return res.status(400).json({ error: "Already an admin" });
      }
      // promote existing user
      await pool.query("UPDATE users SET role='admin' WHERE email=$1", [email]);
    } else {
      // create new admin record
      await pool.query("INSERT INTO users (email, role) VALUES ($1, 'admin')", [
        email,
      ]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error adding admin:", err.message);
    res.status(500).json({ error: "Failed to add admin" });
  }
});

// ✅ Remove an admin (only if added after requester)
router.delete("/admins/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    const requester = req.user;

    // get all admins ordered by creation time
    const result = await pool.query(
      "SELECT id, email, created_at FROM users WHERE role='admin' ORDER BY created_at ASC"
    );

    const admins = result.rows;
    const requesterIndex = admins.findIndex((a) => a.id === requester.id);
    const targetIndex = admins.findIndex((a) => a.id === targetId);

    if (targetIndex <= requesterIndex) {
      return res
        .status(403)
        .json({ error: "Cannot remove admins added before you." });
    }

    await pool.query("UPDATE users SET role='user' WHERE id=$1", [targetId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error removing admin:", err.message);
    res.status(500).json({ error: "Failed to remove admin" });
  }
});
// ✅ Admin Dashboard Stats Summary
// ✅ Admin Dashboard Stats Summary (filtered + meaningful)
router.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        -- count only normal, non-banned users
        (SELECT COUNT(*)::int FROM users WHERE role='user' AND is_banned=false) AS users,
        -- count only active (pending/confirmed) bookings that haven't started yet
        (SELECT COUNT(*)::int FROM bookings
           WHERE status IN ('pending','confirmed')
             AND start_time >= now()) AS bookings,
        -- count blocks that are still active
        (SELECT COUNT(*)::int FROM blocks
           WHERE end_date >= CURRENT_DATE) AS blocks,
        -- count recent cancellations in the past 7 days
        (SELECT COUNT(*)::int FROM recent_cancellations
           WHERE created_at >= now() - interval '7 days') AS audits
    `);

    res.json(rows[0] || { users: 0, bookings: 0, blocks: 0, audits: 0 });
  } catch (err) {
    console.error("Admin stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;

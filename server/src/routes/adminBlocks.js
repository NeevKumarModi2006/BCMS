// server/src/routes/adminBlocks.js
import express from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* --------------------------------------------
   GET /admin/blocks  → list all active blocks
--------------------------------------------- */
router.get("/", requireAdmin, async (req, res, next) => {
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
  } catch (err) { next(err); }
});

/* --------------------------------------------
   POST /admin/blocks  → create a block
--------------------------------------------- */
router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const { court_id, lot, start_date, end_date, reason } = req.body;

    if (!court_id || !lot || !start_date || !end_date)
      return res.status(400).json({ error: "All fields except reason are required" });

    // Validate date range: ≤30 days ahead
    const diffDays = Math.ceil(
      (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)
    );
    if (diffDays > 30)
      return res.status(400).json({ error: "Blocks can be at most 30 days long." });

    const insert = `
      INSERT INTO blocks (court_id, lot, start_date, end_date, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    const vals = [court_id, lot, start_date, end_date, reason || null, req.user.id];
    const { rows } = await pool.query(insert, vals);

    // Log in recent_cancellations for audit
    await pool.query(
      `INSERT INTO recent_cancellations (booking_id, display_from, display_to, reason)
       VALUES (NULL, now(), now(), $1)`,
      [`Block created on court ${court_id} (${lot})`]
    );

    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Duplicate or overlapping block." });
    next(err);
  }
});

/* --------------------------------------------
   DELETE /admin/blocks/:id → remove block
--------------------------------------------- */
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM blocks WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;

import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/* Get all courts */
router.get("/courts", requireAuth, async (req, res) => {
  try {
    const rows = (await pool.query("SELECT * FROM courts WHERE is_active=true ORDER BY id")).rows;
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load courts" });
  }
});

/* Block lots */
router.post("/blocks", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Not authorized" });

    const { court_id, lot, start_date, end_date, reason } = req.body;
    if (!court_id || !start_date || !end_date)
      return res.status(400).json({ error: "Missing fields" });

    // validate 1-month rule
    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays > 31) return res.status(400).json({ error: "Cannot block more than 1 month" });

    await pool.query(
      `INSERT INTO blocks (court_id, lot, start_date, end_date, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [court_id, lot, start_date, end_date, reason || "Not specified", req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create block" });
  }
});

export default router;

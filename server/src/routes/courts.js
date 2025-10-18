// server/src/routes/courts.js
import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

/**
 * @route   GET /api/courts
 * @desc    Returns all active courts (for booking dropdowns, admin blocks, etc.)
 * @access  Public (safe metadata only)
 */
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM courts WHERE is_active = true ORDER BY id"
    );

    res.json({ items: result.rows });
  } catch (err) {
    console.error("Error fetching courts:", err.message);
    res.status(500).json({ error: "Failed to load courts list" });
  }
});

export default router;

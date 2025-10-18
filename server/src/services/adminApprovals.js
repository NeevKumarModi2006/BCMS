export const placeholder = () => "Service ready";
// server/src/routes/adminApprovals.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import jwt from "jsonwebtoken";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/* -----------------------------------------------------------
   GET /admin/approvals → list pending requests
----------------------------------------------------------- */
router.get("/approvals", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = (
      await pool.query(
        `SELECT a.id, a.requester_user_id, u.email, a.status, a.created_at, a.expires_at, a.approved_at
           FROM admin_approvals a
           JOIN users u ON u.id=a.requester_user_id
          WHERE a.status='pending'
          ORDER BY a.created_at ASC`
      )
    ).rows;
    res.json({ items: rows });
  } catch (e) {
    console.error("Approvals list error:", e.message);
    res.status(500).json({ error: "Failed to fetch approvals" });
  }
});

/* -----------------------------------------------------------
   POST /admin/approvals/:id/approve  → click-in-app approval
----------------------------------------------------------- */
router.post("/approvals/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM admin_approvals WHERE id=$1 FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found" });
    }
    const a = rows[0];
    if (a.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Already processed/expired" });
    }
    if (a.expires_at && new Date(a.expires_at) < new Date()) {
      await client.query(
        `UPDATE admin_approvals SET status='expired' WHERE id=$1`,
        [id]
      );
      await client.query("COMMIT");
      return res.status(400).json({ error: "Request expired" });
    }

    // promote user
    await client.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.requester_user_id]);

    // mark this approval approved; auto-expire others of same requester
    await client.query(
      `UPDATE admin_approvals
          SET status='approved', approved_at=now()
        WHERE id=$1`,
      [id]
    );
    await client.query(
      `UPDATE admin_approvals
          SET status='expired'
        WHERE requester_user_id=$1 AND status='pending' AND id<>$2`,
      [a.requester_user_id, id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Approval approve error:", e.message);
    res.status(500).json({ error: "Failed to approve" });
  } finally {
    client.release();
  }
});

/* -----------------------------------------------------------
   POST /admin/approvals/:id/reject  → reject in-app
----------------------------------------------------------- */
router.post("/approvals/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE admin_approvals SET status='expired' WHERE id=$1 AND status='pending'`,
      [id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("Approval reject error:", e.message);
    res.status(500).json({ error: "Failed to reject" });
  }
});

/* -----------------------------------------------------------
   GET /admin/approvals/approve/:token  → email-link approval
----------------------------------------------------------- */
router.get("/approvals/approve/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const decoded = jwt.verify(token, process.env.APP_SIGNING_SECRET);
    const { approvalId } = decoded;
    // reuse approve logic via DB only (no auth)
    const { rowCount } = await pool.query(
      `UPDATE admin_approvals
          SET status='approved', approved_at=now()
        WHERE id=$1 AND status='pending' AND (expires_at IS NULL OR expires_at>now())`,
      [approvalId]
    );
    if (!rowCount) return res.status(400).send("<h3>Invalid or expired link.</h3>");

    // fetch requester to promote
    const a = (await pool.query(`SELECT requester_user_id FROM admin_approvals WHERE id=$1`, [approvalId])).rows[0];
    await pool.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.requester_user_id]);

    // expire others for same requester
    await pool.query(
      `UPDATE admin_approvals
          SET status='expired'
        WHERE requester_user_id=$1 AND status='pending' AND id<>$2`,
      [a.requester_user_id, approvalId]
    );

    res.send("<h3>✅ Approval successful. User promoted to Admin.</h3>");
  } catch (e) {
    console.error("Approval via token error:", e.message);
    res.status(400).send("<h3>Invalid or expired token.</h3>");
  }
});

export default router;

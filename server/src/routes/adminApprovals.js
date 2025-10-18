import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const router = express.Router();

/* -----------------------------------------------------------
   1️⃣ POST /admin/requests  →  create new admin request
----------------------------------------------------------- */
router.post("/requests", requireAuth, async (req, res) => {
  const user = req.user;
  const client = await pool.connect();
  try {
    if (user.role === "admin")
      return res.status(400).json({ message: "You are already an admin." });

    await client.query("BEGIN");

    // 1️⃣ Create admin_approvals row
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const approval = await client.query(
      `INSERT INTO admin_approvals (requester_user_id, status, created_at, expires_at)
       VALUES ($1,'pending',now(),$2)
       RETURNING id`,
      [user.id, expiresAt]
    );

    // 2️⃣ Get all existing admins
    const admins = await client.query(`SELECT email FROM users WHERE role='admin'`);
    if (admins.rowCount === 0)
      return res.status(400).json({ message: "No admins yet. Ask developer to seed first admin." });

    // 3️⃣ Send emails with signed tokens
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });

    for (const a of admins.rows) {
      const token = jwt.sign(
        { approvalId: approval.rows[0].id, approver: a.email },
        process.env.APP_SIGNING_SECRET,
        { expiresIn: "24h" }
      );
      const link = `${process.env.APP_ORIGIN}/admin/approve?token=${token}`;
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: a.email,
        subject: "Admin Approval Request – Badminton Court System",
        text: `A user (${user.email}) has requested admin access.\n\nClick below to approve (valid 24h):\n${link}\n\nThis link can be used only once.`,
      });
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Admin request error:", err.message);
    res.status(500).json({ error: "Failed to request admin approval" });
  } finally {
    client.release();
  }
});

/* -----------------------------------------------------------
   2️⃣ GET /admin/requests/approve?token=... → approve via link
----------------------------------------------------------- */
router.get("/requests/approve", async (req, res) => {
  const { token } = req.query;
  const client = await pool.connect();
  try {
    const decoded = jwt.verify(token, process.env.APP_SIGNING_SECRET);
    const { approvalId } = decoded;

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM admin_approvals WHERE id=$1`,
      [approvalId]
    );
    if (result.rowCount === 0)
      throw new Error("Invalid or expired approval request");

    const a = result.rows[0];
    if (a.status !== "pending" || new Date(a.expires_at) < new Date()) {
      throw new Error("This link has expired or already been used");
    }

    // approve it
    await client.query(
      `UPDATE admin_approvals
         SET status='approved', approved_at=now()
       WHERE id=$1`,
      [approvalId]
    );

    await client.query(
      `UPDATE users SET role='admin' WHERE id=$1 AND role!='admin'`,
      [a.requester_user_id]
    );

    await client.query("COMMIT");

    res.send("<h2>✅ Admin approval successful!</h2><p>The requester is now an admin.</p>");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Approval error:", err.message);
    res.status(400).send(`<h2>❌ ${err.message}</h2>`);
  } finally {
    client.release();
  }
});

export default router;

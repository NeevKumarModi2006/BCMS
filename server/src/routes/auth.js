import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import "../services/passport.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/* -----------------------------------------------------------
   STEP 1 — Google OAuth entry point (single button)
----------------------------------------------------------- */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

/* -----------------------------------------------------------
   STEP 2 — Logout
----------------------------------------------------------- */
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  res.clearCookie("refresh", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/auth/refresh",
  });
  res.json({ message: "Logged out successfully" });
});

/* -----------------------------------------------------------
   STEP 3 — Get current user info
----------------------------------------------------------- */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { id, role } = req.user;
    res.json({ id, role });
  } catch (err) {
    console.error("Auth /me error:", err.message);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

/* -----------------------------------------------------------
   STEP 4 — Google OAuth callback (fixed domain + role logic)
----------------------------------------------------------- */
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      const googleUser = req.user;
      if (!googleUser?.email) {
        return res.status(400).json({ error: "Invalid Google profile" });
      }

      const email = String(googleUser.email).trim().toLowerCase();
      const name = googleUser.name;
      const picture = googleUser.picture;
      const isNitw = email.endsWith("nitw.ac.in");


      // Step 1: Check if this email already exists in users table
      const existing = await pool.query(
        "SELECT id, role, is_banned FROM users WHERE LOWER(email)=$1",
        [email]
      );

      let userId, role;

      if (existing.rowCount > 0) {
        userId = existing.rows[0].id;
        role = existing.rows[0].role;
        const isBanned = existing.rows[0].is_banned;

        if (isBanned) {
          return res
            .status(403)
            .send("Access denied — your account has been banned.");
        }

        // Allow login ONLY if: admin OR nitw email
        if (role !== "admin" && !isNitw) {

          // Log to unauthorized_attempts
          pool
            .query(
              "INSERT INTO unauthorized_attempts (email, reason, attempted_at, attempt_count) VALUES ($1, $2, NOW(), 1) ON CONFLICT (email) DO UPDATE SET reason=$2, attempted_at=NOW(), attempt_count=unauthorized_attempts.attempt_count+1",
              [email, "existing_non_admin_non_nitw"]
            )
            .catch((err) => console.error("Log error:", err));

          return res
            .status(403)
            .send("Access denied — must be admin or NITW user.");
        }

        // Update last login
        await pool.query(
          "UPDATE users SET last_login_at = NOW() WHERE id = $1",
          [userId]
        );
      } else {

        // Step 2: New login - only allow @nitw.ac.in
        if (!isNitw) {

          // Log to unauthorized_attempts
          pool
            .query(
              "INSERT INTO unauthorized_attempts (email, reason, attempted_at, attempt_count) VALUES ($1, $2, NOW(), 1) ON CONFLICT (email) DO UPDATE SET reason=$2, attempted_at=NOW(), attempt_count=unauthorized_attempts.attempt_count+1",
              [email, "not_nitw_domain"]
            )
            .catch((err) => console.error("Log error:", err));

          return res
            .status(403)
            .send(
              "Access denied — only NITW emails (nitw.ac.in) can register."
            );
        }


        // Create new NITW user
        const insert = await pool.query(
          "INSERT INTO users (email, name, picture, role, last_login_at) VALUES ($1, $2, $3, 'user', NOW()) RETURNING id",
          [email, name, picture]
        );
        userId = insert.rows[0].id;
        role = "user";
      }

      // Step 3: Generate JWT tokens
      const accessToken = jwt.sign(
        { id: userId, role },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: "15m", algorithm: "HS256" }
      );

      const refreshToken = jwt.sign(
        { id: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d", algorithm: "HS256" }
      );

      // Step 4: Set cookies
      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });
      res.cookie("refresh", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/auth/refresh",
      });

      // Step 5: Redirect based on role
      const redirectUrl =
        role === "admin"
          ? `${process.env.APP_ORIGIN}/admin/dashboard`
          : `${process.env.APP_ORIGIN}/dashboard`;

      res.redirect(303, redirectUrl);
    } catch (err) {
      console.error("❌ OAuth error:", err.message, err.stack);
      res.status(500).json({ error: "OAuth login failed" });
    }
  }
);

export default router;

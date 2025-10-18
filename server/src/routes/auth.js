import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import "../services/passport.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * 🟢 STEP 1 — Google OAuth entry point
 * Redirects to Google's OAuth consent page.
 */
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

/**
 * 🔵 STEP 2 — Logout
 * Clears both cookies securely.
 */
router.post("/logout", (req, res) => {
  res.clearCookie("token", { path: "/", httpOnly: true, sameSite: "lax" });
  res.clearCookie("refresh", {
    path: "/auth/refresh",
    httpOnly: true,
    sameSite: "lax",
  });
  return res.json({ message: "Logged out successfully" });
});

/**
 * 🟠 STEP 3 — Get current user info
 * Returns `id` and `role` from verified JWT in cookie.
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { id, role } = req.user;
    res.json({ id, role });
  } catch (err) {
    console.error("Auth /me error:", err.message);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

/**
 * 🔴 STEP 4 — Google OAuth callback
 * Handles redirect from Google → issues secure cookies → redirects to frontend.
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user?.id || !user?.email)
        return res.status(400).json({ error: "Invalid Google profile" });

      // sanitize query input (prevent role injection)
      const type = req.query.type === "admin" ? "admin" : "user";

      // optional role update if admin login used
      if (type === "admin" && user.role !== "admin") {
        await pool.query("UPDATE users SET role = $1 WHERE id = $2", [
          "admin",
          user.id,
        ]);
        user.role = "admin";
      }

      // JWT Access Token
      const accessToken = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: process.env.JWT_ACCESS_TTL || "15m",
          algorithm: "HS256",
        }
      );

      // JWT Refresh Token
      const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        {
          expiresIn: process.env.JWT_REFRESH_TTL || "7d",
          algorithm: "HS256",
        }
      );

      // ✅ Set secure cookies
      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // HTTPS only in prod
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        path: "/",
      });

      res.cookie("refresh", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/auth/refresh",
      });

      // ✅ Redirect to frontend OAuth callback
      res.redirect(
        303,
        `${process.env.APP_ORIGIN}/oauth-callback?role=${user.role}`
      );
    } catch (err) {
      console.error("OAuth error:", err.message);
      res.status(500).json({ error: "OAuth Login failed" });
    }
  }
);

export default router;

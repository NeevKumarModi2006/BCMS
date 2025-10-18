import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import authRoutes from "./routes/auth.js";
import bookingRoutes from "./routes/bookings.js";
import { startScheduler } from "./services/scheduler.js";
import cookieParser from "cookie-parser";
import adminApprovalRoutes from "./routes/adminApprovals.js";
import adminRoutes from "./routes/admin.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.use(helmet()); 
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10000, // 100 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json());
app.use(cookieParser());   
app.use(
  cors({
    origin: process.env.APP_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


// Routes
app.use("/auth", authRoutes);
app.use("/bookings", bookingRoutes);
app.use("/admin", adminApprovalRoutes);
app.use("/admin", adminRoutes);

// check
app.get("/", (req, res) => {
  res.send("🏸 Badminton Court Management System API is running...");
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Connected to PostgreSQL`);
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
});

startScheduler();

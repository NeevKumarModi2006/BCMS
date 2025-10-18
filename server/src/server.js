import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import bookingRoutes from "./routes/bookings.js";
import adminRoutes from "./routes/admin.js";
import approvalRoutes from "./routes/approvals.js";
import userRoutes from "./routes/users.js";

dotenv.config();
const app = express();
app.use(cors({ origin: process.env.APP_ORIGIN, credentials: true }));
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/bookings", bookingRoutes);
app.use("/admin", adminRoutes);
app.use("/approvals", approvalRoutes);
app.use("/users", userRoutes);

app.get("/", (_, res) => res.send("🏸 OOPS Server Running"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

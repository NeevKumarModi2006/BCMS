import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"], // ✅ enforce algorithm
    });

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

/* --------------------------------------------------
   Require ADMIN role only
-------------------------------------------------- */
export function requireAdmin(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    });

    if (!decoded || decoded.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = decoded; // contains id, email, role
    next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

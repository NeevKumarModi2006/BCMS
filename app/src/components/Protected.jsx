import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";

export default function Protected() {
  const [authorized, setAuthorized] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include", // ✅ sends HttpOnly cookie to backend
        });
        if (res.ok) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      } catch {
        setAuthorized(false);
      }
    }
    checkAuth();
  }, []);

  if (authorized === null) {
    return <div className="container">Checking authentication...</div>;
  }

  if (!authorized) {
    console.warn("No valid cookie/session, redirecting...");
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

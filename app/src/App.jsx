import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import NavbarUser from "./components/NavbarUser";
import NavbarAdmin from "./components/NavbarAdmin";
import Protected from "./components/Protected";
import Home from "./pages/Home";
import OAuthCallback from "./pages/OAuthCallback";
import Logout from "./pages/Logout";
import Book from "./pages/Book";
import MyBookings from "./pages/MyBookings";
import AdminCourts from "./pages/AdminCourts";
import AdminBlocks from "./pages/AdminBlocks";
import AdminApprovals from "./pages/AdminApprovals";
import AdminUsers from "./pages/AdminUsers";
import AdminAudit from "./pages/AdminAudit";
import AdminDashboard from "./pages/AdminDashboard";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [role, setRole] = useState(null);
  const location = useLocation();

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        setRole(data.role);
      } catch {
        setRole(null);
      }
    }
    fetchUser();
  }, []);

  // ✅ Hide navbar only on homepage
  const hideNavbar = location.pathname === "/";

  return (
    <>
      {!hideNavbar &&
        (role === "admin" ? (
          <NavbarAdmin />
        ) : role === "user" ? (
          <NavbarUser />
        ) : null)}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/logout" element={<Logout />} />

        {/* Protected Routes */}
        <Route element={<Protected />}>
          {/* User routes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/book" element={<Book />} />
          <Route path="/my" element={<MyBookings />} />

          {/* Admin routes */}
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/courts" element={<AdminCourts />} />
          <Route path="/admin/blocks" element={<AdminBlocks />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
        </Route>
      </Routes>
    </>
  );
}

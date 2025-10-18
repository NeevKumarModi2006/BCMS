import { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    document.title = "Admin Dashboard - Court System";

    // Optional: fetch admin info
    async function fetchAdmin() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        setAdmin(data);
      } catch {
        setAdmin(null);
      }
    }

    fetchAdmin();
  }, []);

  return (
    <div className="container">
      <h1>Welcome, Admin ⚡</h1>
      {admin && (
        <p>
          Logged in as: <b>Admin</b>
        </p>
      )}
      <p>Access your admin tools here.</p>
    </div>
  );
}

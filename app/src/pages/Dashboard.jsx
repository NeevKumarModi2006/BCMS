import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    document.title = "User Dashboard - Court System";

    // Optional: fetch user info to show on dashboard
    async function fetchUser() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        setUser(data);
      } catch {
        setUser(null);
      }
    }

    fetchUser();
  }, []);

  return (
    <div className="container">
      <h1>Welcome, User 👋</h1>
      {user && (
        <p>
          Logged in as: <b>USER</b>
        </p>
      )}
      <p>This is your user dashboard.</p>
    </div>
  );
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    async function checkLogin() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.role === "admin") navigate("/admin/dashboard", { replace: true });
        else if (data.role === "user") navigate("/dashboard", { replace: true });
      } catch {
        // not logged in
      }
    }
    checkLogin();
  }, [navigate]);

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`;
  };

  return (
    <div className="home-container">
      <h1 className="home-title">🏸 Badminton Court Management System</h1>
      <p className="home-sub">Manage courts, bookings, and schedules efficiently.</p>

      <div className="login-buttons">
        <button className="btn" onClick={handleLogin}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

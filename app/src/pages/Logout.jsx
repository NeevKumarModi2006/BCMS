import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    async function logout() {
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
          method: "POST",
          credentials: "include", // ✅ REQUIRED to clear HttpOnly cookies
        });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        navigate("/", { replace: true });
      }
    }
    logout();
  }, [navigate]);

  return <div className="container">Logging you out...</div>;
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function verifyAndRedirect() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();

        if (data.role === "admin") navigate("/admin/dashboard", { replace: true });
        else navigate("/dashboard", { replace: true });
      } catch (err) {
        console.error("OAuth verify error:", err);
        navigate("/", { replace: true });
      }
    }

    verifyAndRedirect();
  }, [navigate]);

  return <div className="container">Signing you in...</div>;
}

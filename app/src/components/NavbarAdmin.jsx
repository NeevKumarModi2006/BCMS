// app/src/components/NavbarAdmin.jsx
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function NavbarAdmin() {
    const navigate = useNavigate();

    async function logout() {
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            navigate("/");
        } catch (err) {
            console.error("Logout failed:", err);
        }
    }

    function toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
    }

    useEffect(() => {
        const saved = localStorage.getItem("theme") || "light";
        document.documentElement.setAttribute("data-theme", saved);
    }, []);

    const active = ({ isActive }) =>
        isActive ? "nav-item active" : "nav-item";

    return (
        <header className="admin-navbar">
            <div className="admin-navbar-left">
                <Link to="/admin/dashboard" className="brand">
                    Admin Panel
                </Link>
            </div>

            <nav className="admin-navbar-right">
                <NavLink to="/admin/dashboard" className={active}>
                    Dashboard
                </NavLink>
                <NavLink to="/admin/bookings" className={active}>
                    Bookings
                </NavLink>
                <NavLink to="/admin/blocks" className={active}>
                    Blocks
                </NavLink>
                <NavLink to="/admin/users" className={active}>
                    Users
                </NavLink>
                <NavLink to="/admin/audit" className={active}>
                    Audit
                </NavLink>
                <button className="btn danger" onClick={logout}>
                    Logout
                </button>
                <button className="btn" onClick={toggleTheme}>
                    
                </button>
            </nav>
        </header>
    );
}

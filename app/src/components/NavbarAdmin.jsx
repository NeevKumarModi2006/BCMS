// app/src/components/NavbarAdmin.jsx
import { Link, NavLink, useNavigate } from "react-router-dom";

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

    const active = ({ isActive }) => (isActive ? "nav-item active" : "nav-item");

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
                <NavLink to="/admin/approvals" className={active}>
                    Approvals
                </NavLink>
                <button className="btn danger" onClick={logout}>
                    Logout
                </button>
            </nav>
        </header>
    );
}

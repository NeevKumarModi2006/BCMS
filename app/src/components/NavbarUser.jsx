// app/src/components/NavbarUser.jsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
    Trophy,
    LayoutDashboard,
    CalendarDays,
    ClipboardList,
    LogOut,
    Sun,
    Moon,
} from "lucide-react";

export default function NavbarUser() {
    const [theme, setTheme] = useState("light");

    useEffect(() => {
        const saved = localStorage.getItem("theme") || "light";
        setTheme(saved);
        document.documentElement.setAttribute("data-theme", saved);
    }, []);

    function toggleTheme() {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
    }

    return (
        <nav className="navbar">
            <div className="nav-left">
                <Trophy
                    size={22}
                    strokeWidth={2.2}
                    className="nav-icon"
                    style={{
                        color:
                            theme === "dark"
                                ? "#D4AF37" // gold in dark
                                : "#1f1f1f", // dark gray in light
                    }}
                />
                <span style={{ marginLeft: "8px" }}>Court System</span>
            </div>

            <div className="nav-right">
                <Link to="/dashboard">
                    Dashboard
                </Link>
                <Link to="/book">

                    Book
                </Link>
                <Link to="/my">
                    My Bookings
                </Link>
                <Link to="/logout">
                    <LogOut size={18} strokeWidth={2} /> Logout
                </Link>

                <button className="btn-icon" onClick={toggleTheme}>
                    {theme === "dark" ? (
                        <Sun className="theme-icon" />
                    ) : (
                        <Moon className="theme-icon" />
                    )}

                </button>
            </div>
        </nav>
    );
}

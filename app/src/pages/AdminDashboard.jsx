// app/src/pages/AdminDashboard.jsx
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ users: 0, bookings: 0, blocks: 0 });

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/stats`, {
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (err) {
                console.error("Failed to load stats:", err);
            }
        }
        fetchStats();
    }, []);

    return (
        <>
            <main className="container">
                <div className="admin-dashboard container">
                    <h1 className="page-title">Admin Dashboard</h1>
                    <p className="page-subtitle">
                        Welcome to the administrative control center.
                    </p>

                    <div className="stats-grid">
                        <div className="stat-card" onClick={() => navigate("/admin/users")}>
                            <h2>👥 Users</h2>
                            <p>{stats.users}</p>
                        </div>
                        <div className="stat-card" onClick={() => navigate("/admin/bookings")}>
                            <h2>📅 Bookings</h2>
                            <p>{stats.bookings}</p>
                        </div>
                        <div className="stat-card" onClick={() => navigate("/admin/blocks")}>
                            <h2>🚫 Blocks</h2>
                            <p>{stats.blocks}</p>
                        </div>  
                    </div>
                </div>
                <div className="quick-actions">
                    <h2>Quick Actions</h2>
                    <div className="grid">
                        <Link className="card" to="/admin/blocks">
                            <h3>Block Lots</h3>
                            <p>Create/remove morning/evening blocks for courts.</p>
                        </Link>
                        <Link className="card" to="/admin/users">
                            <h3>Manage Users</h3>
                            <p>Ban/unban users and set play frequency (3d/2d/1d).</p>
                        </Link>
                        <Link className="card" to="/admin/audit">
                            <h3>Audit Logs</h3>
                            <p>Recent cancellations and system events.</p>
                        </Link>
                        <Link className="card" to="/admin/approvals">
                            <h3>Admin Approvals</h3>
                            <p>Approve or reject admin role requests.</p>
                        </Link>
                    </div>
                </div> 
            </main>
        </>
    );
}

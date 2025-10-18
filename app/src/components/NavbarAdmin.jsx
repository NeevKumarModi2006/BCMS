import { Link } from "react-router-dom";

export default function NavbarAdmin() {
    return (
        <nav className="navbar admin">
            <div className="nav-left">🏸 Admin Panel</div>
            <div className="nav-right">
                <Link to="/admin/dashboard">Dashboard</Link>
                <Link to="/admin/blocks">Blocks</Link>
                <Link to="/admin/courts">Courts</Link>
                <Link to="/logout">Logout</Link>
            </div>
        </nav>
    );
}

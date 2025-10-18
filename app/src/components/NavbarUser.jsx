import { Link } from "react-router-dom";

export default function NavbarUser() {
    return (
        <nav className="navbar">
            <div className="nav-left">🏸 Court System</div>
            <div className="nav-right">
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/book">Book</Link>
                <Link to="/my">My Bookings</Link>
                <Link to="/logout">Logout</Link>
            </div>
        </nav>
    );
}

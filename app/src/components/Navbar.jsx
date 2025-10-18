import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const token = localStorage.getItem('accessToken')

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    navigate('/')
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          🏸 Badminton Court System
        </Link>

        <div className="nav-actions">
          {token ? (
            <>
              <Link to="/book" className="btn">Book</Link>
              <Link to="/my" className="btn">My Bookings</Link>
              <Link to="/admin/courts" className="btn">Admin</Link>
              <button onClick={handleLogout} className="btn btn-danger">Logout</button>
            </>
          ) : (
            <>
              <Link to="/" className="btn btn-primary">Login</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

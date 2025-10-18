import { useEffect, useState } from "react";
import { format } from "date-fns";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchBookings() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/bookings/mine`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load bookings");
        setBookings(data.items);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchBookings();
  }, []);

  async function cancelBooking(id) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/bookings/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      alert("Booking cancelled!");
      setBookings((b) => b.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="container"><p>Loading...</p></div>;
  if (error) return <div className="container"><p className="error">{error}</p></div>;

  return (
    <div className="container">
      <h1 className="h1">My Bookings</h1>

      {bookings.length === 0 ? (
        <p>No bookings found.</p>
      ) : (
        <div className="grid">
          {bookings.map((b) => (
            <div className="card" key={b.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <b>{b.court_name}</b>
                  <div className="small">
                    {format(new Date(b.start_time), "dd MMM yyyy, HH:mm")} →{" "}
                    {format(new Date(b.end_time), "HH:mm")}
                  </div>
                </div>
                <span
                  className={`status ${
                    b.status === "confirmed"
                      ? "status-ok"
                      : b.status === "pending"
                      ? "status-wait"
                      : "status-cancel"
                  }`}
                >
                  {b.status}
                </span>
              </div>

              <div className="mt12 row end">
                {b.status !== "cancelled" && (
                  <button
                    className="btn btn-danger"
                    onClick={() => cancelBooking(b.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

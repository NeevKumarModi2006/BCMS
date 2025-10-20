// app/src/pages/AdminBookings.jsx
import { useEffect, useState } from "react";
import React from "react";

export default function AdminBookings() {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState("default");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [participants, setParticipants] = useState({});

  // 🔄 Fetch bookings from backend
  async function loadBookings(selectedMode = mode) {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/bookings?mode=${selectedMode}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
      else alert(data.error || "Failed to load bookings");
    } catch (err) {
      console.error(err);
      alert("Server error while loading bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [mode]);

  // 🚫 Cancel booking (admin)
  async function cancelBooking(id) {
    if (!confirm("Cancel this booking and notify all participants?")) return;
    setActingId(id);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/bookings/${id}/cancel`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      alert("Booking cancelled successfully and participants notified.");
      loadBookings();
    } catch (err) {
      alert(err.message);
    } finally {
      setActingId(null);
    }
  }

  // 👥 Toggle participant list view
  async function toggleParticipants(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    if (!participants[id]) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/admin/bookings/${id}/participants`,
          { credentials: "include" }
        );
        if (!res.ok) {
          console.error("Failed to fetch participants");
          return;
        }
        const data = await res.json();
        setParticipants((prev) => ({ ...prev, [id]: data.participants || [] }));
      } catch (err) {
        console.error("Error fetching participants:", err);
      }
    }
  }

  if (loading) return <div className="container">Loading bookings...</div>;

  return (
    <div className="container">
      <h1 className="page-title">User Booking Requests</h1>
      <p className="page-subtitle">
        Only user-created bookings are listed below. You can cancel requests up
        to <strong>1 hour before start time</strong> — all participants will be
        notified by email.
      </p>

      {/* View mode toggle */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <label style={{ fontWeight: 600, marginRight: "0.5rem" }}>
          View Mode:
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ padding: "0.4rem 0.8rem", borderRadius: "6px" }}
        >
          <option value="current">Current (±1 hour)</option>
          <option value="default">Upcoming (Cancelable)</option>
          <option value="explicit">All</option>
        </select>

      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Court</th>
              <th>Creator</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Participants</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((b) => (
                <React.Fragment key={b.id}>
                  <tr>
                    <td>{b.court_name}</td>
                    <td>{b.creator_email}</td>
                    <td>
                      {new Date(b.start_time).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </td>
                    <td>
                      {new Date(b.end_time).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </td>
                    <td className="cap">{b.status}</td>
                    <td>
                      <button
                        className="btn-sm"
                        onClick={() => toggleParticipants(b.id)}
                      >
                        {expandedId === b.id ? "Hide" : "View"}
                      </button>
                    </td>
                    <td>
                      {mode === "default" ? (
                        <button
                          className={
                            b.status === "cancelled" ||
                              b.status === "auto-cancelled"
                              ? "btn-sm"
                              : "btn danger"
                          }
                          disabled={
                            actingId === b.id ||
                            b.status === "cancelled" ||
                            b.status === "auto-cancelled"
                          }
                          onClick={() => cancelBooking(b.id)}
                        >
                          {b.status === "cancelled"
                            ? "Cancelled"
                            : actingId === b.id
                              ? "Cancelling..."
                              : "Cancel"}
                        </button>
                      ) : (
                        <span style={{ color: "#888" }}>—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded participants list */}
                  {expandedId === b.id && participants[b.id] && (
                    <tr
                      className="participant-row"
                      key={`${b.id}-participants`}
                    >
                      <td colSpan="7">
                        <div
                          style={{
                            padding: "0.5rem 1rem",
                            color: "#333",
                          }}
                        >
                          <strong>Participants:</strong>{" "}
                          {participants[b.id].length ? (
                            participants[b.id].map((p) => (
                              <span
                                key={p.email}
                                style={{
                                  display: "inline-block",
                                  marginRight: "10px",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  backgroundColor: "#e8f0fe",
                                  color: "#202124",
                                }}
                              >
                                {p.email}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "gray" }}>
                              No participants listed
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td
                  colSpan="7"
                  style={{ textAlign: "center", color: "gray" }}
                >
                  No bookings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

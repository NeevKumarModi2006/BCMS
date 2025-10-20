import { useEffect, useState } from "react";

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/audit?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <main className="container">
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">View cancellations and system events.</p>

      {/* Date Filters */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <label>
          From:
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ marginLeft: "8px", padding: "4px 8px" }}
          />
        </label>
        <label>
          To:
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ marginLeft: "8px", padding: "4px 8px" }}
          />
        </label>
        <button className="btn" onClick={fetchLogs}>
          🔍 Search
        </button>
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", minWidth: "700px" }}>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Start</th>
              <th>End</th>
              <th>Reason</th>
              <th>Logged Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  Loading...
                </td>
              </tr>
            ) : items.length > 0 ? (
              items.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.booking_id || "-"}</td>
                  <td>
                    {a.original_start
                      ? new Date(a.original_start).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                      : "-"}
                  </td>
                  <td>
                    {a.original_end
                      ? new Date(a.original_end).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                      : "-"}
                  </td>
                  <td>{a.reason || "-"}</td>
                  <td>
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", color: "gray" }}>
                  No logs found for this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

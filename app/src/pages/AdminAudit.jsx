// app/src/pages/AdminAudit.jsx
import { useEffect, useState } from "react";

export default function AdminAudit() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/audit", { credentials: "include" });
      const j = await r.json();
      setItems(j.items || []);
    })();
  }, []);

  return (
    <>
      <main className="container">
        <h1>Audit Logs (Recent Cancellations)</h1>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th><th>Start</th><th>End</th><th>Reason</th><th>Logged</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td className="mono">{a.booking_id || "-"}</td>
                  <td>{new Date(a.original_start).toLocaleString()}</td>
                  <td>{new Date(a.original_end).toLocaleString()}</td>
                  <td>{a.reason || "-"}</td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan="5" style={{textAlign:"center"}}>No logs.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

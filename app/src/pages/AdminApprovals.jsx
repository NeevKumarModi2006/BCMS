// app/src/pages/AdminApprovals.jsx
import { useEffect, useState } from "react";

export default function AdminApprovals() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/approvals", { credentials: "include" });
    const j = await r.json();
    setItems(j.items || []);
  }
  useEffect(() => { load(); }, []);

  async function approve(id) {
    setBusy(true);
    try {
      await fetch(`/api/admin/approvals/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } finally { setBusy(false); }
  }
  async function reject(id) {
    setBusy(true);
    try {
      await fetch(`/api/admin/approvals/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } finally { setBusy(false); }
  }

  return (
    <>
      <main className="container">
        <h1>Admin Approvals</h1>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th><th>Requested</th><th>Expires</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td>{a.created_at ? new Date(a.created_at).toLocaleString() : "-"}</td>
                  <td>{a.expires_at ? new Date(a.expires_at).toLocaleString() : "-"}</td>
                  <td className="cap">{a.status}</td>
                  <td>
                    <button className="btn" disabled={busy} onClick={() => approve(a.id)}>Approve</button>{" "}
                    <button className="btn danger" disabled={busy} onClick={() => reject(a.id)}>Reject</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan="5" style={{textAlign:"center"}}>No pending approvals.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

import { useEffect, useState } from "react";

export default function AdminBlocks() {
  const [courts, setCourts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [form, setForm] = useState({
    court_ids: [],
    lot: [],
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadCourts() {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/courts`, {
        credentials: "include",
      });
      const data = await res.json();
      setCourts(data.items || []);
    } catch (err) {
      console.error("Error loading courts:", err);
    }
  }

  async function loadBlocks() {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/blocks`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) setBlocks(data.items || []);
    } catch (err) {
      console.error("Error loading blocks:", err);
    }
  }

  useEffect(() => {
    loadCourts();
    loadBlocks();
    const today = new Date().toISOString().split("T")[0];
    setForm((f) => ({ ...f, start_date: today, end_date: today }));
  }, []);

  function toggleCourt(id) {
    setForm((f) => {
      const selected = f.court_ids.includes(id)
        ? f.court_ids.filter((x) => x !== id)
        : [...f.court_ids, id];
      return { ...f, court_ids: selected };
    });
  }

  function toggleLot(value) {
    setForm((f) => {
      const selected = f.lot.includes(value)
        ? f.lot.filter((l) => l !== value)
        : [...f.lot, value];
      return { ...f, lot: selected };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create block");

      setMsg(
        `✅ Block(s) created successfully! ${
          data.cancelled > 0
            ? `${data.cancelled} booking(s) were cancelled.`
            : "No active bookings affected."
        }`
      );
      setForm({
        court_ids: [],
        lot: [],
        start_date: form.start_date,
        end_date: form.end_date,
        reason: "",
      });
      loadBlocks();
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 6000);
    }
  }

  async function removeBlock(id) {
    if (!confirm("Delete this block?")) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/admin/blocks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      loadBlocks();
    } catch {
      alert("Failed to delete block.");
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Manage Court Blocks</h1>
      <p className="page-subtitle">
        Create or remove morning/evening blocks for one or more courts.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Select Courts</label>
          <div className="grid" style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {courts.map((c) => (
              <label key={c.id} style={{ fontWeight: "500" }}>
                <input
                  type="checkbox"
                  value={c.id}
                  checked={form.court_ids.includes(c.id)}
                  onChange={() => toggleCourt(c.id)}
                />{" "}
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Lot</label>
          <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
            <label>
              <input
                type="checkbox"
                value="morning"
                checked={form.lot.includes("morning")}
                onChange={() => toggleLot("morning")}
              />{" "}
              Morning
            </label>
            <label>
              <input
                type="checkbox"
                value="evening"
                checked={form.lot.includes("evening")}
                onChange={() => toggleLot("evening")}
              />{" "}
              Evening
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>Start Date</label>
          <input
            type="date"
            required
            min={new Date().toISOString().split("T")[0]}
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>End Date</label>
          <input
            type="date"
            required
            min={form.start_date}
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Reason (optional)</label>
          <input
            type="text"
            placeholder="Maintenance, event, etc."
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>

        {msg && (
          <div
            className="alert"
            style={{
              background: msg.startsWith("✅") ? "#d4edda" : "#f8d7da",
              color: msg.startsWith("✅") ? "#155724" : "#721c24",
              padding: "10px",
              borderRadius: "8px",
              marginBottom: "10px",
            }}
          >
            {msg}
          </div>
        )}

        <button className="btn" disabled={loading}>
          {loading ? "Saving..." : "Create Block(s)"}
        </button>
      </form>

      <h2 className="page-subtitle" style={{ marginTop: "2rem" }}>
        Active Blocks
      </h2>

      <div className="table-wrapper">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Court</th>
              <th>Lot</th>
              <th>Start</th>
              <th>End</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length > 0 ? (
              blocks.map((b) => (
                <tr key={b.id}>
                  <td>{b.court_name}</td>
                  <td className="cap">{b.lot}</td>
                  <td>{b.start_date}</td>
                  <td>{b.end_date}</td>
                  <td>{b.reason || "-"}</td>
                  <td>
                    <button
                      className="btn-sm btn-ban"
                      onClick={() => removeBlock(b.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", color: "gray" }}>
                  No blocks currently active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

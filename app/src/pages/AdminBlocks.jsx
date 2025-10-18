import { useEffect, useState } from "react";

export default function AdminBlocks() {
  const [courts, setCourts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [form, setForm] = useState({
    court_id: "",
    lot: "morning",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      else alert(data.error || "Failed to load blocks");
    } catch (err) {
      console.error("Error loading blocks:", err);
      alert("Failed to load blocks.");
    }
  }

  useEffect(() => {
    loadCourts();
    loadBlocks();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
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
      setForm({
        court_id: "",
        lot: "morning",
        start_date: "",
        end_date: "",
        reason: "",
      });
      loadBlocks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
    } catch (err) {
      alert("Failed to delete block.");
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Manage Blocks</h1>
      <p className="page-subtitle">
        Create or remove morning/evening court blocks (up to 30 days ahead).
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Court</label>
          <select
            required
            value={form.court_id}
            onChange={(e) =>
              setForm({ ...form, court_id: Number(e.target.value) })
            }
          >
            <option value="">Select court</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Lot</label>
          <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
            <label>
              <input
                type="radio"
                name="lot"
                value="morning"
                checked={form.lot === "morning"}
                onChange={(e) => setForm({ ...form, lot: e.target.value })}
              />{" "}
              Morning
            </label>
            <label>
              <input
                type="radio"
                name="lot"
                value="evening"
                checked={form.lot === "evening"}
                onChange={(e) => setForm({ ...form, lot: e.target.value })}
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
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>End Date</label>
          <input
            type="date"
            required
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

        {error && <div className="alert warn">{error}</div>}

        <button className="btn" disabled={loading}>
          {loading ? "Saving..." : "Create Block"}
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

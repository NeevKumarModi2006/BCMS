import { useState, useEffect } from "react";

export default function AdminBlocks() {
  const [courts, setCourts] = useState([]);
  const [courtId, setCourtId] = useState("");
  const [lot, setLot] = useState("morning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadCourts();
  }, []);

  const loadCourts = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/courts`, {
      credentials: "include", // ✅ send HttpOnly cookies
    });
    const data = await res.json();
    setCourts(data.items || []);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!courtId || !startDate || !endDate)
      return setMessage("Please select court and date range.");

    const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ court_id: courtId, lot, start_date: startDate, end_date: endDate, reason }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("✅ Block created successfully!");
      setReason("");
    } else setMessage(`❌ ${data.error || "Failed to create block"}`);
  };

  return (
    <div className="container">
      <h1 className="h1">Court Block Management</h1>
      <p className="kv">Block AM/PM lots for up to 1 month in advance.</p>

      <form onSubmit={submit} className="card grid mt16" style={{ gap: "16px" }}>
        <div>
          <label className="label">Court</label>
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <option value="">Select court</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-2">
          <div>
            <label className="label">Lot</label>
            <select value={lot} onChange={(e) => setLot(e.target.value)}>
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
            </select>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Maintenance / Event..."
            />
          </div>
        </div>

        <div className="grid grid-2">
          <div>
            <label className="label">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary">Block Lot</button>
      </form>

      {message && <p className="mt16 small">{message}</p>}
    </div>
  );
}

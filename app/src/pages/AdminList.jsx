import { useState, useEffect } from "react";

export default function AdminList() {
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAdmins() {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/admins`, {
      credentials: "include",
    });
    const data = await res.json();
    setAdmins(data.admins || []);
  }

  async function addAdmin() {
    if (!email.trim()) return alert("Enter an email");
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      alert("✅ Admin added successfully");
      setEmail("");
      loadAdmins();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeAdmin(id) {
    if (!confirm("Are you sure?")) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/admins/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      alert("Admin removed");
      loadAdmins();
    } catch (err) {
      alert(err.message);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h2>Manage Admins</h2>

        <div className="form-group">
          <label>Add New Admin (Email)</label>
          <input
            type="email"
            placeholder="example@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-primary mt12" onClick={addAdmin} disabled={loading}>
            {loading ? "Adding..." : "Add Admin"}
          </button>
        </div>

        <h3>Current Admins</h3>
        <table className="admin-table" style={{ width: "100%", marginTop: "10px" }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Created At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.email}</td>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>
                  <button className="btn btn-danger" onClick={() => removeAdmin(a.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

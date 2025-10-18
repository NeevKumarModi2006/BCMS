// AdminUsers.jsx
import { useEffect, useState } from "react";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // 🔹 Load all users (excluding admins)
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`, {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          // Exclude admins from the table
          const filtered = data.items.filter((u) => u.role !== "admin");
          setUsers(filtered);
        } else alert(data.error || "Failed to load users");
      } catch (err) {
        console.error("Error loading users:", err);
        alert("Server error while fetching users.");
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  // 🔹 Update play policy or ban status
  async function updateUser(id, updates) {
    setUpdatingId(id);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/users/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      // Refresh table locally
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <div className="container">Loading users...</div>;

  return (
    <div className="container">
      <h1 className="page-title">Manage Users</h1>
      <p className="page-subtitle">
        Ban users or adjust their play frequency policy (admins excluded).
      </p>

      {users.length === 0 ? (
        <p style={{ textAlign: "center", color: "gray", marginTop: "2rem" }}>
          No regular users found.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="styled-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Play Policy</th>
                <th>Banned?</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.play_policy || "3d"}
                      onChange={(e) =>
                        updateUser(u.id, { play_policy: e.target.value })
                      }
                      disabled={updatingId === u.id}
                    >
                      <option value="3d">3 Days</option>
                      <option value="2d">2 Days</option>
                      <option value="1d">1 Day</option>
                    </select>
                  </td>
                  <td>
                    {u.is_banned ? (
                      <span className="badge banned">Yes</span>
                    ) : (
                      <span className="badge active">No</span>
                    )}
                  </td>
                  <td>
                    <button
                      className={`btn-sm ${
                        u.is_banned ? "btn-unban" : "btn-ban"
                      }`}
                      onClick={() => updateUser(u.id, { is_banned: !u.is_banned })}
                      disabled={updatingId === u.id}
                    >
                      {u.is_banned ? "Unban" : "Ban"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

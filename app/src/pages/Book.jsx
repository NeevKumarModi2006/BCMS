import { useState, useEffect } from "react";
import { format } from "date-fns";

export default function Book() {
  const [date, setDate] = useState("");
  const [window, setWindow] = useState("full");
  const [participants, setParticipants] = useState(2);
  const [duration, setDuration] = useState("30"); // New state for 2-participant duration
  const [emails, setEmails] = useState([""]);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeLabels, setTimeLabels] = useState({
    morning: "Morning (6 AM - 9 AM)",
    evening: "Evening (4 PM - 10 PM)",
  });
  const [searched, setSearched] = useState(false);


  useEffect(() => {
    const loadBanners = async () => {
      const now = new Date().toISOString();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/bookings/cancellations?now=${now}`, {
        credentials: "include",
      });
      const data = await res.json();
      setBanners(data.banners || []);
    };
    loadBanners();
    const interval = setInterval(loadBanners, 60000);
    return () => clearInterval(interval);
  }, []);

  // Detect weekday/weekend and adjust labels dynamically
  function updateTimeLabels(selectedDate) {
    const d = new Date(selectedDate + 'T00:00:00');
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) {
      setTimeLabels({
        morning: "Morning (6 AM - 11 AM)",
        evening: "Evening (4 PM - 10 PM)",
      });
    } else {
      setTimeLabels({
        morning: "Morning (6 AM - 9 AM)",
        evening: "Evening (4 PM - 10 PM)",
      });
    }
  }

  // adjust email inputs based on participants (n−1)
  function handleParticipantsChange(n) {
    const count = Math.min(Math.max(2, Number(n)), 6);
    setParticipants(count);
    const needed = count - 1;
    const copy = [...emails];
    while (copy.length < needed) copy.push("");
    while (copy.length > needed) copy.pop();
    setEmails(copy);

    // Reset duration to 30 when changing participants
    if (count !== 2) {
      setDuration("30");
    }
  }

  async function findSlots() {
    if (!date) return alert("Select a date first");
    setLoading(true);
    setSearched(true);
    try {
      const durationParam = participants === 2 ? `&duration=${duration}` : '';
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/bookings/suggest?date=${date}&participants=${participants}&window=${window}${durationParam}`,
        { credentials: "include" }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load slots");

      setSlots(data.slots || []);
      setSelected(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function bookSlot() {
    if (!selected) return alert("Select a slot first");
    for (const e of emails)
      if (!e.endsWith("nitw.ac.in"))
        return alert("All participant emails must end with nitw.ac.in");

    const payload = {
      court_id: selected.court_id,
      start_time: selected.start_time,
      end_time: selected.end_time,
      participants,
      emails,
    };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || data.cooldown || "Booking failed");
      alert("✅ Booking created! Confirmation emails sent.");
      setSlots([]);
      setSelected(null);
      setDate("");
      setEmails(Array(participants - 1).fill(""));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="container">
      {banners.length > 0 && banners.map((b, i) => (
        <div key={i} className="banner banner-warning">{b.message}</div>
      ))}

      <h1 className="h1">Book a Court</h1>

      <div className="card grid">
        <label className="label">Select Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            updateTimeLabels(e.target.value);
            setSlots([]);
            setSelected(null);
            setSearched(false);
          }}
          min={new Date().toISOString().split("T")[0]}
          max={new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0]}
        />

        <label className="label">Time Window</label>
        <select value={window} onChange={(e) => {
          setWindow(e.target.value);
          setSlots([]);
          setSelected(null);
        }}>
          <option value="full">Full Day (Morning + Evening)</option>
          <option value="morning">{timeLabels.morning}</option>
          <option value="evening">{timeLabels.evening}</option>
        </select>

        <label className="label">Number of Participants</label>
        <select
          value={participants}
          onChange={(e) => handleParticipantsChange(e.target.value)}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>

        {participants === 2 && (
          <>
            <label className="label">Duration</label>
            <select
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                setSlots([]);
                setSelected(null);
              }}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </>
        )}

        <label className="label">
          Enter Participant Email IDs (must end with nitw.ac.in)
        </label>
        {emails.map((v, i) => (
          <input
            key={i}
            type="email"
            placeholder={`Participant ${i + 2} email`}
            value={v}
            onChange={(e) => {
              const copy = [...emails];
              copy[i] = e.target.value;
              setEmails(copy);
            }}
          />
        ))}

        <button className="btn btn-primary mt12" onClick={findSlots} disabled={loading}>
          {loading ? "Loading..." : "Find Available Slots"}
        </button>
      </div>

      {slots.length > 0 && (
        <div className="mt16">
          <h2 className="h2">Available Slots ({slots.length})</h2>
          <div className="grid">
            {slots.map((s) => (
              <div
                key={s.id}
                className={`card slot ${selected?.id === s.id ? "selected" : ""}`}
                onClick={() => setSelected(s)}
              >
                <b>{s.court_name}</b>
                <div className="small">
                  {format(new Date(s.start_time), "hh:mm a")} →{" "}
                  {format(new Date(s.end_time), "hh:mm a")}
                </div>
              </div>
            ))}
          </div>

          <div className="mt12 end row">
            <button className="btn btn-primary" onClick={bookSlot}>
              Book Slot
            </button>
          </div>
        </div>
      )}

      {searched && slots.length === 0 && date && !loading && (
        <div className="mt16">
          <div className="card">
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
              No slots available for the selected date and time window. Try a different selection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
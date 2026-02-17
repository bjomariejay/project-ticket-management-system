import { FormEvent, useEffect, useState } from "react";
import { Ticket } from "../../types/api";

interface DashboardTicketModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (updates: {
    title: string;
    status: Ticket["status"];
    priority: Ticket["priority"];
    estimatedHours: number | null;
  }) => void;
}

const statusOptions: Array<{ value: Ticket["status"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "archived", label: "Archived" },
];

const DashboardTicketModal = ({ ticket, isOpen, saving, error, onClose, onSave }: DashboardTicketModalProps) => {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Ticket["status"]>("open");
  const [priority, setPriority] = useState<Ticket["priority"]>("normal");
  const [estimatedHours, setEstimatedHours] = useState<string>("");

  useEffect(() => {
    if (!ticket) return;
    setTitle(ticket.title);
    setStatus(ticket.status as Ticket["status"]);
    setPriority(ticket.priority);
    setEstimatedHours(
      typeof ticket.estimatedHours === "number" && !Number.isNaN(ticket.estimatedHours)
        ? String(ticket.estimatedHours)
        : ""
    );
  }, [ticket]);

  if (!ticket || !isOpen) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    let parsedEstimate: number | null = null;
    if (estimatedHours.trim() !== "") {
      const numeric = Number(estimatedHours);
      parsedEstimate = Number.isNaN(numeric) ? null : numeric;
    }
    onSave({
      title: trimmedTitle,
      status,
      priority,
      estimatedHours: parsedEstimate,
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal">
        <header>
          <div>
            <h3>Update {ticket.ticketNumber}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close ticket modal" disabled={saving}>
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as Ticket["status"]) }>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as Ticket["priority"]) }>
              <option value="normal">Normal</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>
            Estimated hours
            <input
              type="number"
              min={0}
              step="0.25"
              value={estimatedHours}
              onChange={(event) => setEstimatedHours(event.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <footer>
            <button type="button" className="link-button outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="link-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </footer>
        </form>
      </article>
    </div>
  );
};

export default DashboardTicketModal;

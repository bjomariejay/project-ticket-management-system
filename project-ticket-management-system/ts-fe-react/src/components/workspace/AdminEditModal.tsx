import { FormEvent } from "react";

interface AdminEditForm {
  displayName: string;
  handle: string;
  location: string;
}

interface AdminEditModalProps {
  isOpen: boolean;
  form: AdminEditForm;
  saving: boolean;
  error: string;
  onFieldChange: (field: keyof AdminEditForm, value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}

const AdminEditModal = ({
  isOpen,
  form,
  saving,
  error,
  onFieldChange,
  onClose,
  onSave,
}: AdminEditModalProps) => {
  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal">
        <header>
          <h3>Edit user</h3>
          <button type="button" onClick={onClose} aria-label="Close admin edit">
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              type="text"
              value={form.displayName}
              onChange={(event) => onFieldChange("displayName", event.target.value)}
              required
            />
          </label>
          <label>
            Handle
            <input
              type="text"
              value={form.handle}
              onChange={(event) => onFieldChange("handle", event.target.value)}
              required
            />
          </label>
          <label>
            Location
            <input
              type="text"
              value={form.location}
              onChange={(event) => onFieldChange("location", event.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <footer>
            <button type="button" className="link-button outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="link-button" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </article>
    </div>
  );
};

export default AdminEditModal;

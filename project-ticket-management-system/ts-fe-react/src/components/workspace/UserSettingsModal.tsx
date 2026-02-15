import { FormEvent } from "react";

interface UserSettingsModalProps {
  isOpen: boolean;
  form: { displayName: string; handle: string; location: string };
  error: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
  onFieldChange: (field: "displayName" | "handle" | "location", value: string) => void;
}

const UserSettingsModal = ({
  isOpen,
  form,
  error,
  saving,
  onClose,
  onSave,
  onFieldChange,
}: UserSettingsModalProps) => {
  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal">
        <header>
          <h3>User settings</h3>
          <button type="button" onClick={onClose} aria-label="Close settings">
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
            />
          </label>
          <label>
            Handle
            <input
              type="text"
              value={form.handle}
              onChange={(event) => onFieldChange("handle", event.target.value)}
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

export default UserSettingsModal;

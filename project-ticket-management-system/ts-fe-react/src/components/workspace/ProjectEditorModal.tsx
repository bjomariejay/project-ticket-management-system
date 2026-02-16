import { FormEvent } from "react";

interface ProjectEditorForm {
  name: string;
  slug: string;
  ticketPrefix: string;
  description: string;
}

interface ProjectEditorModalProps {
  isOpen: boolean;
  form: ProjectEditorForm;
  saving: boolean;
  deleting: boolean;
  onFieldChange: (field: keyof ProjectEditorForm, value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}

const ProjectEditorModal = ({
  isOpen,
  form,
  saving,
  deleting,
  onFieldChange,
  onClose,
  onSave,
  onDelete,
}: ProjectEditorModalProps) => {
  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave();
  };

  const handleDelete = async () => {
    if (deleting) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this project? This cannot be undone.");
    if (!confirmed) return;
    await onDelete();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal">
        <header>
          <h3>Edit project</h3>
          <button type="button" onClick={onClose} aria-label="Close project editor">
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit} className="create-project">
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => onFieldChange("name", event.target.value)}
              required
              disabled={saving || deleting}
            />
          </label>
          <label style={{display: 'none'}}>
            Slug
            <input
              type="text"
              value={form.slug}
              onChange={(event) => onFieldChange("slug", event.target.value)}
              disabled={saving || deleting}
            />
          </label>
          <label >
            Ticket prefix
            <input
              type="text"
              value={form.ticketPrefix}
              onChange={(event) => onFieldChange("ticketPrefix", event.target.value)}
              required
              disabled={saving || deleting}
            />
          </label>
          <label style={{display: 'none'}}>
            Description
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => onFieldChange("description", event.target.value)}
              disabled={saving || deleting}
            />
          </label>
          <footer className="edit-project-footer">
            <button
              type="button"
              className="link-button outline"
              onClick={onClose}
              disabled={saving || deleting}
            >
              Cancel
            </button>
            <div className="edit-project-footer__actions">
              <button
                type="button"
                className="link-button danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
              <button
                className="link-button"
                type="submit"
                disabled={saving || deleting}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </footer>
        </form>
      </article>
    </div>
  );
};

export default ProjectEditorModal;

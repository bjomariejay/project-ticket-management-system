import { FormEvent } from "react";
import { Project } from "../../types/api";

interface CreateTicketForm {
  title: string;
  description: string;
  projectId: string;
  estimatedHours: number;
  priority: "normal" | "priority";
  privacy: "public" | "private";
}

interface CreateTicketModalProps {
  isOpen: boolean;
  form: CreateTicketForm;
  projects: Project[];
  onFieldChange: <K extends keyof CreateTicketForm>(field: K, value: CreateTicketForm[K]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const CreateTicketModal = ({
  isOpen,
  form,
  projects,
  onFieldChange,
  onClose,
  onSubmit,
}: CreateTicketModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal">
        <header>
          <h3>Create ticket</h3>
          <button type="button" onClick={onClose} aria-label="Close create ticket form">
            ×
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <label>
            Title
            <input
              type="text"
              value={form.title}
              onChange={(event) => onFieldChange("title", event.target.value)}
              required
            />
          </label>
          <label style={{display:'none'}}>
            Description
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => onFieldChange("description", event.target.value)}
            />
          </label>
          <label>
            Project
            <select
              value={form.projectId}
              onChange={(event) => onFieldChange("projectId", event.target.value)}
              required
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estimated hours
            <input
              type="number"
              min={0}
              value={form.estimatedHours}
              onChange={(event) => onFieldChange("estimatedHours", Number(event.target.value))}
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(event) => onFieldChange("priority", event.target.value as CreateTicketForm["priority"])}
            >
              <option value="normal">Normal</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>
            Privacy
            <select
              value={form.privacy}
              onChange={(event) => onFieldChange("privacy", event.target.value as CreateTicketForm["privacy"])}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <footer>
            <button type="button" className="link-button outline" onClick={onClose}>
              Cancel
            </button>
            <button className="link-button" type="submit">
              Create ticket
            </button>
          </footer>
        </form>
      </article>
    </div>
  );
};

export default CreateTicketModal;

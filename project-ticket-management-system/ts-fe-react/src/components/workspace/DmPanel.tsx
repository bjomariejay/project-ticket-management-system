import { KeyboardEvent } from "react";
import { DmMessage, User } from "../../types/api";

interface DmPanelProps {
  users: User[];
  currentUserId?: string;
  selectedRecipientId: string;
  dmBody: string;
  conversationCount: number;
  onRecipientChange: (userId: string) => void;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  thread: DmMessage[];
}

const DmPanel = ({
  users,
  currentUserId,
  selectedRecipientId,
  dmBody,
  conversationCount,
  onRecipientChange,
  onBodyChange,
  onSend,
  onTextareaKeyDown,
  thread,
}: DmPanelProps) => (
  <section className="main__view" aria-label="Direct messages">
    <article className="card dm-panel">
      <header className="dm-panel__header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h3>Direct messages</h3>
          <p className="muted">Stay in sync with teammates instantly.</p>
        </div>
        <div className="dm-panel__stats">
          <div>
            <span className="stat-label">Messages</span>
            <strong>{thread.length}</strong>
          </div>
          <div>
            <span className="stat-label">Conversations</span>
            <strong>{conversationCount}</strong>
          </div>
        </div>
      </header>
      <div className="dm-panel__layout">
        <aside className="dm-panel__compose">
          <div className="dm-recipient-field">
            <label htmlFor="dm-recipient">Conversation with</label>
            <select
              id="dm-recipient"
              value={selectedRecipientId}
              onChange={(event) => onRecipientChange(event.target.value)}
            >
              <option value="">Select teammate</option>
              {users
                .filter((teammate) => teammate.id !== currentUserId)
                .map((teammate) => (
                  <option key={teammate.id} value={teammate.id}>
                    {teammate.displayName}
                  </option>
                ))}
            </select>
          </div>
          <form
            className="dm-message-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <label className="dm-message-label" htmlFor="dm-message">
              Message
            </label>
            <div className="dm-message-row">
              <textarea
                id="dm-message"
                rows={4}
                value={dmBody}
                onChange={(event) => onBodyChange(event.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder="Share a quick update or hand off a ticket"
                disabled={!selectedRecipientId}
              />
              <button
                className="primary-pill"
                type="submit"
                disabled={!selectedRecipientId || !dmBody.trim()}
              >
                Send
              </button>
            </div>
          </form>
          <p className="dm-hint">
            Tip: mention ticket numbers or @ teammates to keep everyone aligned.
          </p>
        </aside>
        <section className="dm-panel__thread">
          {selectedRecipientId && thread.length ? (
            <div className="dm-thread">
              {thread.map((message, index) => (
                <article
                  key={message.id}
                  className={index % 2 ? "bubble-alt" : "bubble"}
                >
                  <header>
                    <strong>{message.senderName}</strong>
                    <small>{new Date(message.createdAt).toLocaleString()}</small>
                  </header>
                  <p>{message.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="dm-empty">
              <h4>No direct messages yet</h4>
              <p className="muted">Pick a teammate and say hello.</p>
            </div>
          )}
        </section>
      </div>
    </article>
  </section>
);

export default DmPanel;

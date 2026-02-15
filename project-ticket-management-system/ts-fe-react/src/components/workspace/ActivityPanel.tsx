import clsx from "clsx";
import { NotificationItem } from "../../types/api";

interface ActivityPanelProps {
  notifications: NotificationItem[];
  unreadCount: number;
  onOpenTicket: (notification: NotificationItem) => void;
}

const ActivityPanel = ({ notifications, unreadCount, onOpenTicket }: ActivityPanelProps) => (
  <section className="main__view" aria-label="Activity">
    <article className="card activity-panel">
      <header className="section-heading">
        <h3>Notifications</h3>
        <span className="badge">{unreadCount} unread</span>
      </header>
      <ul>
        {notifications.length ? (
          notifications.map((notification) => (
            <li key={notification.id} className={clsx({ unread: !notification.isRead })}>
              <strong>{notification.ticketNumber}</strong>
              <p>{notification.message}</p>
              {notification.ticketId && (
                <div className="notification-actions">
                  <button
                    type="button"
                    className="link-button outline"
                    onClick={() => onOpenTicket(notification)}
                  >
                    Open ticket
                  </button>
                </div>
              )}
            </li>
          ))
        ) : (
          <li className="muted">You're all caught up!</li>
        )}
      </ul>
    </article>
  </section>
);

export default ActivityPanel;

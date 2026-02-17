import { DashboardEntry } from "../../types/api";
import type { DashboardRange } from "../../context/WorkspaceContext";

interface DashboardViewProps {
  entries: DashboardEntry[];
  range: DashboardRange;
  startDate: string | null;
  endDate: string | null;
  canEditUsers: boolean;
  searchQuery: string;
  onRangeChange: (value: DashboardRange) => void;
  onDateChange: (type: "start" | "end", value: string | null) => void;
  onSearchChange: (value: string) => void;
  onEditUser: (userId: string) => void;
}

const DashboardView = ({
  entries,
  range,
  startDate,
  endDate,
  canEditUsers,
  searchQuery,
  onRangeChange,
  onDateChange,
  onSearchChange,
  onEditUser,
}: DashboardViewProps) => (
  <section className="main__view" aria-label="Dashboard">
    <section className="card dashboard-controls">
      <div>
        <label>
          Range
          <select value={range} onChange={(event) => onRangeChange(event.target.value as DashboardRange)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          Search users
          <input
            type="search"
            placeholder="Filter by name"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      {range === "custom" && (
        <div className="custom-range">
          <label>
            Start
            <input
              type="date"
              value={startDate || ""}
              onChange={(event) => onDateChange("start", event.target.value || null)}
            />
          </label>
          <label>
            End
            <input
              type="date"
              value={endDate || ""}
              onChange={(event) => onDateChange("end", event.target.value || null)}
            />
          </label>
        </div>
      )}
    </section>
    {entries.length ? (
      <section className="dashboard-grid">
        {entries.map((entry) => (
          <article key={entry.id} className="card dashboard-card">
            <header>
              <div>
                <h3>{entry.displayName}</h3>
                <p>{entry.openCount + entry.inProgressCount + entry.archivedCount} tickets</p>
              </div>
              {canEditUsers && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onEditUser(entry.id)}
                  aria-label="Edit user"
                >
                  ✎
                </button>
              )}
            </header>
            <ul>
              <li>
                <span>Fixed (archived)</span>
                <strong>{entry.archivedCount}</strong>
              </li>
              <li>
                <span>In progress</span>
                <strong>{entry.inProgressCount}</strong>
              </li>
              <li>
                <span>Open</span>
                <strong>{entry.openCount}</strong>
              </li>
              <li>
                <span>Estimated hrs</span>
                <strong>{entry.estimatedTotal.toFixed(1)}</strong>
              </li>
              <li>
                <span>Actual hrs</span>
                <strong>{entry.actualTotal.toFixed(1)}</strong>
              </li>
            </ul>
          </article>
        ))}
      </section>
    ) : (
      <section className="card empty-detail">
        <h3>No data yet</h3>
        <p className="muted">Start assigning tickets to see the dashboard populate.</p>
      </section>
    )}
  </section>
);

export default DashboardView;

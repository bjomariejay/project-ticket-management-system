import { useMemo, useState } from "react";
import { DashboardEntry, Project, Ticket } from "../../types/api";
import type { DashboardRange } from "../../context/WorkspaceContext";

const dashboardTabs = [
  { id: "users", label: "User overview" },
  { id: "tasks", label: "Task overview" },
] as const;

type DashboardTab = (typeof dashboardTabs)[number]["id"];

interface DashboardViewProps {
  entries: DashboardEntry[];
  projects: Project[];
  tickets: Ticket[];
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
  projects,
  tickets,
  range,
  startDate,
  endDate,
  canEditUsers,
  searchQuery,
  onRangeChange,
  onDateChange,
  onSearchChange,
  onEditUser,
}: DashboardViewProps) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>("users");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const filteredTickets = useMemo(() => {
    const projectFiltered =
      selectedProjectId === "all"
        ? tickets
        : tickets.filter((ticket) => ticket.projectId === selectedProjectId);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projectFiltered;
    return projectFiltered.filter((ticket) =>
      `${ticket.ticketNumber} ${ticket.title}`.toLowerCase().includes(query),
    );
  }, [searchQuery, selectedProjectId, tickets]);

  const ticketSummary = useMemo(() => {
    return filteredTickets.reduce(
      (acc, ticket) => {
        switch (ticket.status) {
          case "open":
            acc.statuses.open += 1;
            break;
          case "in_progress":
            acc.statuses.in_progress += 1;
            break;
          case "archived":
            acc.statuses.archived += 1;
            break;
          default:
            acc.statuses.other += 1;
        }
        acc.total += 1;
        acc.estimated += ticket.estimatedHours || 0;
        acc.actual += ticket.actualHours || 0;
        return acc;
      },
      {
        total: 0,
        estimated: 0,
        actual: 0,
        statuses: {
          open: 0,
          in_progress: 0,
          archived: 0,
          other: 0,
        },
      },
    );
  }, [filteredTickets]);

  const tasksLeft = ticketSummary.statuses.open + ticketSummary.statuses.in_progress;

  const percentRemaining = useMemo(() => {
    if (!ticketSummary.total) return 0;
    return Math.round((tasksLeft / ticketSummary.total) * 100);
  }, [tasksLeft, ticketSummary.total]);

  const percentComplete = useMemo(() => {
    return ticketSummary.total ? 100 - percentRemaining : 0;
  }, [percentRemaining, ticketSummary.total]);

  const projectTicketStats = useMemo(() => {
    const stats = filteredTickets.reduce<Record<string, { projectName: string; projectId: string; created: number; archived: number; active: number }>>(
      (acc, ticket) => {
        if (!acc[ticket.projectId]) {
          const projectName =
            projects.find((project) => project.id === ticket.projectId)?.name || "Unknown project";
          acc[ticket.projectId] = {
            projectId: ticket.projectId,
            projectName,
            created: 0,
            archived: 0,
            active: 0,
          };
        }
        const projectStats = acc[ticket.projectId];
        projectStats.created += 1;
        if (ticket.status === "archived") {
          projectStats.archived += 1;
        } else {
          projectStats.active += 1;
        }
        return acc;
      },
      {},
    );
    return Object.values(stats).sort((a, b) => b.created - a.created);
  }, [filteredTickets, projects]);

  const maxGraphValue = useMemo(() => {
    if (!projectTicketStats.length) return 1;
    const maxValue = projectTicketStats.reduce((max, stat) => {
      return Math.max(max, stat.created, stat.archived);
    }, 1);
    return maxValue || 1;
  }, [projectTicketStats]);

  const recentTickets = useMemo(() => {
    return [...filteredTickets]
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 8);
  }, [filteredTickets]);

  const searchPlaceholder =
    activeTab === "users" ? "Search name" : "Search ticket title or number";

  const formatStatus = (status: Ticket["status"]) => {
    switch (status) {
      case "open":
        return "Open";
      case "in_progress":
        return "In progress";
      case "archived":
        return "Archived";
      default:
        return status.replace(/_/g, " ");
    }
  };

  const formatPriority = (priority: Ticket["priority"]) =>
    priority === "priority" ? "High" : "Normal";

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const renderUserOverview = () =>
    entries.length ? (
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
    );

  const renderTaskOverview = () => (
    <div className="task-overview">
      <article className="card task-list">
        <header>
          <div>
            <h3>Recent tasks</h3>
            <p className="muted">
              Showing {recentTickets.length} of {filteredTickets.length}
            </p>
          </div>
        </header>
        {recentTickets.length ? (
          <ul className="task-rows">
            {recentTickets.map((ticket) => (
              <li key={ticket.id} className="task-row">
                <div>
                  <strong>{ticket.ticketNumber}</strong>
                  <p>{ticket.title}</p>
                  <small className="muted">Updated {formatDate(ticket.updatedAt)}</small>
                </div>
                <div className="task-row__meta">
                  <span className={`status-pill status-${ticket.status}`}>
                    {formatStatus(ticket.status)}
                  </span>
                  <span className={`priority-pill priority-${ticket.priority}`}>
                    {formatPriority(ticket.priority)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No tasks found for this filter.</p>
        )}
      </article>
      <article className="card task-summary">
        <header>
          <div>
            <h3>Task snapshot</h3>
            <p className="muted">Live breakdown of workspace tickets</p>
          </div>
        </header>
        <div className="task-summary__highlight">
          <span>Tasks left to finish</span>
          <strong>{tasksLeft}</strong>
          <p className="muted">
            {ticketSummary.total
              ? `${percentRemaining}% of tasks still unfinished`
              : "No tickets tracked yet"}
          </p>
          <div className="task-progress">
            <div className="task-progress__bar" aria-hidden>
              <span style={{ width: `${percentComplete}%` }} />
            </div>
            <small className="muted">{percentComplete}% complete</small>
          </div>
        </div>
        <div className="task-summary__grid">
          <div>
            <span>Total tasks</span>
            <strong>{ticketSummary.total}</strong>
          </div>
          <div>
            <span>Open</span>
            <strong>{ticketSummary.statuses.open}</strong>
          </div>
          <div>
            <span>In progress</span>
            <strong>{ticketSummary.statuses.in_progress}</strong>
          </div>
          <div>
            <span>Archived</span>
            <strong>{ticketSummary.statuses.archived}</strong>
          </div>
          {ticketSummary.statuses.other > 0 && (
            <div>
              <span>Other</span>
              <strong>{ticketSummary.statuses.other}</strong>
            </div>
          )}
        </div>
        <div className="task-summary__totals">
          <div>
            <span>Estimated hours</span>
            <strong>{ticketSummary.estimated.toFixed(1)}</strong>
          </div>
          <div>
            <span>Actual hours</span>
            <strong>{ticketSummary.actual.toFixed(1)}</strong>
          </div>
        </div>
        <section className="project-graph">
          <header>
            <div>
              <h3>Project throughput</h3>
              <p className="muted">Created vs archived tasks per project</p>
            </div>
          </header>
          {projectTicketStats.length ? (
            <ul>
              {projectTicketStats.map((project) => (
                <li key={project.projectId} className="project-graph__row">
                  <div>
                    <strong>{project.projectName}</strong>
                    <small className="muted">
                      {project.active} left · {project.archived} archived
                    </small>
                  </div>
                  <div className="project-graph__bars">
                    <div
                      className="bar created"
                      style={{ width: `${(project.created / maxGraphValue) * 100}%` }}
                    >
                      <span>{project.created}</span>
                    </div>
                    <div
                      className="bar archived"
                      style={{ width: `${(project.archived / maxGraphValue) * 100}%` }}
                    >
                      <span>{project.archived}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No project data for this filter.</p>
          )}
        </section>
      </article>
    </div>
  );

  return (
    <section className="main__view" aria-label="Dashboard">
      <section className="card dashboard-controls">
        <div className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "users" && (
          <div>
            <label>
              Range
              <select
                value={range}
                onChange={(event) => onRangeChange(event.target.value as DashboardRange)}
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
          </div>
        )}
        <div>
          <label>
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </div>
        {activeTab === "tasks" && (
          <div>
            <label>
              Project
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="all">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {activeTab === "users" && range === "custom" && (
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
      {activeTab === "users" ? renderUserOverview() : renderTaskOverview()}
    </section>
  );
};

export default DashboardView;

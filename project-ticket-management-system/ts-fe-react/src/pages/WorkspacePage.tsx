import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import clsx from "clsx";
import Loader from "../components/Loader";
import ActivityPanel from "../components/workspace/ActivityPanel";
import DashboardView from "../components/workspace/DashboardView";
import DashboardTicketModal from "../components/workspace/DashboardTicketModal";
import DmPanel from "../components/workspace/DmPanel";
import TabContent from "../components/workspace/TabContent";
import UserSettingsModal from "../components/workspace/UserSettingsModal";
import AdminEditModal from "../components/workspace/AdminEditModal";
import ProjectEditorModal from "../components/workspace/ProjectEditorModal";
import CreateTicketModal from "../components/workspace/CreateTicketModal";
import CreateProjectModal from "../components/workspace/CreateProjectModal";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import { NotificationItem, Ticket, User } from "../types/api";

const ticketCategoryConfig = [
  { key: "open", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "archived", label: "Archived" },
] as const;

const WorkspacePage = () => {
  const { user, logout } = useAuth();
  const {
    state,
    setTicketSearch,
    setMessageDraft,
    setActiveTab,
    selectProject,
    toggleProjectsCollapsed,
    selectTicket,
    updateCreateProjectField,
    updateProjectEditorField,
    updateCreateTicketField,
    updateDmFormField,
    createProject,
    saveProjectEditor,
    createTicket,
    postTicketMessage,
    sendDm,
    startTicket,
    handleAssign,
    updateTicketReviewer,
    updateTicketEstimate,
    updateTicketActualTime,
    quickUpdateTicket,
    handleJoinTicket,
    handleArchiveTicket,
    handlePrivacyChange,
    restoreArchivedTicket,
    handleDashboardRangeChange,
    handleDashboardDateChange,
    handleUserWorkLogSearchChange,
    handleUserWorkLogRangeChange,
    handleUserWorkLogDateChange,
    refreshUserWorkLogs,
    handleDmRecipientChange,
    markNotification,
    navigateToNotification,
    openUserSettings,
    closeUserSettings,
    saveUserSettings,
    updateUserSettingsField,
    openCreateProject,
    closeCreateProject,
    openProjectEditor,
    closeProjectEditor,
    removeProject,
    openCreateTicket,
    closeCreateTicket,
    handleGlobalReportView,
    handleReviewerReportView,
    closeProjectReports,
    updateUserInfo,
  } = useWorkspace();

  const {
    workspaceLabel,
    users,
    projects,
    tickets,
    dashboard,
    userWorkLogs,
    notifications,
    dms,
    selectedProjectId,
    expandedProjectId,
    selectedTicket,
    lockedTicket,
    activeTab,
    ticketSearch,
    messageDraft,
    createTicketModel,
    createProjectModel,
    dmForm,
    selectedDmRecipientId,
    feedback,
    hasDmAttention,
    hasActivityAttention,
    isBootstrapping,
    isLoadingTickets,
    isPostingMessage,
    dashboardRange,
    dashboardStartDate,
    dashboardEndDate,
    userWorkLogRange,
    userWorkLogSearch,
    userWorkLogStartDate,
    userWorkLogEndDate,
    userWorkLogLoading,
    projectsCollapsed,
    showUserSettings,
    showCreateProject,
    showCreateTicket,
    showProjectEditor,
    projectReportEntries,
    viewingReportsForProjectId,
    viewingReportsForProjectName,
    projectReportsLoading,
    isGlobalReportView,
    isReviewerReportView,
    hasUnseenGlobalReports,
    reviewerTickets,
    userSettingsForm,
    userSettingsError,
    userSettingsSaving,
    projectEditorModel,
    projectEditorSaving,
    projectEditorDeleting,
  } = state;

  const [adminEditUser, setAdminEditUser] = useState<User | null>(null);
  const [adminEditForm, setAdminEditForm] = useState({
    displayName: "",
    handle: "",
    location: "",
  });
  const [adminEditError, setAdminEditError] = useState("");
  const [adminEditSaving, setAdminEditSaving] = useState(false);

  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardTicketToEdit, setDashboardTicketToEdit] =
    useState<Ticket | null>(null);
  const [dashboardTicketSaving, setDashboardTicketSaving] = useState(false);
  const [dashboardTicketError, setDashboardTicketError] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<User[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [mentionRange, setMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [slashRange, setSlashRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const filteredTickets = useMemo(() => {
    const search = ticketSearch.trim().toLowerCase();
    if (!search) return tickets;
    return tickets.filter((ticket) => {
      const haystack =
        `${ticket.ticketNumber} ${ticket.title} ${ticket.status}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [ticketSearch, tickets]);

  const isTicketMember = useMemo(() => {
    if (!selectedTicket || !user?.id) return false;
    if (typeof selectedTicket.viewerIsMember === "boolean") {
      return selectedTicket.viewerIsMember;
    }
    return selectedTicket.members.some((member) => member.userId === user.id);
  }, [selectedTicket, user?.id]);

  const ticketSearchResults = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    if (!query) return [] as Array<{ ticket: Ticket; matches: string[] }>;
    return tickets
      .map((ticket) => {
        const matches: string[] = [];
        if (ticket.ticketNumber.toLowerCase().includes(query)) {
          matches.push(`Matches ticket number ${ticket.ticketNumber}`);
        }
        if (ticket.title.toLowerCase().includes(query)) {
          matches.push(`Title contains "${ticket.title}"`);
        }
        if (ticket.description?.toLowerCase().includes(query)) {
          matches.push("Matches description");
        }
        return matches.length ? { ticket, matches } : null;
      })
      .filter((value): value is { ticket: Ticket; matches: string[] } =>
        Boolean(value),
      )
      .slice(0, 5);
  }, [ticketSearch, tickets]);

  const filteredDashboardEntries = useMemo(() => {
    const search = dashboardSearch.trim().toLowerCase();
    if (!search) return dashboard;
    return dashboard.filter((entry) =>
      entry.displayName.toLowerCase().includes(search),
    );
  }, [dashboard, dashboardSearch]);

  const ticketGroups = useMemo(() => {
    if (!selectedProjectId)
      return [] as Array<{ key: string; label: string; items: Ticket[] }>;
    return ticketCategoryConfig.map((category) => ({
      ...category,
      items: filteredTickets.filter(
        (ticket) =>
          ticket.projectId === selectedProjectId &&
          ticket.status === category.key,
      ),
    }));
  }, [filteredTickets, selectedProjectId]);

  const reviewerTicketCount = useMemo(() => {
    if (!user?.id) return 0;
    return tickets.filter(
      (ticket) =>
        ticket.reviewerId === user.id && ticket.status === "in_progress",
    ).length;
  }, [tickets, user?.id]);

  const selectedDmThread = useMemo(() => {
    if (!selectedDmRecipientId || !user?.id) return [];
    return dms
      .filter(
        (dm) =>
          (dm.senderId === user.id &&
            dm.recipientId === selectedDmRecipientId) ||
          (dm.senderId === selectedDmRecipientId && dm.recipientId === user.id),
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  }, [dms, selectedDmRecipientId, user?.id]);

  const assigneeUsername = useMemo(() => {
    if (!selectedTicket?.assigneeId) return "";
    const teammate = users.find(
      (candidate) => candidate.id === selectedTicket.assigneeId,
    );
    if (teammate?.username) return teammate.displayName;
    if (teammate?.handle) return teammate.handle;
    const member = selectedTicket.members.find(
      (entry) => entry.userId === selectedTicket.assigneeId,
    );
    if (member?.username) return member.displayName;
    if (member?.handle) return member.handle;
    return member?.displayName || "";
  }, [selectedTicket, users]);

  const reviewerName = useMemo(() => {
    if (!selectedTicket?.reviewerId) return "";
    const teammate = users.find(
      (candidate) => candidate.id === selectedTicket.reviewerId,
    );
    if (teammate?.displayName) return teammate.displayName;
    if (teammate?.handle) return teammate.handle;
    const member = selectedTicket.members.find(
      (entry) => entry.userId === selectedTicket.reviewerId,
    );
    if (member?.displayName) return member.displayName;
    if (member?.handle) return member.handle;
    return member?.username || "";
  }, [selectedTicket, users]);

  const formatEstimatedHours = (value?: number | null) => {
    if (value === null || value === undefined) return "—";
    const totalMinutes = Math.round(value * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours) {
      parts.push(`${hours}h`);
    }
    if (minutes) {
      parts.push(`${minutes}m`);
    }
    if (!parts.length) {
      return "0m";
    }
    return parts.join(" ");
  };

  const handleProjectSubmit = (event: FormEvent) => {
    event.preventDefault();
    void createProject();
  };

  const handleTicketSubmit = (event: FormEvent) => {
    event.preventDefault();
    void createTicket();
  };

  const submitMessage = () => {
    const payload = messageDraft.trim();
    if (!payload) return;
    if (payload === "/start") {
      void startTicket();
      return;
    }
    if (payload === "/archive") {
      void handleArchiveTicket();
      return;
    }
    const reviewerCommand = payload.match(/^\/r-@([a-z0-9._-]+)$/i);
    if (reviewerCommand) {
      const targetUsername = reviewerCommand[1].toLowerCase();
      const targetUser = users.find(
        (candidate) => candidate.username?.toLowerCase() === targetUsername,
      );
      if (targetUser) {
        setMessageDraft("");
        setShowSlashSuggestions(false);
        setSlashRange(null);
        void updateTicketReviewer(targetUser.id);
      } else {
        console.warn(`Reviewer username ${targetUsername} not found`);
      }
      return;
    }
    const estimateMatch = payload.match(/^\/e[-\s]?([0-9]+(?:\.[0-9]+)?)$/i);
    if (estimateMatch) {
      const hours = Number(estimateMatch[1]);
      if (!Number.isNaN(hours)) {
        setMessageDraft("");
        setShowSlashSuggestions(false);
        setSlashRange(null);

        console.log("estimated time: ", hours);
        void updateTicketEstimate(hours);
      }
      return;
    }

    const actualMatch = payload.match(/^\/a[-\s]?([0-9]+(?:\.[0-9]+)?)$/i);
    if (actualMatch) {
      const hours = Number(actualMatch[1]);
      if (!Number.isNaN(hours)) {
        setMessageDraft("");
        setShowSlashSuggestions(false);
        setSlashRange(null);

        console.log("actual time: ", hours);
        void updateTicketActualTime(hours);
      }
      return;
    }

    const assignMatch = payload.match(/^\/a-@?([\w.-]+)$/i);
    if (assignMatch) {
      const identifier = assignMatch[1].toLowerCase();
      const targetUser = users.find((candidate) => {
        const username = candidate.username?.toLowerCase();
        const handle = candidate.handle?.toLowerCase();
        return username === identifier || handle === identifier;
      });
      if (targetUser) {
        setMessageDraft("");
        setShowSlashSuggestions(false);
        setSlashRange(null);
        void handleAssign(targetUser.id);
      }
      return;
    }
    void postTicketMessage();
  };

  const handleMessageSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitMessage();
  };

  const handleDmSend = () => {
    void sendDm();
  };

  const handleDmTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (!dmForm.recipientId || !dmForm.body.trim()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    void sendDm();
  };

  const handleReportTicketNavigate = (ticketNumber: string) => {
    const targetTicket = tickets.find(
      (ticketItem) => ticketItem.ticketNumber === ticketNumber,
    );
    if (!targetTicket) return;

    closeProjectReports();
    setActiveTab("home");
    void selectTicket(targetTicket.id);
  };

  const openAdminEdit = (targetUserId: string) => {
    const target = users.find((item) => item.id === targetUserId);
    if (!target) return;
    setAdminEditUser(target);
    setAdminEditForm({
      displayName: target.displayName,
      handle: target.handle,
      location: target.location || "",
    });
    setAdminEditError("");
  };

  const closeAdminEdit = () => {
    setAdminEditUser(null);
    setAdminEditForm({ displayName: "", handle: "", location: "" });
    setAdminEditError("");
    setAdminEditSaving(false);
  };

  const handleAdminFieldChange = (
    field: keyof typeof adminEditForm,
    value: string,
  ) => {
    setAdminEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdminSave = async () => {
    if (!adminEditUser) return;
    const trimmedName = adminEditForm.displayName.trim();
    const trimmedHandle = adminEditForm.handle.trim();
    const trimmedLocation = adminEditForm.location.trim();
    const payload: {
      displayName?: string;
      handle?: string;
      location?: string | null;
    } = {};
    if (trimmedName && trimmedName !== adminEditUser.displayName) {
      payload.displayName = trimmedName;
    }
    if (trimmedHandle && trimmedHandle !== adminEditUser.handle) {
      payload.handle = trimmedHandle;
    }
    if (trimmedLocation !== (adminEditUser.location || "")) {
      payload.location = trimmedLocation || null;
    }
    if (!Object.keys(payload).length) {
      setAdminEditError("No changes to save.");
      return;
    }
    setAdminEditSaving(true);
    setAdminEditError("");
    try {
      await updateUserInfo(adminEditUser.id, payload);
      closeAdminEdit();
    } catch (error: any) {
      console.error("Unable to update user", error);
      setAdminEditError(
        error?.response?.data?.message || "Unable to update user.",
      );
    } finally {
      setAdminEditSaving(false);
    }
  };

  const getUserName = (userId?: string | null) => {
    if (!userId) return "Unassigned";
    return users.find((item) => item.id === userId)?.displayName || "Unknown";
  };

  const buildSlashSuggestions = () => {
    return [
      "/start",
      "/archive",
      "/a-@username",
      "/e-time",
      "/r-@username",
      "/a-time",
    ];
  };

  const isDmNotification = (notification: NotificationItem) => {
    if (notification.ticketId) return false;
    const message = notification.message?.toLowerCase() || "";
    return message.includes("sent you a dm");
  };

  const activityNotifications = useMemo(() => {
    return notifications.filter(
      (notification) => !isDmNotification(notification),
    );
  }, [notifications]);

  const activityUnreadCount = useMemo(() => {
    return activityNotifications.filter((notification) => !notification.isRead)
      .length;
  }, [activityNotifications]);

  // console.log("Activity unread count:", activityUnreadCount);
  const showActivityTabAlert =
    activeTab !== "activity" &&
    (hasActivityAttention || activityUnreadCount > 0);

  const headerTitle = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return "Dashboard overview";
      case "home":
        return selectedProjectId
          ? projects.find((p) => p.id === selectedProjectId)?.name || "Projects"
          : "Projects";
      case "dms":
        return "Direct messages";
      case "activity":
        return "Activity";
      default:
        return workspaceLabel;
    }
  }, [activeTab, selectedProjectId, projects, workspaceLabel]);

  const headerSubtitle = useMemo(() => {
    if (activeTab === "home") {
      return `Workspace: ${workspaceLabel}`;
    }
    if (user) {
      return `Signed in as ${user.displayName} - @${user.handle}`;
    }
    return workspaceLabel;
  }, [activeTab, user, workspaceLabel]);

  const renderHome = () => (
    <section className="main__view home-view" aria-label="Home">
      <div className="home-layout">
        <section className="home-layout__left">
          <article className="card home-card workspace-board">
            <section className="space-section">
              <div className="space-section__actions">
                <button
                  className="link-button outline"
                  type="button"
                  onClick={openCreateProject}
                >
                  + Project
                </button>
                <button
                  className="link-button outline"
                  type="button"
                  onClick={openCreateTicket}
                >
                  + Ticket
                </button>
              </div>
              <div className="space-section__header">
                <h4>Projects</h4>
                <span className="muted">{projects.length} active</span>
                <button
                  type="button"
                  className="collapse-btn"
                  onClick={toggleProjectsCollapsed}
                >
                  {projectsCollapsed ? "▶" : "▼"}
                </button>
              </div>
              <div
                className={clsx("project-panel", {
                  "is-collapsed": projectsCollapsed,
                })}
              >
                <div className="project-list">
                  {projects.map((project) => (
                    <div key={project.id} className="project-item">
                      <div className="project-row">
                        <button
                          type="button"
                          className={clsx("project-main", {
                            active: selectedProjectId === project.id,
                          })}
                          onClick={() => selectProject(project.id)}
                        >
                          <div>
                            <strong>{project.name}</strong>
                            <small>{project.ticketPrefix}</small>
                          </div>
                          <span className="project-number">
                            {
                              tickets.filter(
                                (ticket) =>
                                  ticket.projectId === project.id &&
                                  ticket.status !== "archived",
                              ).length
                            }
                          </span>
                        </button>
                        <button
                          type="button"
                          className="project-edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProjectEditor(project.id);
                          }}
                          aria-label={`Edit ${project.name}`}
                          title="Edit project"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.17H5v-.92l9.06-9.06.92.92-9.06 9.06zM20.71 7.04a1 1 0 000-1.42l-2.34-2.34a1 1 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
                          </svg>
                        </button>
                      </div>
                      {expandedProjectId === project.id && (
                        <div className="project-ticket-groups">
                          {ticketGroups.map((group) => (
                            <div
                              key={group.key}
                              className="project-ticket-group"
                            >
                              <header>
                                <strong>{group.label}</strong>
                                <span className="badge">
                                  {group.items.length}
                                </span>
                              </header>
                              <ul>
                                {group.items.length ? (
                                  group.items.map((ticket) => (
                                    <li key={ticket.id}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void selectTicket(ticket.id)
                                        }
                                      >
                                        <div>
                                          <strong>
                                            {ticket.ticketNumber} ·{" "}
                                          </strong>
                                        </div>
                                        <span
                                          className={clsx(
                                            "status",
                                            ticket.status,
                                          )}
                                        >
                                          {ticket.status.replace("_", " ") === 'open' ? <>new</> : ticket.status.replace("_", " ")
                                          }
                                        </span>
                                      </button>
                                    </li>
                                  ))
                                ) : (
                                  <li className="muted">No tickets</li>
                                )}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="project-item report-project">
                    <button
                      type="button"
                      className={clsx("project-main", {
                        active: isGlobalReportView,
                        "has-updates": hasUnseenGlobalReports,
                      })}
                      onClick={() => void handleGlobalReportView()}
                    >
                      <div>
                        <strong>Report of work</strong>
                      </div>
                      <span className="project-number">View</span>
                    </button>
                  </div>
                  <div className="project-item report-project">
                    <button
                      type="button"
                      className={clsx("project-main", {
                        active: isReviewerReportView,
                      })}
                      onClick={() => void handleReviewerReportView()}
                    >
                      <div>
                        <strong>Reviewer reports</strong>
                      </div>
                      <span className="project-number">
                        {reviewerTicketCount}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </article>
        </section>
        <section className="home-layout__right">
          {viewingReportsForProjectId ? (
            isReviewerReportView ? (
              <section className="card reviewer-reports">
                {projectReportsLoading ? (
                  <p className="muted">Loading reports…</p>
                ) : null}
                {reviewerTickets.length > 0 ? (
                  <div className="table-wrapper">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Ticket</th>
                          <th>Created</th>
                          <th>Handled by</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewerTickets.map((ticket) => (
                          <tr key={ticket.id}>
                            <td>
                              <strong>{ticket.ticketNumber}</strong>
                            </td>
                            <td>
                              <span className="muted">
                                {new Date(ticket.createdAt).toLocaleString()}
                              </span>
                            </td>
                            <td>{getUserName(ticket.assigneeId)}</td>
                            <td>
                              <button
                                type="button"
                                className="report-ticket-link"
                                onClick={() =>
                                  handleReportTicketNavigate(ticket.ticketNumber)
                                }
                              >
                                View ticket
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No reviewer tickets available.</p>
                )}
              </section>
            ) : (
              <section className="card project-reports">
                {projectReportsLoading ? (
                  <p className="muted">Loading reports…</p>
                ) : projectReportEntries.length === 0 ? (
                  <p className="muted">No ticket starts recorded yet.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Ticket</th>
                          <th>Created</th>
                          <th>Handled by</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectReportEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <strong>{entry.ticketNumber}</strong>
                            </td>
                            <td>
                              <span className="muted">
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </td>
                            <td>{entry.actorName || "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="report-ticket-link"
                                onClick={() =>
                                  handleReportTicketNavigate(entry.ticketNumber)
                                }
                              >
                                View ticket
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          ) : (
            <article className="card ticket-panel">
              {selectedTicket ? (
                <article className="ticket-detail">
                  <header>
                    <h3>
                      {selectedTicket.ticketNumber} · {selectedTicket.title}
                    </h3>
                    <span className={clsx("status", selectedTicket.status)}>
                      {selectedTicket.status.replace("_", " ")}
                    </span>
                  </header>
                  <p>
                    {selectedTicket.description || "No description provided."}
                  </p>
                  <section className="ticket-info">
                    <div>
                      <label>Assignee</label>
                      <p>
                        <span className="assignee-badge">
                          {assigneeUsername || "Unassigned"}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label>Reviewer</label>
                      <p>
                        <span className="assignee-badge">
                          {reviewerName || "Unassigned"}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label>Privacy</label>
                      <p>
                        <span
                          className={clsx(
                            "privacy-badge",
                            selectedTicket.privacy,
                          )}
                        >
                          {selectedTicket.privacy}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label>Estimated hrs</label>
                      <p>
                        <span className="estimated-badge">
                          {formatEstimatedHours(selectedTicket.estimatedHours)}
                        </span>
                      </p>
                    </div>
                  </section>
                  <section
                    className="ticket-members"
                    style={{ display: "inline-block" }}
                  >
                    <label>Partcipants: </label>

                    {selectedTicket.members.map((member, index) => (
                      <label key={member.userId || index}>
                        {member.displayName}
                        {index !== selectedTicket.members.length - 1 && ", "}
                      </label>
                    ))}
                  </section>
                  {isTicketMember ? (
                    selectedTicket.status === "archived" ? (
                      <section className="card join-card">
                        <p className="muted">
                          This ticket is archived. Unarchive to continue
                          collaborating.
                        </p>
                        <button
                          type="button"
                          onClick={() => void restoreArchivedTicket()}
                        >
                          Unarchive ticket
                        </button>
                      </section>
                    ) : (
                      <section className="ticket-thread">
                        <h4>Messages</h4>
                        <div className="message-list">
                          {selectedTicket.messages.map((message) => {
                            const isViewer =
                              message.displayName === user?.displayName;
                            return (
                              <article
                                key={message.id}
                                className={clsx("message-item", {
                                  "message-item--viewer": isViewer,
                                  "message-item--teammate": !isViewer,
                                })}
                              >
                                <header>
                                  <strong>
                                    {message.displayName || "Unknown user"}
                                  </strong>
                                  <small>
                                    {new Date(
                                      message.createdAt,
                                    ).toLocaleString()}
                                  </small>
                                </header>
                                <p>{message.body}</p>
                              </article>
                            );
                          })}
                        </div>
                        <form
                          onSubmit={handleMessageSubmit}
                          className="message-form"
                        >
                          <div className="message-input">
                            <textarea
                              rows={3}
                              value={messageDraft}
                              placeholder="Write an update…"
                              onChange={(event) =>
                                setMessageDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  submitMessage();
                                }
                              }}
                              onInput={(event) => {
                                const target =
                                  event.target as HTMLTextAreaElement;
                                const caretIndex =
                                  target.selectionStart ?? target.value.length;
                                const before = target.value.slice(
                                  0,
                                  caretIndex,
                                );
                                const slashMatch =
                                  before.match(/(?:^|\s)\/([\w]*)$/);
                                if (slashMatch) {
                                  setSlashSuggestions(buildSlashSuggestions());
                                  setSlashRange({
                                    start: caretIndex - slashMatch[0].length,
                                    end: caretIndex,
                                  });
                                  setShowSlashSuggestions(true);
                                } else {
                                  setSlashRange(null);
                                  setShowSlashSuggestions(false);
                                }
                                const mentionMatch =
                                  before.match(/(?:^|\s)@([\w-]*)$/i);
                                if (mentionMatch) {
                                  const query = mentionMatch[1].toLowerCase();
                                  const suggestions = users.filter(
                                    (u) =>
                                      u.username
                                        .toLowerCase()
                                        .includes(query) ||
                                      u.handle.toLowerCase().includes(query),
                                  );
                                  setMentionRange({
                                    start: caretIndex - mentionMatch[0].length,
                                    end: caretIndex,
                                  });
                                  setMentionSuggestions(
                                    suggestions.slice(0, 5),
                                  );
                                  setShowMentionSuggestions(
                                    suggestions.length > 0,
                                  );
                                } else {
                                  setMentionRange(null);
                                  setShowMentionSuggestions(false);
                                }
                              }}
                            />
                            {showMentionSuggestions &&
                              mentionSuggestions.length > 0 && (
                                <div className="mention-suggestions">
                                  {mentionSuggestions.map((suggestion) => {
                                    const username =
                                      suggestion.username?.trim();
                                    const handle = suggestion.handle?.trim();

                                    // Skip if both are empty
                                    // if (username === user?.username) return null;
                                    const normalized = username || handle;
                                    const insertion = `@${normalized} `;

                                    return (
                                      <button
                                        type="button"
                                        key={suggestion.id}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          if (mentionRange) {
                                            const before = messageDraft.slice(
                                              0,
                                              mentionRange.start,
                                            );
                                            const after = messageDraft.slice(
                                              mentionRange.end,
                                            );
                                            setMessageDraft(
                                              `${before}${insertion}${after}`,
                                            );
                                          } else {
                                            setMessageDraft(
                                              (prev) => `${prev}${insertion}`,
                                            );
                                          }

                                          setShowMentionSuggestions(false);
                                        }}
                                      >
                                        <strong>@{username || handle}</strong>
                                        <small>
                                          {suggestion.displayName} · {handle}
                                        </small>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            {showSlashSuggestions &&
                              slashSuggestions.length > 0 && (
                                <div className="slash-suggestions">
                                  {slashSuggestions.map((command) => (
                                    <button
                                      type="button"
                                      key={command}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        if (slashRange) {
                                          const before = messageDraft.slice(
                                            0,
                                            slashRange.start,
                                          );
                                          const after = messageDraft.slice(
                                            slashRange.end,
                                          );
                                          setMessageDraft(
                                            `${before}${command} ${after}`,
                                          );
                                        } else {
                                          setMessageDraft(
                                            (prev) => `${prev}${command} `,
                                          );
                                        }
                                        setShowSlashSuggestions(false);
                                      }}
                                    >
                                      <strong>{command}</strong>
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>
                          <button
                            className="link-button"
                            type="submit"
                            disabled={isPostingMessage}
                            aria-label="Post update"
                            style={{ float: "right" }}
                          >
                            {isPostingMessage ? (
                              "Posting…"
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                role="img"
                                aria-hidden="true"
                                focusable="false"
                                width="20"
                                height="20"
                              >
                                <path
                                  d="M2 21l21-9L2 3v7l15 2-15 2z"
                                  fill="currentColor"
                                />
                              </svg>
                            )}
                          </button>
                        </form>
                      </section>
                    )
                  ) : (
                    <section className="card join-card">
                      <p>
                        You’re not part of this ticket yet. Join to read and
                        post updates.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleJoinTicket()}
                      >
                        Join ticket
                      </button>
                    </section>
                  )}
                  <footer className="ticket-actions">
                    {selectedTicket.status === "archived" && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void restoreArchivedTicket()}
                      >
                        Unarchive ticket
                      </button>
                    )}
                    {!isTicketMember &&
                      selectedTicket.status !== "archived" && (
                        <button
                          type="button"
                          className="link-button outline"
                          onClick={() => void handleJoinTicket()}
                        >
                          Join ticket
                        </button>
                      )}
                  </footer>
                </article>
              ) : lockedTicket ? (
                <article className="card empty-detail">
                  <h3>{lockedTicket.ticketNumber}</h3>
                  <p>
                    This ticket is private or locked. Request access from its
                    members.
                  </p>
                </article>
              ) : (
                <article className="card empty-detail">
                  <h3>Select a ticket</h3>
                  <p className="muted">
                    Choose a ticket from the left panel to see its details.
                  </p>
                </article>
              )}
            </article>
          )}
        </section>
      </div>
    </section>
  );

  const handleDashboardAddTicket = () => {
    openCreateTicket();
  };

  const handleDashboardOpenTicket = (ticket: Ticket) => {
    setDashboardTicketError("");
    setDashboardTicketToEdit(ticket);
  };

  const closeDashboardTicketModal = () => {
    if (dashboardTicketSaving) return;
    setDashboardTicketToEdit(null);
    setDashboardTicketError("");
  };

  const handleDashboardTicketSave = async (updates: {
    title: string;
    status: Ticket["status"];
    priority: Ticket["priority"];
    estimatedHours: number | null;
  }) => {
    if (!dashboardTicketToEdit) return;
    setDashboardTicketSaving(true);
    setDashboardTicketError("");
    try {
      await quickUpdateTicket(dashboardTicketToEdit.id, updates);
      setDashboardTicketToEdit(null);
    } catch (error: any) {
      setDashboardTicketError(
        error?.response?.data?.message || "Unable to update ticket.",
      );
    } finally {
      setDashboardTicketSaving(false);
    }
  };

  const dashboardView = (
    <DashboardView
      entries={filteredDashboardEntries}
      projects={projects}
      tickets={tickets}
      range={dashboardRange}
      startDate={dashboardStartDate}
      endDate={dashboardEndDate}
      userWorkLogs={userWorkLogs}
      userWorkLogSearch={userWorkLogSearch}
      userWorkLogRange={userWorkLogRange}
      userWorkLogStartDate={userWorkLogStartDate}
      userWorkLogEndDate={userWorkLogEndDate}
      userWorkLogLoading={userWorkLogLoading}
      canEditUsers={user?.handle === "admin"}
      searchQuery={dashboardSearch}
      onRangeChange={(value) => void handleDashboardRangeChange(value)}
      onDateChange={(type, value) =>
        void handleDashboardDateChange(type, value)
      }
      onSearchChange={(value) => setDashboardSearch(value)}
      onUserWorkLogSearchChange={(value) =>
        void handleUserWorkLogSearchChange(value)
      }
      onUserWorkLogRangeChange={(value) =>
        void handleUserWorkLogRangeChange(value)
      }
      onUserWorkLogDateChange={(type, value) =>
        void handleUserWorkLogDateChange(type, value)
      }
      onEditUser={openAdminEdit}
      onAddTicket={handleDashboardAddTicket}
      onOpenTicket={handleDashboardOpenTicket}
      onViewTicket={handleReportTicketNavigate}
    />
  );

  const dmView = (
    <DmPanel
      users={users}
      currentUserId={user?.id}
      selectedRecipientId={dmForm.recipientId}
      dmBody={dmForm.body}
      conversationCount={dms.length}
      onRecipientChange={handleDmRecipientChange}
      onBodyChange={(value) => updateDmFormField("body", value)}
      onSend={handleDmSend}
      onTextareaKeyDown={handleDmTextareaKeyDown}
      thread={selectedDmThread}
    />
  );

  const activityView = (
    <ActivityPanel
      notifications={activityNotifications}
      unreadCount={activityUnreadCount}
      onOpenTicket={navigateToNotification}
    />
  );

  const createTicketModal = (
    <CreateTicketModal
      isOpen={showCreateTicket}
      form={createTicketModel}
      projects={projects}
      onFieldChange={(field, value) =>
        updateCreateTicketField(field as any, value as any)
      }
      onClose={closeCreateTicket}
      onSubmit={handleTicketSubmit}
    />
  );

  const createProjectModal = (
    <CreateProjectModal
      isOpen={showCreateProject}
      form={createProjectModel}
      onFieldChange={(field, value) =>
        updateCreateProjectField(field as any, value as any)
      }
      onClose={closeCreateProject}
      onSubmit={handleProjectSubmit}
    />
  );

  const dashboardTicketModal = (
    <DashboardTicketModal
      ticket={dashboardTicketToEdit}
      isOpen={Boolean(dashboardTicketToEdit)}
      saving={dashboardTicketSaving}
      error={dashboardTicketError}
      onClose={closeDashboardTicketModal}
      onSave={(changes) => void handleDashboardTicketSave(changes)}
    />
  );

  const renderContent = () => (
    <TabContent
      activeTab={activeTab}
      dashboardView={dashboardView}
      dmView={dmView}
      activityView={activityView}
      homeView={renderHome()}
    />
  );

  const userSettingsModal = (
    <UserSettingsModal
      isOpen={showUserSettings}
      form={userSettingsForm}
      error={userSettingsError}
      saving={userSettingsSaving}
      onClose={closeUserSettings}
      onSave={saveUserSettings}
      onFieldChange={updateUserSettingsField}
    />
  );

  const adminEditModal = (
    <AdminEditModal
      isOpen={Boolean(adminEditUser)}
      form={adminEditForm}
      saving={adminEditSaving}
      error={adminEditError}
      onFieldChange={handleAdminFieldChange}
      onClose={closeAdminEdit}
      onSave={handleAdminSave}
    />
  );

  return (
    <div className="workspace">
      <aside className="workspace__sidebar">
        <div className="sidebar__brand">
          <p className="project-name">Project and Ticket Management</p>
          <small className="workspace-name">{workspaceLabel}</small>
        </div>
        {user && (
          <div className="sidebar__profile">
            <span>Logged in</span>
            <strong>{user.displayName}</strong>
            <small>@{user.handle}</small>
          </div>
        )}
        <nav className="primary-nav">
          {user?.handle === "admin" && (
            <button
              type="button"
              className={clsx({ active: activeTab === "dashboard" })}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
          )}
          <button
            type="button"
            className={clsx({ active: activeTab === "home" })}
            onClick={() => setActiveTab("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={clsx({
              active: activeTab === "dms",
              "has-alert": hasDmAttention,
            })}
            onClick={() => setActiveTab("dms")}
          >
            DMs
          </button>
          <button
            type="button"
            className={clsx({
              active: activeTab === "activity",
              "has-alert": showActivityTabAlert,
            })}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </button>
        </nav>
        <div className="sidebar__footer">
          {users.length > 0 && (
            <section className="sidebar__team">
              <h4>Team</h4>
              <ul>
                {users.map((teammate) => (
                  <li key={teammate.id}>
                    <span>
                      <strong>{teammate.displayName}</strong>
                      <small>@{teammate.handle}</small>
                    </span>
                    <span
                      className={clsx("badge", { active: teammate.isActive })}
                    >
                      {teammate.isActive ? "Active" : "Away"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button
            type="button"
            className="user-settings-btn"
            onClick={openUserSettings}
          >
            ⚙
          </button>
        </div>
      </aside>
      <main className="workspace__main">
        <header className="main__header">
          <div>
            <h2>{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
          {activeTab === "home" && (
            <div className="header__actions">
              <input
                type="search"
                placeholder="Search Tickets or Titles"
                value={ticketSearch}
                onChange={(event) => setTicketSearch(event.target.value)}
              />
              {ticketSearchResults.length > 0 && (
                <div className="search-results">
                  <p className="muted">
                    {ticketSearchResults.length} result
                    {ticketSearchResults.length === 1 ? "" : "s"}
                  </p>
                  <ul>
                    {ticketSearchResults.map((result) => (
                      <li key={result.ticket.id}>
                        <button
                          type="button"
                          onClick={() => void selectTicket(result.ticket.id)}
                        >
                          <strong>
                            {result.ticket.ticketNumber} · {result.ticket.title}
                          </strong>
                          {result.matches.map((match, index) => (
                            <span key={index}>{match}</span>
                          ))}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="sign-out-btn"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </header>
        {feedback && <section className="inline-feedback">{feedback}</section>}
        {isBootstrapping && <Loader label="Loading workspace…" />}
        {renderContent()}
      </main>
      {createTicketModal}
      {createProjectModal}
      {dashboardTicketModal}
      <ProjectEditorModal
        isOpen={showProjectEditor}
        form={projectEditorModel}
        saving={projectEditorSaving}
        deleting={projectEditorDeleting}
        onFieldChange={(field, value) => updateProjectEditorField(field, value)}
        onClose={closeProjectEditor}
        onSave={saveProjectEditor}
        onDelete={removeProject}
      />
      {adminEditModal}
      {userSettingsModal}
    </div>
  );
};

export default WorkspacePage;

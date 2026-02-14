import { FormEvent, useMemo, useState } from 'react';
import clsx from 'clsx';
import Loader from '../components/Loader';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../hooks/useWorkspace';
import { NotificationItem, Ticket, User } from '../types/api';

const ticketCategoryConfig = [
  { key: 'open', label: 'Available' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'archived', label: 'Archived' },
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
    updateCreateTicketField,
    updateDmFormField,
    createProject,
    createTicket,
    postTicketMessage,
    sendDm,
    startTicket,
    handleAssign,
    handleJoinTicket,
    handleArchiveTicket,
    handlePrivacyChange,
    handleDashboardRangeChange,
    handleDashboardDateChange,
    handleDmRecipientChange,
    markNotification,
    navigateToNotification,
    openUserSettings,
    closeUserSettings,
    saveUserSettings,
    updateUserSettingsField,
    openCreateProject,
    closeCreateProject,
    openCreateTicket,
    closeCreateTicket,
    handleGlobalReportView,
    closeProjectReports,
    updateUserInfo,
  } = useWorkspace();

  const {
    workspaceLabel,
    users,
    projects,
    tickets,
    dashboard,
    notifications,
    dms,
    selectedProjectId,
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
    projectsCollapsed,
    showUserSettings,
    showCreateProject,
    showCreateTicket,
    projectReportEntries,
    viewingReportsForProjectId,
    viewingReportsForProjectName,
    projectReportsLoading,
    isGlobalReportView,
    hasUnseenGlobalReports,
    userSettingsForm,
    userSettingsError,
    userSettingsSaving,
  } = state;

  const [adminEditUser, setAdminEditUser] = useState<User | null>(null);
  const [adminEditForm, setAdminEditForm] = useState({ displayName: '', handle: '', location: '' });
  const [adminEditError, setAdminEditError] = useState('');
  const [adminEditSaving, setAdminEditSaving] = useState(false);

  const [mentionSuggestions, setMentionSuggestions] = useState<User[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(null);

  const filteredTickets = useMemo(() => {
    const search = ticketSearch.trim().toLowerCase();
    if (!search) return tickets;
    return tickets.filter((ticket) => {
      const haystack = `${ticket.ticketNumber} ${ticket.title} ${ticket.status}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [ticketSearch, tickets]);

  const isTicketMember = useMemo(() => {
    if (!selectedTicket || !user?.id) return false;
    if (typeof selectedTicket.viewerIsMember === 'boolean') {
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
          matches.push('Matches description');
        }
        return matches.length ? { ticket, matches } : null;
      })
      .filter((value): value is { ticket: Ticket; matches: string[] } => Boolean(value))
      .slice(0, 5);
  }, [ticketSearch, tickets]);

  const ticketGroups = useMemo(() => {
    if (!selectedProjectId) return [] as Array<{ key: string; label: string; items: Ticket[] }>;
    return ticketCategoryConfig.map((category) => ({
      ...category,
      items: filteredTickets.filter(
        (ticket) => ticket.projectId === selectedProjectId && ticket.status === category.key,
      ),
    }));
  }, [filteredTickets, selectedProjectId]);

  const selectedDmThread = useMemo(() => {
    if (!selectedDmRecipientId || !user?.id) return [];
    return dms
      .filter(
        (dm) =>
          (dm.senderId === user.id && dm.recipientId === selectedDmRecipientId) ||
          (dm.senderId === selectedDmRecipientId && dm.recipientId === user.id),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [dms, selectedDmRecipientId, user?.id]);

  const handleProjectSubmit = (event: FormEvent) => {
    event.preventDefault();
    void createProject();
  };

  const handleTicketSubmit = (event: FormEvent) => {
    event.preventDefault();
    void createTicket();
  };

  const handleMessageSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = messageDraft.trim();
    if (payload === '/start') {
      event.preventDefault();
      void startTicket();
      return;
    }
    void postTicketMessage();
  };

  const handleDmSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendDm();
  };

  const handleAssigneeChange = (value: string) => {
    if (!selectedTicket) return;
    if (!value || value === selectedTicket.assigneeId) return;
    void handleAssign(value);
  };

  const openAdminEdit = (targetUserId: string) => {
    const target = users.find((item) => item.id === targetUserId);
    if (!target) return;
    setAdminEditUser(target);
    setAdminEditForm({
      displayName: target.displayName,
      handle: target.handle,
      location: target.location || '',
    });
    setAdminEditError('');
  };

  const closeAdminEdit = () => {
    setAdminEditUser(null);
    setAdminEditForm({ displayName: '', handle: '', location: '' });
    setAdminEditError('');
    setAdminEditSaving(false);
  };

  const handleAdminFieldChange = (field: keyof typeof adminEditForm, value: string) => {
    setAdminEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdminSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminEditUser) return;
    const trimmedName = adminEditForm.displayName.trim();
    const trimmedHandle = adminEditForm.handle.trim();
    const trimmedLocation = adminEditForm.location.trim();
    const payload: { displayName?: string; handle?: string; location?: string | null } = {};
    if (trimmedName && trimmedName !== adminEditUser.displayName) {
      payload.displayName = trimmedName;
    }
    if (trimmedHandle && trimmedHandle !== adminEditUser.handle) {
      payload.handle = trimmedHandle;
    }
    if (trimmedLocation !== (adminEditUser.location || '')) {
      payload.location = trimmedLocation || null;
    }
    if (!Object.keys(payload).length) {
      setAdminEditError('No changes to save.');
      return;
    }
    setAdminEditSaving(true);
    setAdminEditError('');
    try {
      await updateUserInfo(adminEditUser.id, payload);
      closeAdminEdit();
    } catch (error: any) {
      console.error('Unable to update user', error);
      setAdminEditError(error?.response?.data?.message || 'Unable to update user.');
    } finally {
      setAdminEditSaving(false);
    }
  };

  const getUserName = (userId?: string | null) => {
    if (!userId) return 'Unassigned';
    return users.find((item) => item.id === userId)?.displayName || 'Unknown';
  };

  const buildSlashSuggestions = () => {
    return ['/start', '/archive', '/a-@username', '/e-hours'];
  };

  const isDmNotification = (notification: NotificationItem) => {
    if (notification.ticketId) return false;
    const message = notification.message?.toLowerCase() || '';
    return message.includes('sent you a dm');
  };

  const activityNotifications = useMemo(() => {
    return notifications.filter((notification) => !isDmNotification(notification));
  }, [notifications]);

  const activityUnreadCount = useMemo(() => {
    return activityNotifications.filter((notification) => !notification.isRead).length;
  }, [activityNotifications]);

  const headerTitle = useMemo(() => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard overview';
      case 'home':
        return selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name || 'Projects' : 'Projects';
      case 'dms':
        return 'Direct messages';
      case 'activity':
        return 'Activity';
      default:
        return workspaceLabel;
    }
  }, [activeTab, selectedProjectId, projects, workspaceLabel]);

  const headerSubtitle = useMemo(() => {
    if (activeTab === 'home') {
      return `Workspace: ${workspaceLabel}`;
    }
    if (user) {
      return `Signed in as ${user.displayName} - @${user.handle}`;
    }
    return workspaceLabel;
  }, [activeTab, user, workspaceLabel]);

  const renderDashboard = () => (
    <section className="main__view" aria-label="Dashboard">
      <section className="card dashboard-controls">
        <div>
          <label>
            Range
            <select
              value={dashboardRange}
              onChange={(event) => void handleDashboardRangeChange(event.target.value as any)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
        </div>
        {dashboardRange === 'custom' && (
          <div className="custom-range">
            <label>
              Start
              <input
                type="date"
                value={dashboardStartDate || ''}
                onChange={(event) => void handleDashboardDateChange('start', event.target.value || null)}
              />
            </label>
            <label>
              End
              <input
                type="date"
                value={dashboardEndDate || ''}
                onChange={(event) => void handleDashboardDateChange('end', event.target.value || null)}
              />
            </label>
          </div>
        )}
      </section>
      {dashboard.length ? (
        <section className="dashboard-grid">
          {dashboard.map((entry) => (
            <article key={entry.id} className="card dashboard-card">
              <header>
                <div>
                  <h3>{entry.displayName}</h3>
                  <p>{entry.openCount + entry.inProgressCount + entry.archivedCount} tickets</p>
                </div>
                {user?.handle === 'admin' && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => openAdminEdit(entry.id)}
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

  const renderHome = () => (
    <section className="main__view home-view" aria-label="Home">
      <div className="home-layout">
        <section className="home-layout__left">
          <article className="card home-card workspace-board">
            <section className="space-section">
              <div className="space-section__actions">
                <button className="link-button outline" type="button" onClick={openCreateProject}>
                  + Project
                </button>
                <button className="link-button outline" type="button" onClick={openCreateTicket}>
                  + Ticket
                </button>
              </div>
              <div className="space-section__header">
                <h4>Projects</h4>
                <span className="muted">{projects.length} active</span>
                <button type="button" className="collapse-btn" onClick={toggleProjectsCollapsed}>
                  {projectsCollapsed ? '▶' : '▼'}
                </button>
              </div>
              <div className={clsx('project-panel', { 'is-collapsed': projectsCollapsed })}>
                <div className="project-list">
                      {projects.map((project) => (
                        <div key={project.id} className="project-item">
                      <div className="project-row">
                        <button
                          type="button"
                          className={clsx('project-main', {
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
                              tickets.filter((ticket) => ticket.projectId === project.id && ticket.status !== 'archived')
                                .length
                            }
                          </span>
                        </button>
                      </div>
                      {selectedProjectId === project.id && (
                        <div className="project-ticket-groups">
                          {ticketGroups.map((group) => (
                            <div key={group.key} className="project-ticket-group">
                              <header>
                                <strong>{group.label}</strong>
                                <span className="badge">{group.items.length}</span>
                              </header>
                              <ul>
                                {group.items.length ? (
                                  group.items.map((ticket) => (
                                    <li key={ticket.id}>
                                      <button type="button" onClick={() => void selectTicket(ticket.id)}>
                                        <div>
                                          <strong>
                                            {ticket.ticketNumber} · {ticket.title}
                                          </strong>
                                          <small>{ticket.description || 'No description provided.'}</small>
                                        </div>
                                        <span className={clsx('status', ticket.status)}>{ticket.status.replace('_', ' ')}</span>
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
                      className={clsx('project-main', {
                        active: isGlobalReportView,
                        'has-updates': hasUnseenGlobalReports,
                      })}
                      onClick={() => void handleGlobalReportView()}
                    >
                      <div>
                        <strong>Report of work</strong>
                        <small>All projects</small>
                      </div>
                      <span className="project-number">View</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </article>
        </section>
        <section className="home-layout__right">
          {viewingReportsForProjectId ? (
            <section className="card project-reports">
              <header>
                <div>
                  <h3>Report of work</h3>
                  <p>{viewingReportsForProjectName || 'All projects'}</p>
                </div>
                <button type="button" className="link-button outline" onClick={closeProjectReports}>
                  Close
                </button>
              </header>
              {projectReportsLoading ? (
                <p className="muted">Loading reports…</p>
              ) : projectReportEntries.length === 0 ? (
                <p className="muted">No ticket starts recorded yet.</p>
              ) : (
                <ul>
                  {projectReportEntries.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.ticketNumber}</strong>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </div>
                      <p>{entry.ticketTitle}</p>
                      <p className="muted">{entry.message}</p>
                      {entry.actorName && <small>Started by {entry.actorName}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <article className="card ticket-panel">
              <div className="ticket-panel__left">
               
              </div>
              <div className="ticket-panel__right">
                {selectedTicket ? (
                  <article className="ticket-detail">
                    <header>
                      <h3>
                        {selectedTicket.ticketNumber} · {selectedTicket.title}
                      </h3>
                      <span className={clsx('status', selectedTicket.status)}>
                        {selectedTicket.status.replace('_', ' ')}
                      </span>
                    </header>
                    <p>{selectedTicket.description || 'No description provided.'}</p>
                    <section className="ticket-info">
                      <div>
                        <label>Assignee</label>
                        <select
                          value={selectedTicket.assigneeId || ''}
                          onChange={(event) => handleAssigneeChange(event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {users.map((teammate) => (
                            <option key={teammate.id} value={teammate.id}>
                              {teammate.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Privacy</label>
                        <p>
                          <span className={clsx('privacy-badge', selectedTicket.privacy)}>
                            {selectedTicket.privacy}
                          </span>
                        </p>
                      </div>
                      <div>
                        <label>Estimated hrs</label>
                        <p>{selectedTicket.estimatedHours ?? '—'}</p>
                      </div>
                    </section>
                    <section className="ticket-members">
                      <label>Members</label>
                      <ul>
                        {selectedTicket.members.map((member) => (
                          <li key={member.userId}>
                            <span>{member.displayName}</span>
                            <small>@{member.handle}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                    {isTicketMember ? (
                      <section className="ticket-thread">
                        <h4>Messages</h4>
                        <div className="message-list">
                          {selectedTicket.messages.map((message) => (
                            <article key={message.id} className="message-item">
                              <header>
                                <strong>{message.displayName || 'Unknown user'}</strong>
                                <small>{new Date(message.createdAt).toLocaleString()}</small>
                              </header>
                              <p>{message.body}</p>
                            </article>
                          ))}
                        </div>
                        <form onSubmit={handleMessageSubmit} className="message-form">
                          <div className="message-input">
                            <textarea
                              rows={3}
                              value={messageDraft}
                              placeholder="Write an update…"
                              onChange={(event) => setMessageDraft(event.target.value)}
                              onInput={(event) => {
                                const target = event.target as HTMLTextAreaElement;
                                const caretIndex = target.selectionStart ?? target.value.length;
                                const before = target.value.slice(0, caretIndex);
                                const slashMatch = before.match(/(?:^|\s)\/([\w]*)$/);
                                if (slashMatch) {
                                  setSlashSuggestions(buildSlashSuggestions());
                                  setSlashRange({ start: caretIndex - slashMatch[0].length, end: caretIndex });
                                  setShowSlashSuggestions(true);
                                } else {
                                  setSlashRange(null);
                                  setShowSlashSuggestions(false);
                                }
                                const mentionMatch = before.match(/(?:^|\s)@([\w-]*)$/i);
                                if (mentionMatch) {
                                  const query = mentionMatch[1].toLowerCase();
                                  const suggestions = users.filter((u) =>
                                    u.username.toLowerCase().includes(query) ||
                                    u.handle.toLowerCase().includes(query),
                                  );
                                  setMentionRange({ start: caretIndex - mentionMatch[0].length, end: caretIndex });
                                  setMentionSuggestions(suggestions.slice(0, 5));
                                  setShowMentionSuggestions(suggestions.length > 0);
                                } else {
                                  setMentionRange(null);
                                  setShowMentionSuggestions(false);
                                }
                              }}
                            />
                            {showMentionSuggestions && mentionSuggestions.length > 0 && (
                              <div className="mention-suggestions">
                                {mentionSuggestions.map((suggestion) => (
                                  <button
                                    type="button"
                                    key={suggestion.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      const normalized = (suggestion.username || suggestion.handle).trim();
                                      const insertion = `@${normalized} `;
                                      if (mentionRange) {
                                        const before = messageDraft.slice(0, mentionRange.start);
                                        const after = messageDraft.slice(mentionRange.end);
                                        setMessageDraft(`${before}${insertion}${after}`);
                                      } else {
                                        setMessageDraft((prev) => `${prev}${insertion}`);
                                      }
                                      setShowMentionSuggestions(false);
                                    }}
                                  >
                                    <strong>@{suggestion.username}</strong>
                                    <small>{suggestion.displayName} · {suggestion.handle}</small>
                                  </button>
                                ))}
                              </div>
                            )}
                            {showSlashSuggestions && slashSuggestions.length > 0 && (
                              <div className="slash-suggestions">
                                {slashSuggestions.map((command) => (
                                  <button
                                    type="button"
                                    key={command}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (slashRange) {
                                        const before = messageDraft.slice(0, slashRange.start);
                                        const after = messageDraft.slice(slashRange.end);
                                        setMessageDraft(`${before}${command} ${after}`);
                                      } else {
                                        setMessageDraft((prev) => `${prev}${command} `);
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
                          <button className="link-button" type="submit" disabled={isPostingMessage}>
                            {isPostingMessage ? 'Posting…' : 'Post update'}
                          </button>
                        </form>
                      </section>
                    ) : (
                      <section className="card join-card">
                        <p>You’re not part of this ticket yet. Join to read and post updates.</p>
                        <button type="button" onClick={() => void handleJoinTicket()}>Join ticket</button>
                      </section>
                    )}
                    <footer className="ticket-actions">
                      {isTicketMember && selectedTicket.status !== 'archived' && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void startTicket()}
                          disabled={isPostingMessage}
                        >
                          {isPostingMessage ? 'Starting…' : 'Start ticket'}
                        </button>
                      )}
                      <button type="button" className="link-button outline" onClick={() => void handleJoinTicket()}>
                        Join ticket
                      </button>
                      <button
                        type="button"
                        className="link-button outline"
                        onClick={() => void handleArchiveTicket()}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void handlePrivacyChange(selectedTicket.privacy === 'public' ? 'private' : 'public')}
                      >
                        Make {selectedTicket.privacy === 'public' ? 'private' : 'public'}
                      </button>
                    </footer>
                  </article>
                ) : lockedTicket ? (
                  <article className="card empty-detail">
                    <h3>{lockedTicket.ticketNumber}</h3>
                    <p>This ticket is private or locked. Request access from its members.</p>
                  </article>
                ) : (
                  <article className="card empty-detail">
                    <h3>Select a ticket</h3>
                    <p className="muted">Choose a ticket from the left panel to see its details.</p>
                  </article>
                )}
              </div>
            </article>
          )}
        </section>
      </div>
    </section>
  );

  const renderDms = () => (
    <section className="main__view" aria-label="Direct messages">
      <article className="card dm-panel">
        <header className="section-heading">
          <h3>Send a DM</h3>
          <p className="muted">{selectedDmThread.length} messages</p>
        </header>
        <label>
          Recipient
          <select
            value={dmForm.recipientId}
            onChange={(event) => handleDmRecipientChange(event.target.value)}
          >
            <option value="">Select teammate</option>
            {users
              .filter((teammate) => teammate.id !== user?.id)
              .map((teammate) => (
                <option key={teammate.id} value={teammate.id}>
                  {teammate.displayName}
                </option>
              ))}
          </select>
        </label>
        <form onSubmit={handleDmSubmit}>
          <label>
            Message
            <textarea
              rows={3}
              value={dmForm.body}
              onChange={(event) => updateDmFormField('body', event.target.value)}
            />
          </label>
          <button className="link-button" type="submit">
            Send message
          </button>
        </form>
        <section className="dm-thread">
          {selectedDmThread.length ? (
            selectedDmThread.map((message) => (
              <article key={message.id}>
                <strong>{message.senderName}</strong>
                <small>{new Date(message.createdAt).toLocaleString()}</small>
                <p>{message.body}</p>
              </article>
            ))
          ) : (
            <p className="muted">No direct messages yet.</p>
          )}
        </section>
      </article>
    </section>
  );

  const renderActivity = () => (
    <section className="main__view" aria-label="Activity">
      <article className="card activity-panel">
        <header className="section-heading">
          <h3>Notifications</h3>
          <span className="badge">{activityUnreadCount} unread</span>
        </header>
        <ul>
          {activityNotifications.length ? (
            activityNotifications.map((notification) => (
              <li key={notification.id} className={clsx({ unread: !notification.isRead })}>
                <strong>{notification.ticketNumber}</strong>
                <p>{notification.message}</p>
                <div className="notification-actions">
                  {notification.ticketId && (
                    <button
                      type="button"
                      className="link-button outline"
                      onClick={() => void navigateToNotification(notification)}
                    >
                      Open ticket
                    </button>
                  )}
                  {!notification.isRead && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void markNotification(notification.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))
          ) : (
            <li className="muted">You're all caught up!</li>
          )}
        </ul>
      </article>
    </section>
  );

  const renderContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'dms') return renderDms();
    if (activeTab === 'activity') return renderActivity();
    return renderHome();
  };

  const renderUserSettingsModal = () => {
    if (!showUserSettings) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <article className="modal">
          <header>
            <h3>User settings</h3>
            <button type="button" onClick={closeUserSettings} aria-label="Close settings">
              ×
            </button>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveUserSettings();
            }}
          >
            <label>
              Display name
              <input
                type="text"
                value={userSettingsForm.displayName}
                onChange={(event) => updateUserSettingsField('displayName', event.target.value)}
              />
            </label>
            <label>
              Handle
              <input
                type="text"
                value={userSettingsForm.handle}
                onChange={(event) => updateUserSettingsField('handle', event.target.value)}
              />
            </label>
            <label>
              Location
              <input
                type="text"
                value={userSettingsForm.location}
                onChange={(event) => updateUserSettingsField('location', event.target.value)}
              />
            </label>
            {userSettingsError && <p className="error">{userSettingsError}</p>}
            <footer>
              <button type="button" className="link-button outline" onClick={closeUserSettings}>
                Cancel
              </button>
              <button type="submit" className="link-button" disabled={userSettingsSaving}>
                {userSettingsSaving ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>
        </article>
      </div>
    );
  };

  const renderCreateTicketModal = () => {
    if (!showCreateTicket) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <article className="modal">
          <header>
            <h3>Create ticket</h3>
            <button type="button" onClick={closeCreateTicket} aria-label="Close create ticket form">
              ×
            </button>
          </header>
          <form onSubmit={handleTicketSubmit}>
            <label>
              Title
              <input
                type="text"
                value={createTicketModel.title}
                onChange={(event) => updateCreateTicketField('title', event.target.value)}
                required
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={createTicketModel.description}
                onChange={(event) => updateCreateTicketField('description', event.target.value)}
              />
            </label>
            <label>
              Project
              <select
                value={createTicketModel.projectId}
                onChange={(event) => updateCreateTicketField('projectId', event.target.value)}
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
                value={createTicketModel.estimatedHours}
                onChange={(event) => updateCreateTicketField('estimatedHours', Number(event.target.value))}
              />
            </label>
            <label>
              Priority
              <select
                value={createTicketModel.priority}
                onChange={(event) => updateCreateTicketField('priority', event.target.value as any)}
              >
                <option value="normal">Normal</option>
                <option value="priority">Priority</option>
              </select>
            </label>
            <label>
              Privacy
              <select
                value={createTicketModel.privacy}
                onChange={(event) => updateCreateTicketField('privacy', event.target.value as any)}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
            <footer>
              <button type="button" className="link-button outline" onClick={closeCreateTicket}>
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

  const renderCreateProjectModal = () => {
    if (!showCreateProject) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <article className="modal">
          <header>
            <h3>Create project</h3>
            <button type="button" onClick={closeCreateProject} aria-label="Close create project form">
              ×
            </button>
          </header>
          <form onSubmit={handleProjectSubmit} className="create-project">
            <label>
              Name
              <input
                type="text"
                value={createProjectModel.name}
                onChange={(event) => updateCreateProjectField('name', event.target.value)}
                required
              />
            </label>
            <label>
              Slug
              <input
                type="text"
                value={createProjectModel.slug}
                onChange={(event) => updateCreateProjectField('slug', event.target.value)}
              />
            </label>
            <label>
              Ticket prefix
              <input
                type="text"
                value={createProjectModel.ticketPrefix}
                onChange={(event) => updateCreateProjectField('ticketPrefix', event.target.value)}
                required
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={createProjectModel.description}
                onChange={(event) => updateCreateProjectField('description', event.target.value)}
              />
            </label>
            <footer>
              <button type="button" className="link-button outline" onClick={closeCreateProject}>
                Cancel
              </button>
              <button type="submit" className="link-button">
                Create project
              </button>
            </footer>
          </form>
        </article>
      </div>
    );
  };

  const renderAdminEditModal = () => {
    if (!adminEditUser) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <article className="modal">
          <header>
            <h3>Edit {adminEditUser.displayName}</h3>
            <button type="button" onClick={closeAdminEdit} aria-label="Close admin edit">
              ×
            </button>
          </header>
          <form onSubmit={handleAdminSave}>
            <label>
              Display name
              <input
                type="text"
                value={adminEditForm.displayName}
                onChange={(event) => handleAdminFieldChange('displayName', event.target.value)}
              />
            </label>
            <label>
              Handle
              <input
                type="text"
                value={adminEditForm.handle}
                onChange={(event) => handleAdminFieldChange('handle', event.target.value)}
              />
            </label>
            <label>
              Location
              <input
                type="text"
                value={adminEditForm.location}
                onChange={(event) => handleAdminFieldChange('location', event.target.value)}
              />
            </label>
            {adminEditError && <p className="error">{adminEditError}</p>}
            <footer>
              <button type="button" className="link-button outline" onClick={closeAdminEdit}>
                Cancel
              </button>
              <button className="link-button" type="submit" disabled={adminEditSaving}>
                {adminEditSaving ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>
        </article>
      </div>
    );
  };

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
          {user?.handle === 'admin' && (
            <button
              type="button"
              className={clsx({ active: activeTab === 'dashboard' })}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
          )}
          <button
            type="button"
            className={clsx({ active: activeTab === 'home' })}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={clsx({ active: activeTab === 'dms', 'has-alert': hasDmAttention })}
            onClick={() => setActiveTab('dms')}
          >
            DMs
          </button>
          <button
            type="button"
            className={clsx({ active: activeTab === 'activity', 'has-alert': hasActivityAttention })}
            onClick={() => setActiveTab('activity')}
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
                    <span className={clsx('badge', { active: teammate.isActive })}>
                      {teammate.isActive ? 'Active' : 'Away'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" className="user-settings-btn" onClick={openUserSettings}>
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
          {activeTab === 'home' && (
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
                    {ticketSearchResults.length} result{ticketSearchResults.length === 1 ? '' : 's'}
                  </p>
                  <ul>
                    {ticketSearchResults.map((result) => (
                      <li key={result.ticket.id}>
                        <button type="button" onClick={() => void selectTicket(result.ticket.id)}>
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
          <button type="button" className="sign-out-btn" onClick={() => void logout()}>
            Sign out
          </button>
        </header>
        {feedback && <section className="inline-feedback">{feedback}</section>}
        {isBootstrapping && <Loader label="Loading workspace…" />}
      {renderContent()}
    </main>
      {renderCreateTicketModal()}
      {renderCreateProjectModal()}
      {renderAdminEditModal()}
      {renderUserSettingsModal()}
    </div>
  );
};

export default WorkspacePage;

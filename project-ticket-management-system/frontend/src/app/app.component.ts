import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SESSION_EXPIRED_EVENT } from './auth.interceptor';
import {
  ApiService,
  Project,
  ProjectReportEntry,
  DashboardEntry,
  DmMessage,
  NotificationItem,
  Ticket,
  TicketDetail,
  TicketPrivacy,
  TicketPriority,
  TicketLog,
  TicketMessage,
  User,
  WorkspaceSummary,
} from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly defaultWorkspaceLabel = 'Mission Control Workspace';
  readonly globalReportProjectId = 'global-reports';
  @ViewChild('messageInput') messageInputRef?: ElementRef<HTMLTextAreaElement>;

  title = 'Project and Ticket Management System';
  workspaceLabel = this.defaultWorkspaceLabel;

  users: User[] = [];
  projects: Project[] = [];
  tickets: Ticket[] = [];
  dashboard: DashboardEntry[] = [];
  notifications: NotificationItem[] = [];
  dms: DmMessage[] = [];
  private readonly ticketCategoryConfig = [
    { key: 'open', label: 'Available' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'archived', label: 'Archived' },
  ] as const;

  selectedUserId = '';
  selectedProjectId = '';
  selectedTicket: TicketDetail | null = null;
  lockedTicket: { id: string; ticketNumber: string; title: string; privacy: TicketPrivacy } | null = null;
  activeTab: 'dashboard' | 'home' | 'dms' | 'activity' = 'home';
  projectsCollapsed = false;

  ticketSearch = '';
  messageDraft = '';
  mentionSuggestions: User[] = [];
  mentionQuery = '';
  showMentionSuggestions = false;
  slashSuggestions: string[] = [];
  showSlashSuggestions = false;
  createTicketModel = {
    title: '',
    description: '',
    projectId: '',
    estimatedHours: 1,
    privacy: 'public' as TicketPrivacy,
    inviteeIds: [] as string[],
    priority: 'normal' as TicketPriority,
  };
  createProjectModel = {
    name: '',
    slug: '',
    ticketPrefix: '',
    description: '',
  };
  dmForm = {
    recipientId: '',
    body: '',
  };
  selectedDmRecipientId = '';
  isUserSettingsOpen = false;
  userSettingsSaving = false;
  userSettingsError = '';
  userSettingsForm = {
    displayName: '',
    handle: '',
    location: '',
  };
  hasDmAttention = false;

  isLoadingTickets = false;
  isPostingMessage = false;
  feedback = '';
  isAuthenticated = false;
  authLoading = false;
  loginError = '';
  loginForm = {
    username: '',
    password: '',
  };
  registerForm = {
    displayName: '',
    username: '',
    handle: 'user',
    email: '',
    password: '',
    location: '',
    workspaceName: '',
  };
  workspaceSuggestions: WorkspaceSummary[] = [];
  isWorkspaceLookupLoading = false;
  private workspaceLookupTimeout: number | null = null;
  authMode: 'login' | 'register' = 'login';
  sessionUser: User | null = null;

  dashboardRange: '7d' | '30d' | '90d' | 'all' | 'custom' = '30d';
  dashboardStartDate: string | null = null;
  dashboardEndDate: string | null = null;
  readonly dashboardRanges = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
    { value: 'custom', label: 'Custom range' },
  ] as const;
  ticketSettings = {
    priority: 'normal' as TicketPriority,
    estimatedHours: null as number | null | '',
  };
  selectedLog: TicketLog | null = null;
  isCreateProjectOpen = false;
  isCreateTicketOpen = false;
  expandedProjectId = '';
  private mentionReplaceRange: { start: number; end: number } | null = null;
  private slashReplaceRange: { start: number; end: number } | null = null;
  private messageCursorIndex = 0;
  private suggestionHideTimeout: number | null = null;
  projectReportEntries: ProjectReportEntry[] = [];
  viewingReportsForProjectId = '';
  viewingReportsForProjectName = '';
  projectReportsLoading = false;
  isGlobalReportView = false;
  hasUnseenGlobalReports = false;
  hasActivityAttention = false;
  isDeleteProjectOpen = false;
  projectPendingDeletion: Project | null = null;
  isLogoutConfirmOpen = false;
  readonly baseSlashCommands = ['/start', '/archive', '/addTime'];
  private latestGlobalReportTimestamp: string | null = null;
  private lastActivityViewTimestamp: string | null = null;
  private lastDmViewTimestamp: string | null = null;

  private readonly handleSessionExpired = () => {
    this.handleLogout();
    this.loginError = 'Your session expired. Please log in again.';
    this.authMode = 'login';
  };

  constructor(private readonly api: ApiService) {}

  async ngOnInit() {
    if (typeof window !== 'undefined') {
      window.addEventListener(SESSION_EXPIRED_EVENT, this.handleSessionExpired);
    }
    const storedToken = this.getStoredToken();
    const storedUser = this.getStoredUser();
    if (storedToken && storedUser) {
      if (this.isTokenExpired(storedToken)) {
        this.handleSessionExpired();
        return;
      }
      this.sessionUser = storedUser;
      this.selectedUserId = storedUser.id;
      this.isAuthenticated = true;
      this.updateWorkspaceLabel(storedUser.workspaceName);
      await this.bootstrapWorkspace();
      return;
    }
    if (storedToken || storedUser) {
      this.clearSessionStorage();
    }
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener(SESSION_EXPIRED_EVENT, this.handleSessionExpired);
    }
  }

  private async bootstrapWorkspace() {
    if (!this.isAuthenticated) return;
    await Promise.all([this.loadUsers(), this.loadProjects()]);
    if (!this.selectedUserId && this.sessionUser) {
      this.selectedUserId = this.sessionUser.id;
    }
    this.lastActivityViewTimestamp = this.restoreActivityViewTimestamp();
    this.lastDmViewTimestamp = this.restoreDmViewTimestamp();
    if (!this.createTicketModel.projectId && this.projects.length) {
      this.createTicketModel.projectId = this.projects[0].id;
    }
    await this.loadTickets();
    await Promise.all([this.loadDashboard(), this.loadNotifications(), this.loadDms()]);
  }

  get currentUser(): User | undefined {
    return this.users.find((user) => user.id === this.selectedUserId);
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem('authToken');
    } catch (error) {
      return null;
    }
  }

  private getStoredUser(): User | null {
    try {
      const raw = localStorage.getItem('authUser');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as User & { handle?: string };
      if (!parsed.username && parsed.handle) {
        parsed.username = parsed.handle;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

  private persistSession(token: string, user: User) {
    try {
      localStorage.setItem('authToken', token);
      localStorage.setItem('authUser', JSON.stringify(user));
    } catch (error) {
      console.error('Unable to persist auth session', error);
    }
  }

  private persistUserProfile(user: User) {
    try {
      localStorage.setItem('authUser', JSON.stringify(user));
    } catch (error) {
      console.error('Unable to persist user profile', error);
    }
  }

  private updateWorkspaceLabel(workspaceName?: string | null) {
    this.workspaceLabel = workspaceName?.trim() || this.defaultWorkspaceLabel;
  }

  private clearSessionStorage() {
    try {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
    } catch (error) {
      console.error('Unable to clear auth storage', error);
    }
  }

  private getGlobalReportStorageKey(userId: string) {
    return `globalReports:lastSeen:${userId}`;
  }

  private getLastSeenGlobalReportTimestamp(): string | null {
    if (!this.selectedUserId) return null;
    try {
      return localStorage.getItem(this.getGlobalReportStorageKey(this.selectedUserId));
    } catch (error) {
      console.error('Unable to read report-of-work state', error);
      return null;
    }
  }

  private persistGlobalReportTimestamp(timestamp: string | null) {
    if (!this.selectedUserId) return;
    const storageKey = this.getGlobalReportStorageKey(this.selectedUserId);
    try {
      if (timestamp) {
        localStorage.setItem(storageKey, timestamp);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('Unable to persist report-of-work state', error);
    }
  }

  private markGlobalReportsSeen(timestamp: string | null) {
    this.hasUnseenGlobalReports = false;
    if (!timestamp) {
      this.persistGlobalReportTimestamp(null);
      return;
    }
    this.latestGlobalReportTimestamp = timestamp;
    this.persistGlobalReportTimestamp(timestamp);
  }

  private getActivityViewStorageKey(userId: string) {
    return `activity:lastViewed:${userId}`;
  }

  private restoreActivityViewTimestamp(): string | null {
    if (!this.selectedUserId) return null;
    try {
      return localStorage.getItem(this.getActivityViewStorageKey(this.selectedUserId));
    } catch (error) {
      console.error('Unable to read activity view timestamp', error);
      return null;
    }
  }

  private persistActivityViewTimestamp(timestamp: string | null) {
    if (!this.selectedUserId) return;
    const key = this.getActivityViewStorageKey(this.selectedUserId);
    try {
      if (timestamp) {
        localStorage.setItem(key, timestamp);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Unable to persist activity view timestamp', error);
    }
  }

  private markActivityViewed(timestamp?: string) {
    const value = timestamp || new Date().toISOString();
    this.lastActivityViewTimestamp = value;
    this.hasActivityAttention = false;
    this.persistActivityViewTimestamp(value);
  }

  private getDmViewStorageKey(userId: string) {
    return `dms:lastViewed:${userId}`;
  }

  private restoreDmViewTimestamp(): string | null {
    if (!this.selectedUserId) return null;
    try {
      return localStorage.getItem(this.getDmViewStorageKey(this.selectedUserId));
    } catch (error) {
      console.error('Unable to read DM view timestamp', error);
      return null;
    }
  }

  private persistDmViewTimestamp(timestamp: string | null) {
    if (!this.selectedUserId) return;
    const key = this.getDmViewStorageKey(this.selectedUserId);
    try {
      if (timestamp) {
        localStorage.setItem(key, timestamp);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Unable to persist DM view timestamp', error);
    }
  }

  private markDmViewed(timestamp?: string) {
    const latest = timestamp || this.getLatestIncomingDmTimestamp();
    const value = latest || new Date().toISOString();
    this.lastDmViewTimestamp = value;
    this.hasDmAttention = false;
    this.persistDmViewTimestamp(value);
  }

  private ensureDmRecipientSelection() {
    if (this.selectedDmRecipientId || !this.dms.length) return;
    const nextConversation = this.dms.find((dm) => this.resolveDmPartnerId(dm));
    const partnerId = nextConversation ? this.resolveDmPartnerId(nextConversation) : null;
    if (partnerId) {
      this.selectedDmRecipientId = partnerId;
      this.dmForm.recipientId = partnerId;
    }
  }

  private resolveDmPartnerId(dm: DmMessage): string | null {
    if (!this.selectedUserId) return null;
    if (dm.senderId === this.selectedUserId) return dm.recipientId;
    if (dm.recipientId === this.selectedUserId) return dm.senderId;
    return null;
  }

  private isTokenExpired(token: string): boolean {
    const segments = token.split('.');
    if (segments.length !== 3) {
      return true;
    }
    try {
      const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = atob(normalized + padding);
      const payload = JSON.parse(decoded) as { exp?: unknown };
      if (payload.exp === undefined) {
        return false;
      }
      const expValue = Number(payload.exp);
      if (!Number.isFinite(expValue)) {
        return true;
      }
      const expMs = expValue > 1e12 ? expValue : expValue * 1000;
      return Date.now() >= expMs;
    } catch (error) {
      console.warn('Unable to inspect stored token expiry', error);
      return true;
    }
  }

  private resetWorkspaceState(clearUserSelection = false) {
    this.users = [];
    this.projects = [];
    this.tickets = [];
    this.dashboard = [];
    this.notifications = [];
    this.dms = [];
    this.selectedTicket = null;
    this.lockedTicket = null;
    this.activeTab = 'home';
    this.ticketSearch = '';
    this.messageDraft = '';
    this.projectsCollapsed = false;
    this.resetMentionSuggestions();
    this.resetSlashSuggestions();
    this.createTicketModel = {
      title: '',
      description: '',
      projectId: '',
      estimatedHours: 1,
      privacy: 'public',
      inviteeIds: [],
      priority: 'normal',
    };
    this.dmForm = {
      recipientId: '',
      body: '',
    };
    this.selectedDmRecipientId = '';
    this.hasDmAttention = false;
    this.lastDmViewTimestamp = null;
    this.feedback = '';
    this.ticketSettings = {
      priority: 'normal',
      estimatedHours: null,
    };
    this.isCreateProjectOpen = false;
    this.isCreateTicketOpen = false;
    this.selectedLog = null;
    this.expandedProjectId = '';
    this.selectedProjectId = '';
    this.hasUnseenGlobalReports = false;
    this.latestGlobalReportTimestamp = null;
    this.hasActivityAttention = false;
    this.lastActivityViewTimestamp = null;
    this.isLogoutConfirmOpen = false;
    this.isUserSettingsOpen = false;
    this.userSettingsSaving = false;
    this.userSettingsError = '';
    if (clearUserSelection) {
      this.selectedUserId = this.sessionUser?.id || '';
    }
  }

  async handleLogin() {
    if (!this.loginForm.username || !this.loginForm.password) {
      this.loginError = 'Username and password are required.';
      return;
    }
    this.authLoading = true;
    this.loginError = '';
    try {
      const response = await firstValueFrom(this.api.login({
        username: this.loginForm.username.trim(),
        password: this.loginForm.password,
      }));
      this.persistSession(response.token, response.user);
      this.sessionUser = response.user;
      this.selectedUserId = response.user.id;
      this.isAuthenticated = true;
      this.updateWorkspaceLabel(response.user.workspaceName);
      this.resetWorkspaceState();
      await this.bootstrapWorkspace();
    } catch (error) {
      console.error(error);
      this.loginError = 'Invalid username or password.';
    } finally {
      this.authLoading = false;
      this.loginForm.password = '';
    }
  }

  handleLogout() {
    this.isLogoutConfirmOpen = false;
    this.clearSessionStorage();
    this.sessionUser = null;
    this.isAuthenticated = false;
    this.resetWorkspaceState(true);
    this.lockedTicket = null;
    this.updateWorkspaceLabel();
  }

  openUserSettings() {
    if (!this.sessionUser) return;
    this.userSettingsForm = {
      displayName: this.sessionUser.displayName,
      handle: this.sessionUser.handle,
      location: this.sessionUser.location || '',
    };
    this.userSettingsSaving = false;
    this.userSettingsError = '';
    this.isUserSettingsOpen = true;
  }

  closeUserSettings() {
    this.isUserSettingsOpen = false;
    this.userSettingsSaving = false;
    this.userSettingsError = '';
  }

  openLogoutConfirm() {
    this.isLogoutConfirmOpen = true;
  }

  closeLogoutConfirm() {
    this.isLogoutConfirmOpen = false;
  }

  switchAuthMode(mode: 'login' | 'register') {
    this.authMode = mode;
    this.loginError = '';
    if (mode === 'login') {
      this.workspaceSuggestions = [];
    }
  }

  async handleRegister() {
    const workspaceName = this.registerForm.workspaceName.trim();
    if (
      !this.registerForm.displayName ||
      !this.registerForm.username ||
      !this.registerForm.email ||
      !this.registerForm.password ||
      !workspaceName
    ) {
      this.loginError = 'All fields are required.';
      return;
    }
    this.authLoading = true;
    this.loginError = '';
    try {
      const response = await firstValueFrom(
        this.api.register({
          displayName: this.registerForm.displayName.trim(),
          handle: this.registerForm.handle.trim(),
          email: this.registerForm.email.trim(),
          password: this.registerForm.password,
          location: this.registerForm.location.trim() || undefined,
          username: this.registerForm.username.trim(),
          workspaceName,
        })
      );
      this.persistSession(response.token, response.user);
      this.sessionUser = response.user;
      this.selectedUserId = response.user.id;
      this.isAuthenticated = true;
      this.updateWorkspaceLabel(response.user.workspaceName);
      this.resetWorkspaceState();
      await this.bootstrapWorkspace();
    } catch (error: any) {
      console.error(error);
      this.loginError = error?.error?.message || 'Registration failed.';
    } finally {
      this.authLoading = false;
      this.registerForm.password = '';
      this.registerForm.username = '';
    }
  }

  handleWorkspaceInput(value: string) {
    this.registerForm.workspaceName = value;
    if (this.workspaceLookupTimeout) {
      window.clearTimeout(this.workspaceLookupTimeout);
      this.workspaceLookupTimeout = null;
    }
    if (!value.trim()) {
      this.workspaceSuggestions = [];
      return;
    }
    this.workspaceLookupTimeout = window.setTimeout(() => {
      void this.fetchWorkspaceSuggestions(value.trim());
    }, 200);
  }

  selectWorkspaceSuggestion(workspace: WorkspaceSummary) {
    this.registerForm.workspaceName = workspace.name;
    this.workspaceSuggestions = [];
  }

  private async fetchWorkspaceSuggestions(query: string) {
    try {
      this.isWorkspaceLookupLoading = true;
      this.workspaceSuggestions = await firstValueFrom(this.api.getWorkspaces(query));
    } catch (error) {
      console.error('Unable to fetch workspaces', error);
      this.workspaceSuggestions = [];
    } finally {
      this.isWorkspaceLookupLoading = false;
    }
  }

  get filteredTickets(): Ticket[] {
    const search = this.ticketSearch.trim().toLowerCase();
    return this.tickets.filter((ticket) => {
      if (!search) return true;
      return (
        ticket.ticketNumber.toLowerCase().includes(search) ||
        ticket.title.toLowerCase().includes(search) ||
        ticket.status.toLowerCase().includes(search)
      );
    });
  }

  get ticketSearchResults() {
    const query = this.ticketSearch.trim().toLowerCase();
    if (!query) return [] as Array<{ ticket: Ticket; matches: string[] }>;
    return this.tickets
      .map((ticket) => {
        const matches: string[] = [];
        if (ticket.ticketNumber.toLowerCase().includes(query)) {
          matches.push(`Matches ticket number ${ticket.ticketNumber}`);
        }
        if (ticket.title.toLowerCase().includes(query)) {
          matches.push(`Title: ${this.extractSnippet(ticket.title, query)}`);
        }
        if (ticket.description && ticket.description.toLowerCase().includes(query)) {
          matches.push(`Description: ${this.extractSnippet(ticket.description, query)}`);
        }
        if (ticket.status?.toLowerCase().includes(query)) {
          matches.push(`Status: ${ticket.status.replace('_', ' ')}`);
        }
        return matches.length ? { ticket, matches } : null;
      })
      .filter((value): value is { ticket: Ticket; matches: string[] } => Boolean(value))
      .slice(0, 5);
  }

  getTicketsByCategory(projectId: string) {
    return this.ticketCategoryConfig.map((category) => ({
      ...category,
      items: this.tickets.filter(
        (ticket) => ticket.projectId === projectId && ticket.status === category.key
      ),
    }));
  }

  get isTicketMember(): boolean {
    if (!this.selectedUserId) return false;
    if (!this.selectedTicket) return false;
    if (typeof this.selectedTicket.viewerIsMember === 'boolean') {
      return this.selectedTicket.viewerIsMember;
    }
    return this.selectedTicket.members.some((member) => member.userId === this.selectedUserId);
  }

  get canAssign(): boolean {
    return Boolean(this.selectedTicket && this.selectedUserId);
  }

  isMemberOfSelected(userId: string): boolean {
    if (!this.selectedTicket) return false;
    return this.selectedTicket.members.some((member) => member.userId === userId);
  }

  getUserName(userId?: string | null): string {
    if (!userId) return 'Unassigned';
    return this.users.find((user) => user.id === userId)?.displayName || 'Unknown';
  }

  async handleSearchNavigate(ticketId: string) {
    this.ticketSearch = '';
    await this.selectTicket(ticketId);
    this.showMentionSuggestions = false;
    this.showSlashSuggestions = false;
  }

  async loadUsers() {
    this.users = await firstValueFrom(this.api.getUsers());
  }

  async loadProjects() {
    this.projects = await firstValueFrom(this.api.getProjects());
  }

  async loadTickets() {
    if (!this.selectedUserId) return;
    this.isLoadingTickets = true;
    try {
      this.tickets = await firstValueFrom(this.api.getTickets({}));
      if (this.selectedTicket) {
        const stillExists = this.tickets.some((ticket) => ticket.id === this.selectedTicket?.id);
        if (!stillExists) {
          this.selectedTicket = null;
        }
      }
      if (this.lockedTicket) {
        const stillLockedExists = this.tickets.some((ticket) => ticket.id === this.lockedTicket?.id);
        if (!stillLockedExists) {
          this.lockedTicket = null;
        }
      }
      if (this.selectedTicket || this.lockedTicket) {
        await this.refreshTicketDetail();
      }
    } finally {
      this.isLoadingTickets = false;
    }
  }

  async loadDashboard() {
    const filters = this.getDashboardFilters();
    this.dashboard = await firstValueFrom(this.api.getDashboard(filters));
  }

  async handleDashboardRangeChange(range: '7d' | '30d' | '90d' | 'all' | 'custom') {
    this.dashboardRange = range;
    if (range !== 'custom') {
      this.dashboardStartDate = null;
      this.dashboardEndDate = null;
      await this.loadDashboard();
    }
  }

  async handleDashboardDateChange(type: 'start' | 'end', value: string | null) {
    if (type === 'start') {
      this.dashboardStartDate = value || null;
    } else {
      this.dashboardEndDate = value || null;
    }
    if (this.dashboardRange === 'custom' && this.dashboardStartDate && this.dashboardEndDate) {
      await this.loadDashboard();
    }
  }

  private getDashboardFilters(): { startDate?: string; endDate?: string } | undefined {
    if (this.dashboardRange === 'all') {
      return undefined;
    }
    if (this.dashboardRange === 'custom') {
      if (this.dashboardStartDate && this.dashboardEndDate) {
        const start = new Date(`${this.dashboardStartDate}T00:00:00`);
        const end = new Date(`${this.dashboardEndDate}T23:59:59`);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
      }
      return undefined;
    }
    const dayMap: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = dayMap[this.dashboardRange];
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    return { startDate: start, endDate: end };
  }

  private syncTicketSettings(ticket: TicketDetail | null) {
    if (!ticket) {
      this.ticketSettings = {
        priority: 'normal',
        estimatedHours: null,
      };
      return;
    }
    this.ticketSettings = {
      priority: (ticket.priority as TicketPriority) || 'normal',
      estimatedHours: ticket.estimatedHours == null ? null : Number(ticket.estimatedHours),
    };
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 64);
  }

  async handleCreateProject() {
    if (!this.createProjectModel.name || !this.createProjectModel.ticketPrefix) {
      this.feedback = 'Project name and prefix are required.';
      return;
    }
    const slug = this.slugify(this.createProjectModel.slug || this.createProjectModel.name);
    if (!slug) {
      this.feedback = 'Unable to generate a valid project slug.';
      return;
    }
    try {
      const response: any = await firstValueFrom(
        this.api.createProject({
          name: this.createProjectModel.name.trim(),
          slug,
          ticketPrefix: this.createProjectModel.ticketPrefix.trim(),
          description: this.createProjectModel.description.trim() || undefined,
        })
      );
      this.createProjectModel = {
        name: '',
        slug: '',
        ticketPrefix: '',
        description: '',
      };
      await this.loadProjects();
      if (response?.id) {
        this.selectedProjectId = response.id;
        this.createTicketModel.projectId = response.id;
        await this.loadTickets();
      }
      this.feedback = 'Project created.';
    } catch (error: any) {
      console.error(error);
      this.feedback = error?.error?.message || 'Project creation failed.';
    }
  }

  private async updateTicketSettings(partial: {
    priority?: TicketPriority;
    estimatedHours?: number | null;
    status?: 'open' | 'in_progress' | 'archived';
  }) {
    if (!this.selectedTicket || !this.selectedUserId) return;
    await firstValueFrom(
      this.api.updateTicketSettings(this.selectedTicket.id, {
        actorId: this.selectedUserId,
        ...partial,
      })
    );
    await this.refreshTicketDetail(this.selectedTicket.id);
    await this.loadTickets();
  }

  async handlePriorityChange(priority: TicketPriority) {
    if (!this.selectedTicket || priority === this.selectedTicket.priority) return;
    this.ticketSettings.priority = priority;
    await this.updateTicketSettings({ priority });
  }

  async handleEstimatedHoursSave() {
    if (!this.selectedTicket) return;
    const raw = this.ticketSettings.estimatedHours;
    const hours = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    await this.updateTicketSettings({ estimatedHours: hours });
  }

  openCreateProject() {
    this.isCreateProjectOpen = true;
  }

  closeCreateProject() {
    this.isCreateProjectOpen = false;
  }

  openCreateTicket() {
    this.isCreateTicketOpen = true;
  }

  closeCreateTicket() {
    this.isCreateTicketOpen = false;
  }

  viewLogDetails(log: TicketLog) {
    this.selectedLog = log;
  }

  clearSelectedLog() {
    this.selectedLog = null;
  }

  closeProjectReports() {
    this.projectReportEntries = [];
    this.viewingReportsForProjectId = '';
    this.viewingReportsForProjectName = '';
    this.projectReportsLoading = false;
    this.isGlobalReportView = false;
  }

  async handleGlobalReportView(event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.projectReportsLoading = true;
    try {
      this.viewingReportsForProjectId = this.globalReportProjectId;
      this.viewingReportsForProjectName = 'All projects';
      this.isGlobalReportView = true;
      this.projectReportEntries = await firstValueFrom(this.api.getAllReports());
      this.selectedTicket = null;
      this.lockedTicket = null;
      this.selectedLog = null;
      this.markGlobalReportsSeen(this.projectReportEntries[0]?.createdAt || null);
    } catch (error) {
      console.error(error);
      this.closeProjectReports();
    } finally {
      this.projectReportsLoading = false;
    }
  }

  private async checkGlobalReports() {
    if (!this.selectedUserId) return;
    try {
      const reports = await firstValueFrom(this.api.getAllReports());
      const latest = reports[0]?.createdAt || null;
      this.latestGlobalReportTimestamp = latest;
      if (!latest) {
        this.hasUnseenGlobalReports = false;
        return;
      }
      const lastSeen = this.getLastSeenGlobalReportTimestamp();
      const latestTime = new Date(latest).getTime();
      const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : NaN;
      this.hasUnseenGlobalReports =
        !lastSeen || !Number.isFinite(lastSeenTime) || latestTime > lastSeenTime;
    } catch (error) {
      console.error('Unable to check report-of-work updates', error);
    }
  }

  private updateActivityAttention() {
    if (!this.notifications.length) {
      this.hasActivityAttention = false;
      return;
    }
    const relevant = this.notifications.filter((notification) =>
      this.isAttentionNotification(notification)
    );
    if (!relevant.length) {
      this.hasActivityAttention = false;
      return;
    }
    const lastViewedTime = this.lastActivityViewTimestamp
      ? new Date(this.lastActivityViewTimestamp).getTime()
      : NaN;
    if (!Number.isFinite(lastViewedTime)) {
      this.hasActivityAttention = true;
      return;
    }
    this.hasActivityAttention = relevant.some((notification) => {
      const createdAt = new Date(notification.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt > lastViewedTime;
    });
  }

  private isAttentionNotification(notification: NotificationItem): boolean {
    const message = notification.message?.toLowerCase();
    if (!message) return false;
    if (message.includes('mentioned you') || message.includes('assigned you')) {
      return true;
    }
    if (message.includes('assigned')) {
      const displayName = this.sessionUser?.displayName?.toLowerCase();
      if (displayName && message.includes(displayName)) {
        return true;
      }
    }
    return false;
  }

  private isDmNotification(notification: NotificationItem): boolean {
    if (notification.ticketId) {
      return false;
    }
    const message = notification.message?.toLowerCase() || '';
    return message.includes('sent you a dm');
  }

  private getLatestIncomingDmTimestamp(): string | null {
    if (!this.selectedUserId) return null;
    const incoming = this.dms
      .filter((dm) => dm.senderId !== this.selectedUserId)
      .map((dm) => dm.createdAt);
    if (!incoming.length) return null;
    return incoming.reduce((latest, current) =>
      new Date(current).getTime() > new Date(latest).getTime() ? current : latest
    );
  }

  private updateDmAttention(latestIncoming?: string | null) {
    if (!this.selectedUserId) {
      this.hasDmAttention = false;
      return;
    }
    const latest = latestIncoming ?? this.getLatestIncomingDmTimestamp();
    if (!latest) {
      this.hasDmAttention = false;
      return;
    }
    const lastViewedTime = this.lastDmViewTimestamp
      ? new Date(this.lastDmViewTimestamp).getTime()
      : NaN;
    if (!Number.isFinite(lastViewedTime)) {
      this.hasDmAttention = true;
      return;
    }
    const latestTime = new Date(latest).getTime();
    this.hasDmAttention = Number.isFinite(latestTime) && latestTime > lastViewedTime;
  }

  async loadNotifications() {
    if (!this.selectedUserId) return;
    if (!this.lastActivityViewTimestamp) {
      this.lastActivityViewTimestamp = this.restoreActivityViewTimestamp();
    }
    this.notifications = await firstValueFrom(this.api.getNotifications());
    this.updateActivityAttention();
    void this.checkGlobalReports();
  }

  async loadDms() {
    if (!this.selectedUserId) return;
    if (!this.lastDmViewTimestamp) {
      this.lastDmViewTimestamp = this.restoreDmViewTimestamp();
    }
    this.dms = await firstValueFrom(this.api.getDms());
    if (this.selectedDmRecipientId) {
      this.dmForm.recipientId = this.selectedDmRecipientId;
    } else {
      this.ensureDmRecipientSelection();
    }
    const latestIncoming = this.getLatestIncomingDmTimestamp();
    if (this.activeTab === 'dms') {
      this.markDmViewed(latestIncoming || undefined);
    } else {
      this.updateDmAttention(latestIncoming);
    }
  }

  async selectTicket(ticketId: string) {
    this.lockedTicket = null;
    this.closeProjectReports();
    try {
      this.selectedTicket = await firstValueFrom(this.api.getTicket(ticketId));
      this.messageDraft = '';
      this.resetMentionSuggestions();
      this.resetSlashSuggestions();
      this.lockedTicket = null;
      this.syncTicketSettings(this.selectedTicket);
      this.selectedLog = null;
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
        this.syncTicketSettings(null);
        this.selectedLog = null;
      } else {
        console.error(error);
      }
    }
  }

  async refreshTicketDetail(ticketId?: string) {
    const targetId = ticketId || this.selectedTicket?.id || this.lockedTicket?.id;
    if (!targetId) return;
    try {
      this.selectedTicket = await firstValueFrom(this.api.getTicket(targetId));
      this.lockedTicket = null;
      this.syncTicketSettings(this.selectedTicket);
      this.selectedLog = null;
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
        this.syncTicketSettings(null);
        this.selectedLog = null;
      } else {
        console.error(error);
      }
    }
  }

  async handleCreateTicket() {
    if (!this.selectedUserId || !this.createTicketModel.title || !this.createTicketModel.projectId) {
      this.feedback = 'Please complete the ticket form.';
      return;
    }
    try {
      const selectedProject = this.createTicketModel.projectId;
      const selectedPrivacy = this.createTicketModel.privacy;
      const selectedPriority = this.createTicketModel.priority;
      const ticket = await firstValueFrom(
        this.api.createTicket({
          title: this.createTicketModel.title,
          description: this.createTicketModel.description,
          projectId: this.createTicketModel.projectId,
          creatorId: this.selectedUserId,
          estimatedHours: this.createTicketModel.estimatedHours,
          privacy: this.createTicketModel.privacy,
          additionalMemberIds: this.createTicketModel.inviteeIds,
          priority: this.createTicketModel.priority,
        })
      );
      this.createTicketModel = {
        title: '',
        description: '',
        projectId: selectedProject,
        estimatedHours: 1,
        privacy: selectedPrivacy,
        inviteeIds: [],
        priority: selectedPriority,
      };
      await this.loadTickets();
      await this.selectTicket(ticket.id);
      this.feedback = `${ticket.ticketNumber} created.`;
    } catch (error) {
      console.error(error);
      this.feedback = 'Ticket creation failed.';
    }
  }

  async handlePostMessage(body?: string, skipCommandParsing = false) {
    if (!this.selectedTicket || !this.selectedUserId || !this.isTicketMember) return;
    const payload = body ?? this.messageDraft.trim();
    if (!payload) return;
    const handledCommand = skipCommandParsing ? false : await this.tryHandleTicketCommand(payload);
    if (handledCommand) {
      if (!body) {
        this.messageDraft = '';
        this.resetMentionSuggestions();
        this.resetSlashSuggestions();
      }
      return;
    }
    this.isPostingMessage = true;
    try {
      await firstValueFrom(
        this.api.postTicketMessage(this.selectedTicket.id, {
          userId: this.selectedUserId,
          body: payload,
        })
      );
      if (!body) {
        this.messageDraft = '';
        this.resetMentionSuggestions();
        this.resetSlashSuggestions();
      }
      await this.refreshTicketDetail();
      await this.loadTickets();
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
    } finally {
      this.isPostingMessage = false;
    }
  }

  handleMessageInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.messageDraft = target.value;
    const caretPosition = target.selectionStart ?? this.messageDraft.length;
    this.updateMentionContext(caretPosition);
    this.updateSlashContext(caretPosition);
  }

  handleMessageFocus() {
    if (this.suggestionHideTimeout) {
      window.clearTimeout(this.suggestionHideTimeout);
      this.suggestionHideTimeout = null;
    }
    this.updateMentionContext(this.messageCursorIndex);
    this.updateSlashContext(this.messageCursorIndex);
  }

  handleMessageBlur() {
    this.suggestionHideTimeout = window.setTimeout(() => {
      this.resetMentionSuggestions();
      this.resetSlashSuggestions();
    }, 120);
  }

  handleSelectMention(user: User) {
    if (!this.mentionReplaceRange) return;
    const before = this.messageDraft.slice(0, this.mentionReplaceRange.start);
    const after = this.messageDraft.slice(this.messageCursorIndex);
    const mentionValue = (user.username || user.handle).trim();
    const insertion = `@${mentionValue} `;
    const nextCursor = before.length + insertion.length;
    this.messageDraft = `${before}${insertion}${after}`;
    this.messageCursorIndex = nextCursor;
    this.resetMentionSuggestions();
    setTimeout(() => {
      const textarea = this.messageInputRef?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  handleSelectSlash(command: string) {
    if (!this.slashReplaceRange) return;
    const before = this.messageDraft.slice(0, this.slashReplaceRange.start);
    const after = this.messageDraft.slice(this.messageCursorIndex);
    const insertion = `${command} `;
    const nextCursor = before.length + insertion.length;
    this.messageDraft = `${before}${insertion}${after}`;
    this.messageCursorIndex = nextCursor;
    this.resetSlashSuggestions();
    setTimeout(() => {
      const textarea = this.messageInputRef?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  private updateMentionContext(caretIndex: number) {
    this.messageCursorIndex = caretIndex;
    const textBeforeCaret = this.messageDraft.slice(0, caretIndex);
    const mentionMatch = textBeforeCaret.match(/(?:^|\s)@([\w-]*)$/i);
    if (!mentionMatch) {
      this.resetMentionSuggestions();
      return;
    }
    const query = mentionMatch[1] || '';
    const mentionStart = caretIndex - query.length - 1;
    if (mentionStart < 0) {
      this.resetMentionSuggestions();
      return;
    }
    this.mentionReplaceRange = { start: mentionStart, end: caretIndex };
    this.mentionQuery = query.toLowerCase();
    this.mentionSuggestions = this.buildMentionSuggestions(this.mentionQuery);
    this.showMentionSuggestions = this.mentionSuggestions.length > 0;
  }

  private updateSlashContext(caretIndex: number) {
    this.messageCursorIndex = caretIndex;
    const textBeforeCaret = this.messageDraft.slice(0, caretIndex);
    const slashMatch = textBeforeCaret.match(/(?:^|\s)\/([\w]*)$/);
    if (!slashMatch) {
      this.resetSlashSuggestions();
      return;
    }
    const query = slashMatch[1] || '';
    const slashStart = caretIndex - query.length - 1;
    if (slashStart < 0) {
      this.resetSlashSuggestions();
      return;
    }
    const suggestions = this.buildSlashSuggestions();
    this.slashReplaceRange = { start: slashStart, end: caretIndex };
    this.slashSuggestions = suggestions;
    this.showSlashSuggestions = suggestions.length > 0;
  }

  private async tryHandleTicketCommand(payload: string): Promise<boolean> {
    if (!this.selectedTicket || !this.selectedUserId) return false;
    const trimmed = payload.trim();
    if (!trimmed) return false;

    if (trimmed.toLowerCase() === '/start') {
      await this.handlePostMessage('start ticket', true);
      return true;
    }

    if (trimmed.toLowerCase() === '/archive') {
      await this.handleArchiveTicket();
      return true;
    }

    const estimateMatch = trimmed.match(/^\/e[-\s]?([0-9]+(?:\.[0-9]+)?)$/i);
    if (estimateMatch) {
      const hours = Number(estimateMatch[1]);
      if (Number.isNaN(hours)) {
        this.feedback = 'Provide a valid number after e for estimated hours.';
        return true;
      }
      try {
        this.ticketSettings.estimatedHours = hours;
        await this.updateTicketSettings({ estimatedHours: hours });
        this.feedback = `Estimated time updated to ${hours}h.`;
      } catch (error) {
        console.error(error);
        this.feedback = 'Unable to update estimate via command.';
      }
      return true;
    }

    const assignCommandMatch = trimmed.match(/^\/a-@?([\w.-]+)$/i);
    if (assignCommandMatch) {
      const identifier = assignCommandMatch[1].toLowerCase();
      const targetUser = this.users.find((user) => {
        const username = user.username?.toLowerCase();
        const handle = user.handle?.toLowerCase();
        return username === identifier || handle === identifier;
      });
      if (!targetUser) {
        this.feedback = `No teammate found for @${identifier}.`;
        return true;
      }
      try {
        await this.handleAssignTo(targetUser.id);
        this.feedback = `Ticket assigned to ${targetUser.displayName}.`;
      } catch (error) {
        console.error(error);
        this.feedback = 'Unable to assign ticket via command.';
      }
      return true;
    }

    return false;
  }

  private buildMentionSuggestions(query: string): User[] {
    const normalized = query.trim();
    return this.users
      .filter((user) => {
        if (!normalized) return true;
        const haystack = `${user.displayName} ${user.handle} ${user.username ?? ''}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 8);
  }

  private buildSlashSuggestions(): string[] {
    return ['/start', '/archive', '/a-@username', '/e-hours'];
  }

  formatMessageBody(message: TicketMessage): string {
    if (!message?.body) return '';
    let formatted = message.body;
    if (Array.isArray(message.mentions) && message.mentions.length) {
      for (const mention of message.mentions) {
        if (!mention) continue;
        const normalized = mention.toLowerCase();
        const user = this.users.find((candidate) => {
          const usernameMatch = candidate.username
            ? candidate.username.toLowerCase() === normalized
            : false;
          return candidate.handle.toLowerCase() === normalized || usernameMatch;
        });
        const fallbackMember = this.selectedTicket?.members.find((member) => {
          const usernameMatch = member.username
            ? member.username.toLowerCase() === normalized
            : false;
          return member.handle.toLowerCase() === normalized || usernameMatch;
        });
        const displayName = user?.displayName || fallbackMember?.displayName;
        if (!displayName) continue;
        const escapedHandle = this.escapeRegExp(mention);
        const pattern = new RegExp(`@${escapedHandle}\\b`, 'gi');
        formatted = formatted.replace(pattern, `@${displayName}`);
      }
    }
    return formatted;
  }

  private resetMentionSuggestions() {
    this.mentionSuggestions = [];
    this.showMentionSuggestions = false;
    this.mentionQuery = '';
    this.mentionReplaceRange = null;
  }

  private resetSlashSuggestions() {
    this.slashSuggestions = [];
    this.showSlashSuggestions = false;
    this.slashReplaceRange = null;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  private extractSnippet(text: string, query: string) {
    const lower = text.toLowerCase();
    const index = lower.indexOf(query);
    if (index === -1) return text.substring(0, 50);
    const start = Math.max(0, index - 15);
    const end = Math.min(text.length, index + query.length + 15);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return `${prefix}${text.substring(start, end)}${suffix}`;
  }

  handleStartTicketClick() {
    this.handlePostMessage('start ticket', true).catch((error) => console.error(error));
  }

  async handleJoinTicket(targetUserId?: string) {
    const ticketId = this.selectedTicket?.id || this.lockedTicket?.id;
    if (!ticketId || !this.selectedUserId) return;
    const joinUserId = targetUserId || this.selectedUserId;
    try {
      await firstValueFrom(
        this.api.joinTicket(ticketId, {
          userId: joinUserId,
          actorId: this.selectedUserId,
        })
      );
      await this.loadTickets();
      await this.refreshTicketDetail(ticketId);
      this.feedback = targetUserId ? 'Teammate invited to ticket.' : 'Joined ticket.';
    } catch (error: any) {
      console.error(error);
      this.feedback = error?.error?.message || 'Unable to join ticket.';
    }
  }

  async handleAssignTo(userId: string) {
    if (!this.selectedTicket || !this.selectedUserId || !userId) return;
    await firstValueFrom(this.api.assignTicket(this.selectedTicket.id, userId, this.selectedUserId));
    await this.refreshTicketDetail();
  }

  async handleArchiveTicket() {
    if (!this.selectedTicket || !this.selectedUserId) return;
    const ticketId = this.selectedTicket.id;
    await firstValueFrom(this.api.archiveTicket(ticketId, this.selectedUserId));
    this.selectedTicket = null;
    await this.loadTickets();
  }

  async handleRestoreArchivedTicket() {
    if (!this.selectedTicket || this.selectedTicket.status !== 'archived') return;
    await this.updateTicketSettings({ status: 'in_progress' });
    this.feedback = 'Ticket restarted and moved to In progress.';
  }

  async handlePrivacyChange(privacy: TicketPrivacy) {
    if (!this.selectedTicket || !this.selectedUserId) return;
    if (this.selectedTicket.privacy === privacy) return;
    try {
      await firstValueFrom(
        this.api.updateTicketPrivacy(this.selectedTicket.id, {
          actorId: this.selectedUserId,
          privacy,
        })
      );
      await this.refreshTicketDetail(this.selectedTicket.id);
      await this.loadTickets();
      this.feedback = `Ticket marked ${privacy}.`;
    } catch (error: any) {
      console.error(error);
      this.feedback = error?.error?.message || 'Unable to update privacy.';
    }
  }

  async handleSendDm() {
    if (!this.selectedUserId || !this.dmForm.recipientId || !this.dmForm.body.trim()) return;
    await firstValueFrom(
      this.api.sendDm({
        senderId: this.selectedUserId,
        recipientId: this.dmForm.recipientId,
        body: this.dmForm.body,
      })
    );
    this.dmForm.body = '';
    this.selectedDmRecipientId = this.dmForm.recipientId;
    await this.loadDms();
    await this.loadNotifications();
  }

  handleDmRecipientChange(userId: string) {
    this.selectedDmRecipientId = userId;
    this.dmForm.recipientId = userId;
  }

  async handleSaveUserSettings() {
    if (!this.sessionUser) return;
    const trimmedName = this.userSettingsForm.displayName.trim();
    const trimmedHandle = this.userSettingsForm.handle.trim();
    const trimmedLocation = this.userSettingsForm.location.trim();
    const updates: { displayName?: string; handle?: string; location?: string | null } = {};
    if (trimmedName && trimmedName !== this.sessionUser.displayName) {
      updates.displayName = trimmedName;
    }
    if (trimmedHandle && trimmedHandle !== this.sessionUser.handle) {
      updates.handle = trimmedHandle;
    }
    if (trimmedLocation !== (this.sessionUser.location || '')) {
      updates.location = trimmedLocation || null;
    }
    if (!Object.keys(updates).length) {
      this.userSettingsError = 'No changes to save.';
      return;
    }
    this.userSettingsSaving = true;
    this.userSettingsError = '';
    try {
      const updatedUser = await firstValueFrom(this.api.updateUser(this.sessionUser.id, updates));
      this.sessionUser = { ...this.sessionUser, ...updatedUser };
      this.selectedUserId = updatedUser.id;
      this.persistUserProfile(updatedUser);
      this.updateWorkspaceLabel(this.sessionUser.workspaceName);
      this.users = this.users.map((user) => (user.id === updatedUser.id ? updatedUser : user));
      await this.loadUsers();
      this.feedback = 'Profile updated.';
      this.closeUserSettings();
    } catch (error: any) {
      console.error(error);
      this.userSettingsError = error?.error?.message || 'Unable to update profile.';
    } finally {
      this.userSettingsSaving = false;
    }
  }

  get selectedDmThread(): DmMessage[] {
    if (!this.selectedUserId || !this.selectedDmRecipientId) return [];
    return this.dms
      .filter(
        (dm) =>
          (dm.senderId === this.selectedUserId && dm.recipientId === this.selectedDmRecipientId) ||
          (dm.senderId === this.selectedDmRecipientId && dm.recipientId === this.selectedUserId)
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async handleMarkNotification(notification: NotificationItem) {
    await firstValueFrom(this.api.markNotificationRead(notification.id));
    await this.loadNotifications();
  }

  async navigateToNotificationTicket(notification: NotificationItem) {
    const ticketId = notification.ticketId;
    if (!ticketId) return;
    this.setActiveTab('home');
    await this.selectTicket(ticketId);
    if (!notification.isRead) {
      await this.handleMarkNotification(notification);
    }
  }

  setActiveTab(tab: 'dashboard' | 'home' | 'dms' | 'activity') {
    this.activeTab = tab;
    if (tab === 'activity') {
      this.markActivityViewed();
      void this.loadNotifications();
    } else if (tab === 'dms') {
      this.markDmViewed();
      void this.loadDms();
    } else if (tab === 'dashboard') {
      void this.loadDashboard();
    } else if (tab === 'home') {
      void this.loadTickets();
    }
  }

  openDeleteProjectDialog(project: Project) {
    this.projectPendingDeletion = project;
    this.isDeleteProjectOpen = true;
  }

  closeDeleteProjectDialog() {
    this.projectPendingDeletion = null;
    this.isDeleteProjectOpen = false;
  }

  async confirmDeleteProject() {
    if (!this.projectPendingDeletion) return;
    const { id: projectId, name } = this.projectPendingDeletion;
    this.closeDeleteProjectDialog();
    try {
      await firstValueFrom(this.api.deleteProject(projectId));
      this.feedback = `Project "${name}" deleted.`;
      await this.loadProjects();
      if (this.selectedProjectId === projectId) {
        this.selectedProjectId = '';
        this.expandedProjectId = '';
        this.createTicketModel.projectId = '';
        this.selectedTicket = null;
        this.lockedTicket = null;
      }
      await this.loadTickets();
    } catch (error: any) {
      console.error(error);
      this.feedback = error?.error?.message || 'Unable to delete project.';
    }
  }

  handleProjectChange(projectId: string) {
    if (this.expandedProjectId === projectId) {
      this.expandedProjectId = '';
      return;
    }
    this.selectedProjectId = projectId;
    this.expandedProjectId = projectId;
    this.createTicketModel.projectId = projectId;
    this.selectedTicket = null;
    this.lockedTicket = null;
    this.syncTicketSettings(null);
    this.closeProjectReports();
    void this.loadTickets();
  }

  getProjectTicketCount(projectId: string): number {
    return this.tickets.filter((ticket) => ticket.projectId === projectId).length;
  }

  toggleProjectsCollapsed() {
    this.projectsCollapsed = !this.projectsCollapsed;
  }

  get activityUnreadCount(): number {
    return this.activityNotifications.filter((notification) => !notification.isRead).length;
  }

  get activityNotifications(): NotificationItem[] {
    return this.notifications.filter((notification) => !this.isDmNotification(notification));
  }

  get projectLabel(): string {
    const project = this.projects.find((chan) => chan.id === this.selectedProjectId);
    return project ? project.name : 'Select project';
  }

  get headerTitle(): string {
    switch (this.activeTab) {
      case 'dashboard':
        return 'Dashboard overview';
      case 'home':
        return this.projectLabel;
      case 'dms':
        return 'Direct messages';
      case 'activity':
        return 'Activity';
      default:
        return this.projectLabel;
    }
  }

  get headerSubtitle(): string {
    if (this.activeTab === 'home') {
      return `Workspace: ${this.workspaceLabel}`;
    }
    if (this.sessionUser) {
      return `Signed in as ${this.sessionUser.displayName} - @${this.sessionUser.handle}`;
    }
    return this.workspaceLabel;
  }

}

import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ApiService,
  Channel,
  ChannelReportEntry,
  DashboardEntry,
  DmMessage,
  NotificationItem,
  Ticket,
  TicketDetail,
  TicketPrivacy,
  TicketPriority,
  TicketLog,
  User,
} from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('messageInput') messageInputRef?: ElementRef<HTMLTextAreaElement>;

  title = 'Project and Ticket Management System';
  workspaceLabel = 'Mission Control Workspace';

  users: User[] = [];
  channels: Channel[] = [];
  tickets: Ticket[] = [];
  dashboard: DashboardEntry[] = [];
  notifications: NotificationItem[] = [];
  dms: DmMessage[] = [];
  private readonly ticketCategoryConfig = [
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'archived', label: 'Archived' },
  ] as const;

  selectedUserId = '';
  selectedChannelId = '';
  selectedTicket: TicketDetail | null = null;
  lockedTicket: { id: string; ticketNumber: string; title: string; privacy: TicketPrivacy } | null = null;
  activeTab: 'dashboard' | 'home' | 'dms' | 'activity' = 'home';
  channelsCollapsed = false;
  ticketCategoryCollapsed: Record<string, boolean> = {};

  ticketSearch = '';
  messageDraft = '';
  mentionSuggestions: User[] = [];
  mentionQuery = '';
  showMentionSuggestions = false;
  createTicketModel = {
    title: '',
    description: '',
    channelId: '',
    estimatedHours: 1,
    privacy: 'public' as TicketPrivacy,
    inviteeIds: [] as string[],
    priority: 'normal' as TicketPriority,
  };
  createChannelModel = {
    name: '',
    slug: '',
    ticketPrefix: '',
    description: '',
  };
  dmForm = {
    recipientId: '',
    body: '',
  };

  isLoadingTickets = false;
  isPostingMessage = false;
  feedback = '';
  isAuthenticated = false;
  authLoading = false;
  loginError = '';
  loginForm = {
    handle: '',
    password: '',
  };
  registerForm = {
    displayName: '',
    handle: '',
    email: '',
    password: '',
    location: '',
  };
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
  readonly ticketStatusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'archived', label: 'Archived' },
  ];
  ticketSettings = {
    status: 'open',
    priority: 'normal' as TicketPriority,
    estimatedHours: null as number | null | '',
  };
  showTicketSettings = false;
  selectedLog: TicketLog | null = null;
  isCreateChannelOpen = false;
  isCreateTicketOpen = false;
  private mentionReplaceRange: { start: number; end: number } | null = null;
  private messageCursorIndex = 0;
  private mentionHideTimeout: number | null = null;
  channelReportEntries: ChannelReportEntry[] = [];
  viewingReportsForChannelId = '';
  viewingReportsForChannelName = '';
  channelReportsLoading = false;

  constructor(private readonly api: ApiService) {}

  async ngOnInit() {
    const storedToken = this.getStoredToken();
    const storedUser = this.getStoredUser();
    if (storedToken && storedUser) {
      this.sessionUser = storedUser;
      this.selectedUserId = storedUser.id;
      this.isAuthenticated = true;
      await this.bootstrapWorkspace();
    }
  }

  private async bootstrapWorkspace() {
    if (!this.isAuthenticated) return;
    await Promise.all([this.loadUsers(), this.loadChannels()]);
    if (!this.selectedUserId && this.sessionUser) {
      this.selectedUserId = this.sessionUser.id;
    }
    if (this.channels.length) {
      this.selectedChannelId = this.channels[0].id;
      this.createTicketModel.channelId = this.channels[0].id;
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
      return raw ? (JSON.parse(raw) as User) : null;
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

  private clearSessionStorage() {
    try {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
    } catch (error) {
      console.error('Unable to clear auth storage', error);
    }
  }

  private resetWorkspaceState(clearUserSelection = false) {
    this.users = [];
    this.channels = [];
    this.tickets = [];
    this.dashboard = [];
    this.notifications = [];
    this.dms = [];
    this.selectedTicket = null;
    this.lockedTicket = null;
    this.activeTab = 'home';
    this.ticketSearch = '';
    this.messageDraft = '';
    this.channelsCollapsed = false;
    this.ticketCategoryCollapsed = {};
    this.resetMentionSuggestions();
    this.createTicketModel = {
      title: '',
      description: '',
      channelId: '',
      estimatedHours: 1,
      privacy: 'public',
      inviteeIds: [],
      priority: 'normal',
    };
    this.dmForm = {
      recipientId: '',
      body: '',
    };
    this.feedback = '';
    this.ticketSettings = {
      status: 'open',
      priority: 'normal',
      estimatedHours: null,
    };
    this.isCreateChannelOpen = false;
    this.isCreateTicketOpen = false;
    this.showTicketSettings = false;
    this.selectedLog = null;
    if (clearUserSelection) {
      this.selectedUserId = this.sessionUser?.id || '';
      this.selectedChannelId = '';
    }
  }

  async handleLogin() {
    if (!this.loginForm.handle || !this.loginForm.password) {
      this.loginError = 'Handle and password are required.';
      return;
    }
    this.authLoading = true;
    this.loginError = '';
    try {
      const response = await firstValueFrom(this.api.login({
        handle: this.loginForm.handle.trim(),
        password: this.loginForm.password,
      }));
      this.persistSession(response.token, response.user);
      this.sessionUser = response.user;
      this.selectedUserId = response.user.id;
      this.isAuthenticated = true;
      this.resetWorkspaceState();
      await this.bootstrapWorkspace();
    } catch (error) {
      console.error(error);
      this.loginError = 'Invalid handle or password.';
    } finally {
      this.authLoading = false;
      this.loginForm.password = '';
    }
  }

  handleLogout() {
    this.clearSessionStorage();
    this.sessionUser = null;
    this.isAuthenticated = false;
    this.resetWorkspaceState(true);
    this.lockedTicket = null;
  }

  switchAuthMode(mode: 'login' | 'register') {
    this.authMode = mode;
    this.loginError = '';
  }

  async handleRegister() {
    if (
      !this.registerForm.displayName ||
      !this.registerForm.handle ||
      !this.registerForm.email ||
      !this.registerForm.password
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
        })
      );
      this.persistSession(response.token, response.user);
      this.sessionUser = response.user;
      this.selectedUserId = response.user.id;
      this.isAuthenticated = true;
      this.resetWorkspaceState();
      await this.bootstrapWorkspace();
    } catch (error: any) {
      console.error(error);
      this.loginError = error?.error?.message || 'Registration failed.';
    } finally {
      this.authLoading = false;
      this.registerForm.password = '';
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

  get ticketsByCategory() {
    return this.ticketCategoryConfig.map((category) => ({
      ...category,
      items: this.tickets.filter((ticket) => ticket.status === category.key),
      collapsed: this.ticketCategoryCollapsed[category.key] || false,
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

  async loadUsers() {
    this.users = await firstValueFrom(this.api.getUsers());
  }

  async loadChannels() {
    this.channels = await firstValueFrom(this.api.getChannels());
  }

  async loadTickets() {
    if (!this.selectedUserId) return;
    this.isLoadingTickets = true;
    try {
      this.tickets = await firstValueFrom(
        this.api.getTickets({ channelId: this.selectedChannelId || undefined })
      );
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
      if (!this.selectedTicket && this.tickets.length) {
        await this.selectTicket(this.tickets[0].id);
      } else if (this.selectedTicket) {
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
        status: 'open',
        priority: 'normal',
        estimatedHours: null,
      };
      return;
    }
    this.ticketSettings = {
      status: ticket.status,
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

  async handleCreateChannel() {
    if (!this.createChannelModel.name || !this.createChannelModel.ticketPrefix) {
      this.feedback = 'Channel name and prefix are required.';
      return;
    }
    const slug = this.slugify(this.createChannelModel.slug || this.createChannelModel.name);
    if (!slug) {
      this.feedback = 'Unable to generate a valid channel slug.';
      return;
    }
    try {
      const response: any = await firstValueFrom(
        this.api.createChannel({
          name: this.createChannelModel.name.trim(),
          slug,
          ticketPrefix: this.createChannelModel.ticketPrefix.trim(),
          description: this.createChannelModel.description.trim() || undefined,
        })
      );
      this.createChannelModel = {
        name: '',
        slug: '',
        ticketPrefix: '',
        description: '',
      };
      await this.loadChannels();
      if (response?.id) {
        this.selectedChannelId = response.id;
        this.createTicketModel.channelId = response.id;
        await this.loadTickets();
      }
      this.feedback = 'Channel created.';
    } catch (error: any) {
      console.error(error);
      this.feedback = error?.error?.message || 'Channel creation failed.';
    }
  }

  private async updateTicketSettings(partial: {
    status?: string;
    priority?: TicketPriority;
    estimatedHours?: number | null;
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

  async handleStatusChange(newStatus: string) {
    if (!this.selectedTicket || newStatus === this.selectedTicket.status) return;
    this.ticketSettings.status = newStatus as any;
    await this.updateTicketSettings({ status: newStatus });
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

  openCreateChannel() {
    this.isCreateChannelOpen = true;
  }

  closeCreateChannel() {
    this.isCreateChannelOpen = false;
  }

  openCreateTicket() {
    this.isCreateTicketOpen = true;
  }

  closeCreateTicket() {
    this.isCreateTicketOpen = false;
  }

  toggleTicketSettings() {
    this.showTicketSettings = !this.showTicketSettings;
  }

  viewLogDetails(log: TicketLog) {
    this.selectedLog = log;
  }

  clearSelectedLog() {
    this.selectedLog = null;
  }

  closeChannelReports() {
    this.channelReportEntries = [];
    this.viewingReportsForChannelId = '';
    this.viewingReportsForChannelName = '';
    this.channelReportsLoading = false;
  }

  async handleChannelReportView(channel: Channel, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.channelReportsLoading = true;
    try {
      this.viewingReportsForChannelId = channel.id;
      this.viewingReportsForChannelName = channel.name;
      this.selectedChannelId = channel.id;
      this.createTicketModel.channelId = channel.id;
      this.channelReportEntries = await firstValueFrom(this.api.getChannelReports(channel.id));
      this.selectedTicket = null;
      this.lockedTicket = null;
      this.selectedLog = null;
    } catch (error) {
      console.error(error);
      this.closeChannelReports();
    } finally {
      this.channelReportsLoading = false;
    }
  }

  async loadNotifications() {
    if (!this.selectedUserId) return;
    this.notifications = await firstValueFrom(this.api.getNotifications(this.selectedUserId));
  }

  async loadDms() {
    if (!this.selectedUserId) return;
    this.dms = await firstValueFrom(this.api.getDms(this.selectedUserId));
  }

  async selectTicket(ticketId: string) {
    this.lockedTicket = null;
    this.closeChannelReports();
    try {
      this.selectedTicket = await firstValueFrom(this.api.getTicket(ticketId));
      this.messageDraft = '';
      this.resetMentionSuggestions();
      this.lockedTicket = null;
      this.syncTicketSettings(this.selectedTicket);
      this.selectedLog = null;
      this.showTicketSettings = false;
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
        this.syncTicketSettings(null);
        this.selectedLog = null;
        this.showTicketSettings = false;
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
      this.showTicketSettings = false;
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
        this.syncTicketSettings(null);
        this.selectedLog = null;
        this.showTicketSettings = false;
      } else {
        console.error(error);
      }
    }
  }

  async handleCreateTicket() {
    if (!this.selectedUserId || !this.createTicketModel.title || !this.createTicketModel.channelId) {
      this.feedback = 'Please complete the ticket form.';
      return;
    }
    try {
      const selectedChannel = this.createTicketModel.channelId;
      const selectedPrivacy = this.createTicketModel.privacy;
      const selectedPriority = this.createTicketModel.priority;
      const ticket = await firstValueFrom(
        this.api.createTicket({
          title: this.createTicketModel.title,
          description: this.createTicketModel.description,
          channelId: this.createTicketModel.channelId,
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
        channelId: selectedChannel,
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

  async handlePostMessage(body?: string) {
    if (!this.selectedTicket || !this.selectedUserId || !this.isTicketMember) return;
    const payload = body ?? this.messageDraft.trim();
    if (!payload) return;
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
      }
      await this.refreshTicketDetail();
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
  }

  handleMessageFocus() {
    if (this.mentionHideTimeout) {
      window.clearTimeout(this.mentionHideTimeout);
      this.mentionHideTimeout = null;
    }
    this.updateMentionContext(this.messageCursorIndex);
  }

  handleMessageBlur() {
    this.mentionHideTimeout = window.setTimeout(() => this.resetMentionSuggestions(), 120);
  }

  handleSelectMention(user: User) {
    if (!this.mentionReplaceRange) return;
    const before = this.messageDraft.slice(0, this.mentionReplaceRange.start);
    const after = this.messageDraft.slice(this.messageCursorIndex);
    const insertion = `@${user.handle} `;
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

  private buildMentionSuggestions(query: string): User[] {
    const normalized = query.trim();
    return this.users
      .filter((user) => {
        if (!normalized) return true;
        const haystack = `${user.displayName} ${user.handle}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 8);
  }

  private resetMentionSuggestions() {
    if (this.mentionHideTimeout) {
      window.clearTimeout(this.mentionHideTimeout);
      this.mentionHideTimeout = null;
    }
    this.mentionSuggestions = [];
    this.showMentionSuggestions = false;
    this.mentionQuery = '';
    this.mentionReplaceRange = null;
  }

  handleStartTicketClick() {
    this.handlePostMessage('start ticket').catch((error) => console.error(error));
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

  handleAssignSelect(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.handleAssignTo(value).catch((error) => console.error(error));
    (event.target as HTMLSelectElement).value = '';
  }

  handleInviteSelect(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.handleJoinTicket(value).catch((error) => console.error(error));
    (event.target as HTMLSelectElement).value = '';
  }

  async handleArchiveTicket() {
    if (!this.selectedTicket || !this.selectedUserId) return;
    const ticketId = this.selectedTicket.id;
    await firstValueFrom(this.api.archiveTicket(ticketId, this.selectedUserId));
    this.selectedTicket = null;
    await this.loadTickets();
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
    await this.loadDms();
    await this.loadNotifications();
  }

  async handleMarkNotification(notification: NotificationItem) {
    await firstValueFrom(this.api.markNotificationRead(notification.id));
    await this.loadNotifications();
  }

  setActiveTab(tab: 'dashboard' | 'home' | 'dms' | 'activity') {
    this.activeTab = tab;
    if (tab === 'activity') {
      void this.loadNotifications();
    } else if (tab === 'dms') {
      void this.loadDms();
    } else if (tab === 'dashboard') {
      void this.loadDashboard();
    } else if (tab === 'home') {
      void this.loadTickets();
    }
  }

  handleChannelChange(channelId: string) {
    this.selectedChannelId = channelId;
    this.createTicketModel.channelId = channelId;
    this.selectedTicket = null;
    this.lockedTicket = null;
    this.syncTicketSettings(null);
    this.closeChannelReports();
    void this.loadTickets();
  }

  toggleChannelsCollapsed() {
    this.channelsCollapsed = !this.channelsCollapsed;
  }

  toggleCategoryCollapse(key: string) {
    this.ticketCategoryCollapsed = {
      ...this.ticketCategoryCollapsed,
      [key]: !this.ticketCategoryCollapsed[key],
    };
  }

  get activityUnreadCount(): number {
    return this.notifications.filter((notification) => !notification.isRead).length;
  }

  get channelLabel(): string {
    const channel = this.channels.find((chan) => chan.id === this.selectedChannelId);
    return channel ? channel.name : 'Select channel';
  }

  get headerTitle(): string {
    switch (this.activeTab) {
      case 'dashboard':
        return 'Dashboard overview';
      case 'home':
        return this.channelLabel;
      case 'dms':
        return 'Direct messages';
      case 'activity':
        return 'Activity';
      default:
        return this.channelLabel;
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

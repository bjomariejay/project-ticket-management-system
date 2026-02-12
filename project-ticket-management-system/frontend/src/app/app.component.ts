import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ApiService,
  Channel,
  DashboardEntry,
  DmMessage,
  NotificationItem,
  Ticket,
  TicketDetail,
  TicketPrivacy,
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

  ticketSearch = '';
  messageDraft = '';
  createTicketModel = {
    title: '',
    description: '',
    channelId: '',
    estimatedHours: 1,
    privacy: 'public' as TicketPrivacy,
    inviteeIds: [] as string[],
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
    this.createTicketModel = {
      title: '',
      description: '',
      channelId: '',
      estimatedHours: 1,
      privacy: 'public',
      inviteeIds: [],
    };
    this.dmForm = {
      recipientId: '',
      body: '',
    };
    this.feedback = '';
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
    try {
      this.selectedTicket = await firstValueFrom(this.api.getTicket(ticketId));
      this.messageDraft = '';
      this.lockedTicket = null;
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
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
    } catch (error: any) {
      if (error?.status === 403 && error?.error?.ticket) {
        this.selectedTicket = null;
        this.lockedTicket = error.error.ticket;
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
      const ticket = await firstValueFrom(
        this.api.createTicket({
          title: this.createTicketModel.title,
          description: this.createTicketModel.description,
          channelId: this.createTicketModel.channelId,
          creatorId: this.selectedUserId,
          estimatedHours: this.createTicketModel.estimatedHours,
          privacy: this.createTicketModel.privacy,
          additionalMemberIds: this.createTicketModel.inviteeIds,
        })
      );
      this.createTicketModel = {
        title: '',
        description: '',
        channelId: selectedChannel,
        estimatedHours: 1,
        privacy: selectedPrivacy,
        inviteeIds: [],
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
      }
      await this.refreshTicketDetail();
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
    } finally {
      this.isPostingMessage = false;
    }
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
    void this.loadTickets();
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

  get reportOfWork() {
    return this.selectedTicket?.logs ?? [];
  }
}

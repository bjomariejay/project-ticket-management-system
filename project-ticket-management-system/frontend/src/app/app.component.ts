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
  User,
} from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Project and Ticket Management System';

  users: User[] = [];
  channels: Channel[] = [];
  tickets: Ticket[] = [];
  dashboard: DashboardEntry[] = [];
  notifications: NotificationItem[] = [];
  dms: DmMessage[] = [];

  selectedUserId = '';
  selectedChannelId = '';
  selectedTicket: TicketDetail | null = null;
  activeTab: 'home' | 'dms' | 'activity' = 'home';

  ticketSearch = '';
  messageDraft = '';
  createTicketModel = {
    title: '',
    description: '',
    channelId: '',
    estimatedHours: 1,
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
    if (!this.selectedUserId && this.users.length) {
      const fallbackUser = this.sessionUser || this.users[0];
      this.selectedUserId = fallbackUser.id;
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
    this.activeTab = 'home';
    this.ticketSearch = '';
    this.messageDraft = '';
    this.createTicketModel = {
      title: '',
      description: '',
      channelId: '',
      estimatedHours: 1,
    };
    this.dmForm = {
      recipientId: '',
      body: '',
    };
    this.feedback = '';
    if (clearUserSelection) {
      this.selectedUserId = '';
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

  get isTicketMember(): boolean {
    if (!this.selectedTicket || !this.selectedUserId) return false;
    return this.selectedTicket.members.some((member) => member.userId === this.selectedUserId);
  }

  get canAssign(): boolean {
    return Boolean(this.selectedTicket && this.selectedUserId);
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
    this.dashboard = await firstValueFrom(this.api.getDashboard());
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
    this.selectedTicket = await firstValueFrom(this.api.getTicket(ticketId));
    this.messageDraft = '';
  }

  async refreshTicketDetail() {
    if (!this.selectedTicket) return;
    this.selectedTicket = await firstValueFrom(this.api.getTicket(this.selectedTicket.id));
  }

  async handleCreateTicket() {
    if (!this.selectedUserId || !this.createTicketModel.title || !this.createTicketModel.channelId) {
      this.feedback = 'Please complete the ticket form.';
      return;
    }
    try {
      const selectedChannel = this.createTicketModel.channelId;
      const ticket = await firstValueFrom(
        this.api.createTicket({
          title: this.createTicketModel.title,
          description: this.createTicketModel.description,
          channelId: this.createTicketModel.channelId,
          creatorId: this.selectedUserId,
          estimatedHours: this.createTicketModel.estimatedHours,
        })
      );
      this.createTicketModel = {
        title: '',
        description: '',
        channelId: selectedChannel,
        estimatedHours: 1,
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

  async handleJoinTicket() {
    if (!this.selectedTicket || !this.selectedUserId) return;
    await firstValueFrom(this.api.joinTicket(this.selectedTicket.id, this.selectedUserId));
    await this.refreshTicketDetail();
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

  async handleArchiveTicket() {
    if (!this.selectedTicket || !this.selectedUserId) return;
    const ticketId = this.selectedTicket.id;
    await firstValueFrom(this.api.archiveTicket(ticketId, this.selectedUserId));
    this.selectedTicket = null;
    await this.loadTickets();
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

  switchTab(tab: 'home' | 'dms' | 'activity') {
    this.activeTab = tab;
    if (tab === 'activity') {
      void this.loadNotifications();
    }
    if (tab === 'dms') {
      void this.loadDms();
    }
  }

  handleChannelChange(channelId: string) {
    this.selectedChannelId = channelId;
    this.createTicketModel.channelId = channelId;
    void this.loadTickets();
  }

  async handleUserChange(userId: string) {
    this.selectedUserId = userId;
    await Promise.all([this.loadTickets(), this.loadNotifications(), this.loadDms()]);
  }

  get activityUnreadCount(): number {
    return this.notifications.filter((notification) => !notification.isRead).length;
  }

  get channelLabel(): string {
    const channel = this.channels.find((chan) => chan.id === this.selectedChannelId);
    return channel ? channel.name : 'Select channel';
  }

  get reportOfWork() {
    return this.selectedTicket?.logs ?? [];
  }
}

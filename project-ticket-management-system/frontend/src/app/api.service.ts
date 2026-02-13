import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface User {
  id: string;
  displayName: string;
  handle: string;
  location?: string | null;
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  ticketPrefix: string;
  nextNumber: number;
}

export type TicketPrivacy = 'public' | 'private';

export type TicketPriority = 'normal' | 'priority';

export interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  channelId: string;
  creatorId: string;
  assigneeId?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  startedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  privacy: TicketPrivacy;
  priority: TicketPriority;
  isLocked?: boolean;
  viewerIsMember?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMember {
  userId: string;
  displayName: string;
  handle: string;
  role: string;
  joinedAt: string;
}

export interface TicketLog {
  id: string;
  message: string;
  createdAt: string;
  actorName?: string | null;
}

export interface TicketMessage {
  id: string;
  body: string;
  createdAt: string;
  displayName?: string | null;
  handle?: string | null;
  mentions: string[];
}

export interface TicketDetail extends Ticket {
  members: TicketMember[];
  logs: TicketLog[];
  messages: TicketMessage[];
}

export interface NotificationItem {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  ticketNumber?: string | null;
}

export interface DmMessage {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
}

export interface ChannelReportEntry {
  id: string;
  message: string;
  createdAt: string;
  actorName?: string | null;
  ticketNumber: string;
  ticketTitle: string;
}

export interface DashboardEntry {
  id: string;
  displayName: string;
  archivedCount: number;
  inProgressCount: number;
  openCount: number;
  estimatedTotal: number;
  actualTotal: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  login(payload: { handle: string; password: string }): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.baseUrl}/auth/login`, payload);
  }

  register(payload: {
    displayName: string;
    handle: string;
    email: string;
    password: string;
    location?: string;
  }): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.baseUrl}/auth/register`, payload);
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  getChannels(): Observable<Channel[]> {
    return this.http.get<Channel[]>(`${this.baseUrl}/channels`);
  }

  getTickets(filters: { channelId?: string; creatorId?: string; assigneeId?: string }): Observable<Ticket[]> {
    let params = new HttpParams();
    if (filters.channelId) params = params.set('channelId', filters.channelId);
    if (filters.creatorId) params = params.set('creatorId', filters.creatorId);
    if (filters.assigneeId) params = params.set('assigneeId', filters.assigneeId);
    return this.http.get<Ticket[]>(`${this.baseUrl}/tickets`, { params });
  }

  getTicket(ticketId: string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(`${this.baseUrl}/tickets/${ticketId}`);
  }

  createTicket(payload: {
    title: string;
    description: string;
    channelId: string;
    creatorId: string;
    estimatedHours?: number;
    privacy?: TicketPrivacy;
    additionalMemberIds?: string[];
    priority?: TicketPriority;
  }): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.baseUrl}/tickets`, payload);
  }

  postTicketMessage(ticketId: string, payload: { userId: string; body: string }) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/messages`, payload);
  }

  joinTicket(ticketId: string, payload?: { userId?: string; actorId?: string }) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/join`, payload ?? {});
  }

  updateTicketPrivacy(ticketId: string, payload: { actorId: string; privacy: TicketPrivacy }) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/privacy`, payload);
  }

  updateTicketSettings(
    ticketId: string,
    payload: { actorId: string; status?: string; priority?: TicketPriority; estimatedHours?: number | null }
  ) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/settings`, payload);
  }

  createChannel(
    payload: { name: string; slug?: string; ticketPrefix: string; description?: string }
  ): Observable<Channel & { nextNumber: number }> {
    return this.http.post<Channel & { nextNumber: number }>(`${this.baseUrl}/channels`, payload);
  }

  deleteChannel(channelId: string) {
    return this.http.delete(`${this.baseUrl}/channels/${channelId}`);
  }

  assignTicket(ticketId: string, assigneeId: string, actorId: string) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/assign`, { assigneeId, actorId });
  }

  getChannelReports(channelId: string) {
    return this.http.get<ChannelReportEntry[]>(`${this.baseUrl}/channels/${channelId}/reports`);
  }

  getAllReports() {
    return this.http.get<ChannelReportEntry[]>(`${this.baseUrl}/reports`);
  }

  archiveTicket(ticketId: string, actorId: string) {
    return this.http.post(`${this.baseUrl}/tickets/${ticketId}/archive`, { actorId });
  }

  getTicketMessages(ticketId: string) {
    return this.http.get<TicketMessage[]>(`${this.baseUrl}/tickets/${ticketId}/messages`);
  }

  getTicketLogs(ticketId: string) {
    return this.http.get<TicketLog[]>(`${this.baseUrl}/tickets/${ticketId}/logs`);
  }

  getNotifications(userId: string) {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<NotificationItem[]>(`${this.baseUrl}/notifications`, { params });
  }

  markNotificationRead(notificationId: string) {
    return this.http.post(`${this.baseUrl}/notifications/${notificationId}/read`, {});
  }

  sendDm(payload: { senderId: string; recipientId: string; body: string }) {
    return this.http.post(`${this.baseUrl}/dms`, payload);
  }

  getDms(userId: string) {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<DmMessage[]>(`${this.baseUrl}/dms`, { params });
  }

  getDashboard(filters?: { startDate?: string | null; endDate?: string | null }) {
    let params = new HttpParams();
    if (filters?.startDate) params = params.set('startDate', filters.startDate);
    if (filters?.endDate) params = params.set('endDate', filters.endDate);
    return this.http.get<DashboardEntry[]>(`${this.baseUrl}/dashboard/overview`, {
      params,
    });
  }
}

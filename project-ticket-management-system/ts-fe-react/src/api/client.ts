import axios, { AxiosInstance } from 'axios';
import {
  CreateProjectPayload,
  CreateTicketPayload,
  DashboardEntry,
  DashboardFilter,
  DmMessage,
  LoginPayload,
  LoginResponse,
  NotificationItem,
  PostTicketMessagePayload,
  Project,
  ProjectReportEntry,
  RegisterPayload,
  SendDmPayload,
  Ticket,
  TicketDetail,
  TicketLog,
  TicketMessage,
  UpdateTicketSettingsPayload,
  User,
  WorkspaceSummary,
} from '../types/api';

const defaultBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL = defaultBaseUrl) {
    this.client = axios.create({
      baseURL,
      withCredentials: true,
    });
  }

  setAuthToken(token?: string | null) {
    if (token) {
      this.client.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete this.client.defaults.headers.common.Authorization;
    }
  }

  login(payload: LoginPayload) {
    return this.client.post<LoginResponse>('/auth/login', payload).then((res) => res.data);
  }

  register(payload: RegisterPayload) {
    return this.client.post<LoginResponse>('/auth/register', payload).then((res) => res.data);
  }

  getUsers() {
    return this.client.get<User[]>('/users').then((res) => res.data);
  }

  updateUser(userId: string, payload: Partial<Pick<User, 'displayName' | 'handle' | 'location'>>) {
    return this.client.patch<User>(`/users/${userId}`, payload).then((res) => res.data);
  }

  getProjects() {
    return this.client.get<Project[]>('/projects').then((res) => res.data);
  }

  createProject(payload: CreateProjectPayload) {
    return this.client.post<Project & { nextNumber: number }>('/projects', payload).then((res) => res.data);
  }

  deleteProject(projectId: string) {
    return this.client.delete(`/projects/${projectId}`).then((res) => res.data);
  }

  getTickets(filters?: { projectId?: string; creatorId?: string; assigneeId?: string }) {
    return this.client.get<Ticket[]>('/tickets', { params: filters }).then((res) => res.data);
  }

  getTicket(ticketId: string) {
    return this.client.get<TicketDetail>(`/tickets/${ticketId}`).then((res) => res.data);
  }

  createTicket(payload: CreateTicketPayload) {
    return this.client.post<Ticket>('/tickets', payload).then((res) => res.data);
  }

  postTicketMessage(ticketId: string, payload: PostTicketMessagePayload) {
    return this.client.post(`/tickets/${ticketId}/messages`, payload).then((res) => res.data);
  }

  joinTicket(ticketId: string, payload?: { userId?: string; actorId?: string }) {
    return this.client.post(`/tickets/${ticketId}/join`, payload ?? {}).then((res) => res.data);
  }

  updateTicketPrivacy(ticketId: string, payload: { actorId: string; privacy: 'public' | 'private' }) {
    return this.client.post(`/tickets/${ticketId}/privacy`, payload).then((res) => res.data);
  }

  updateTicketSettings(ticketId: string, payload: UpdateTicketSettingsPayload) {
    return this.client.post(`/tickets/${ticketId}/settings`, payload).then((res) => res.data);
  }

  assignTicket(ticketId: string, assigneeId: string, actorId: string) {
    return this.client
      .post(`/tickets/${ticketId}/assign`, { assigneeId, actorId })
      .then((res) => res.data);
  }

  archiveTicket(ticketId: string, actorId: string) {
    return this.client.post(`/tickets/${ticketId}/archive`, { actorId }).then((res) => res.data);
  }

  getTicketMessages(ticketId: string) {
    return this.client.get<TicketMessage[]>(`/tickets/${ticketId}/messages`).then((res) => res.data);
  }

  getTicketLogs(ticketId: string) {
    return this.client.get<TicketLog[]>(`/tickets/${ticketId}/logs`).then((res) => res.data);
  }

  getNotifications() {
    return this.client.get<NotificationItem[]>('/notifications').then((res) => res.data);
  }

  markNotificationRead(notificationId: string) {
    return this.client.post(`/notifications/${notificationId}/read`, {}).then((res) => res.data);
  }

  getDms() {
    return this.client.get<DmMessage[]>('/dms').then((res) => res.data);
  }

  sendDm(payload: SendDmPayload) {
    return this.client.post('/dms', payload).then((res) => res.data);
  }

  getDashboard(filters?: DashboardFilter) {
    return this.client
      .get<DashboardEntry[]>('/dashboard/overview', { params: filters })
      .then((res) => res.data);
  }

  getProjectReports(projectId: string) {
    return this.client.get<ProjectReportEntry[]>(`/projects/${projectId}/reports`).then((res) => res.data);
  }

  getAllReports() {
    return this.client.get<ProjectReportEntry[]>('/reports').then((res) => res.data);
  }

  getWorkspaces(search?: string) {
    return this.client
      .get<WorkspaceSummary[]>('/workspaces', { params: search ? { search } : undefined })
      .then((res) => res.data);
  }

  getNotificationsSince(timestamp: string) {
    return this.client
      .get<NotificationItem[]>('/notifications', { params: { since: timestamp } })
      .then((res) => res.data);
  }

  sendHeartbeat() {
    return this.client.post('/users/me/heartbeat', {}).then((res) => res.data);
  }

  markInactive() {
    return this.client.post('/users/me/inactive', {}).then((res) => res.data);
  }
}

export const apiClient = new ApiClient();

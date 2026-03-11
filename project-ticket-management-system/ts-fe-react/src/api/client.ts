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
  UpdateProjectPayload,
  UpdateTicketSettingsPayload,
  User,
  UserWorkLogEntry,
  UserWorkLogFilter,
  WorkspaceSummary,
} from '../types/api';

const defaultBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const SESSION_EXPIRED_EVENT = 'app-session-expired';

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL = defaultBaseUrl) {
    this.client = axios.create({
      baseURL,
      withCredentials: true,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          }
        }
        return Promise.reject(error);
      },
    );
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
    return this.client.post<Project>('/projects', payload).then((res) => res.data);
  }

  updateProject(projectId: string, payload: UpdateProjectPayload) {
    return this.client.patch<Project>(`/projects/${projectId}`, payload).then((res) => res.data);
  }

  deleteProject(projectId: string) {
    return this.client.delete(`/projects/${projectId}`).then((res) => res.data);
  }

  getTickets(filters?: { projectId?: string; creatorId?: string; assigneeId?: string; reviewerId?: string }) {
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

  updateTicketReviewer(ticketId: string, payload: { reviewerId: string; actorId: string }) {
    return this.client.post(`/tickets/${ticketId}/reviewer`, payload).then((res) => res.data);
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

  getNotificationStatus() {
    return this.client
      .get<{ pendingSince: string | null; hasNew: boolean }>('/notifications/status')
      .then((res) => res.data);
  }

  markTicketNotificationsSeen() {
    return this.client
      .post<{ lastSeen: string | null }>('/notifications/seen', {})
      .then((res) => res.data.lastSeen ?? null);
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

  getUserWorkLogs(filters?: UserWorkLogFilter) {
    return this.client
      .get<UserWorkLogEntry[]>('/dashboard/user-work-log', { params: filters })
      .then((res) => res.data);
  }

  getProjectReports(projectId: string) {
    return this.client.get<ProjectReportEntry[]>(`/projects/${projectId}/reports`).then((res) => res.data);
  }

  getAllReports() {
    return this.client.get<ProjectReportEntry[]>('/reports').then((res) => res.data);
  }

  getGlobalReportsStatus() {
    return this.client
      .get<{ latest: string | null; lastSeen: string | null }>('/reports/latest')
      .then((res) => res.data);
  }

  markGlobalReportsSeen(timestamp?: string | null) {
    return this.client
      .post<{ lastSeen: string | null }>('/reports/seen', { timestamp })
      .then((res) => res.data.lastSeen ?? null);
  }

  getReviewerReports(reviewerId: string) {
    return this.client
      .get<ProjectReportEntry[]>(`/reviewers/${reviewerId}/reports`)
      .then((res) => res.data);
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

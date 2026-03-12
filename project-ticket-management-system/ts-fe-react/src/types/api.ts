export interface User {
  id: string;
  displayName: string;
  username: string;
  handle: string;
  location?: string | null;
  workspaceId?: string;
  workspaceName?: string;
  isActive?: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  ticketPrefix: string;
  description?: string | null;
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
  projectId: string;
  creatorId: string;
  assigneeId?: string | null;
  reviewerId?: string | null;
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
  username: string;
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
  ticketId?: string | null;
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

export interface ProjectReportEntry {
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

export interface UserWorkLogEntry {
  id: string;
  ticketNumber: string;
  userId?: string | null;
  estimatedHours?: number | null;
  spendTime?: number | null;
  displayName?: string | null;
  createdAt?: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterPayload {
  displayName: string;
  handle: string;
  email: string;
  password: string;
  location?: string;
  username?: string;
  workspaceName: string;
}

export interface CreateTicketPayload {
  title: string;
  description: string;
  projectId: string;
  creatorId: string;
  estimatedHours?: number;
  privacy?: TicketPrivacy;
  additionalMemberIds?: string[];
  priority?: TicketPriority;
  reviewerId?: string;
}

export interface CreateProjectPayload {
  name: string;
  slug?: string;
  ticketPrefix: string;
  description?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  slug?: string;
  ticketPrefix?: string;
  description?: string | null;
}

export interface PostTicketMessagePayload {
  userId: string;
  body: string;
}

export interface UpdateTicketSettingsPayload {
  actorId: string;
  status?: string;
  priority?: TicketPriority;
  estimatedHours?: number | null;
  title?: string;
  actualHours?: number | null;
}

export interface SendDmPayload {
  senderId: string;
  recipientId: string;
  body: string;
}

export interface DashboardFilter {
  startDate?: string;
  endDate?: string;
}

export interface UserWorkLogFilter {
  startDate?: string;
  endDate?: string;
  search?: string;
}

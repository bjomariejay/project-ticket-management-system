import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../api';
import { useAuth } from '../hooks/useAuth';
import {
  DashboardEntry,
  DmMessage,
  NotificationItem,
  Project,
  ProjectReportEntry,
  Ticket,
  TicketDetail,
  TicketPriority,
  TicketPrivacy,
  User,
} from '../types/api';
import { slugify } from '../utils/text';
import { useInterval } from '../hooks/useInterval';

export type WorkspaceTab = 'dashboard' | 'home' | 'dms' | 'activity';
export type DashboardRange = '7d' | '30d' | '90d' | 'all' | 'custom';

interface CreateTicketModel {
  title: string;
  description: string;
  projectId: string;
  estimatedHours: number;
  privacy: TicketPrivacy;
  inviteeIds: string[];
  priority: TicketPriority;
}

interface CreateProjectModel {
  name: string;
  slug: string;
  ticketPrefix: string;
  description: string;
}

interface DmForm {
  recipientId: string;
  body: string;
}

interface UserSettingsForm {
  displayName: string;
  handle: string;
  location: string;
}

interface WorkspaceState {
  workspaceLabel: string;
  users: User[];
  projects: Project[];
  tickets: Ticket[];
  dashboard: DashboardEntry[];
  notifications: NotificationItem[];
  dms: DmMessage[];
  selectedUserId: string;
  selectedProjectId: string;
  selectedTicket: TicketDetail | null;
  lockedTicket: { id: string; ticketNumber: string; title: string; privacy: TicketPrivacy } | null;
  activeTab: WorkspaceTab;
  projectsCollapsed: boolean;
  ticketSearch: string;
  messageDraft: string;
  createTicketModel: CreateTicketModel;
  createProjectModel: CreateProjectModel;
  dmForm: DmForm;
  selectedDmRecipientId: string;
  feedback: string;
  isLoadingTickets: boolean;
  isPostingMessage: boolean;
  hasDmAttention: boolean;
  hasActivityAttention: boolean;
  isBootstrapping: boolean;
  dashboardRange: DashboardRange;
  dashboardStartDate: string | null;
  dashboardEndDate: string | null;
  userSettingsForm: UserSettingsForm;
  userSettingsError: string;
  userSettingsSaving: boolean;
  showUserSettings: boolean;
  lastDmViewTimestamp: string | null;
  lastActivityViewTimestamp: string | null;
  showCreateProject: boolean;
  showCreateTicket: boolean;
  projectReportEntries: ProjectReportEntry[];
  viewingReportsForProjectId: string;
  viewingReportsForProjectName: string;
  projectReportsLoading: boolean;
  isGlobalReportView: boolean;
  hasUnseenGlobalReports: boolean;
  latestGlobalReportTimestamp: string | null;
}

const defaultTicketModel: CreateTicketModel = {
  title: '',
  description: '',
  projectId: '',
  estimatedHours: 1,
  privacy: 'public',
  inviteeIds: [],
  priority: 'normal',
};

const defaultProjectModel: CreateProjectModel = {
  name: '',
  slug: '',
  ticketPrefix: '',
  description: '',
};

const defaultDmForm: DmForm = {
  recipientId: '',
  body: '',
};

const defaultUserSettings: UserSettingsForm = {
  displayName: '',
  handle: '',
  location: '',
};

const defaultWorkspaceLabel = 'Mission Control Workspace';

const initialState: WorkspaceState = {
  workspaceLabel: defaultWorkspaceLabel,
  users: [],
  projects: [],
  tickets: [],
  dashboard: [],
  notifications: [],
  dms: [],
  selectedUserId: '',
  selectedProjectId: '',
  selectedTicket: null,
  lockedTicket: null,
  activeTab: 'home',
  projectsCollapsed: false,
  ticketSearch: '',
  messageDraft: '',
  createTicketModel: defaultTicketModel,
  createProjectModel: defaultProjectModel,
  dmForm: defaultDmForm,
  selectedDmRecipientId: '',
  feedback: '',
  isLoadingTickets: false,
  isPostingMessage: false,
  hasDmAttention: false,
  hasActivityAttention: false,
  isBootstrapping: false,
  dashboardRange: '30d',
  dashboardStartDate: null,
  dashboardEndDate: null,
  userSettingsForm: defaultUserSettings,
  userSettingsError: '',
  userSettingsSaving: false,
  showUserSettings: false,
  lastDmViewTimestamp: null,
  lastActivityViewTimestamp: null,
  showCreateProject: false,
  showCreateTicket: false,
  projectReportEntries: [],
  viewingReportsForProjectId: '',
  viewingReportsForProjectName: '',
  projectReportsLoading: false,
  isGlobalReportView: false,
  hasUnseenGlobalReports: false,
  latestGlobalReportTimestamp: null,
};

interface WorkspaceContextValue {
  state: WorkspaceState;
  setTicketSearch: (value: string) => void;
  setMessageDraft: (value: string) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  selectProject: (projectId: string) => void;
  toggleProjectsCollapsed: () => void;
  selectTicket: (ticketId: string) => Promise<void>;
  refreshTicketDetail: (ticketId?: string) => Promise<void>;
  loadTickets: () => Promise<void>;
  loadDashboard: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  loadDms: () => Promise<void>;
  updateCreateTicketField: <K extends keyof CreateTicketModel>(key: K, value: CreateTicketModel[K]) => void;
  updateCreateProjectField: <K extends keyof CreateProjectModel>(key: K, value: CreateProjectModel[K]) => void;
  updateDmFormField: <K extends keyof DmForm>(key: K, value: DmForm[K]) => void;
  createProject: () => Promise<void>;
  createTicket: () => Promise<void>;
  postTicketMessage: (body?: string) => Promise<void>;
  sendDm: () => Promise<void>;
  handleAssign: (userId: string) => Promise<void>;
  handleJoinTicket: (targetUserId?: string) => Promise<void>;
  handleArchiveTicket: () => Promise<void>;
  handlePrivacyChange: (privacy: TicketPrivacy) => Promise<void>;
  handleDashboardRangeChange: (range: DashboardRange) => Promise<void>;
  handleDashboardDateChange: (type: 'start' | 'end', value: string | null) => Promise<void>;
  openUserSettings: () => void;
  closeUserSettings: () => void;
  saveUserSettings: () => Promise<void>;
  updateUserSettingsField: (key: keyof UserSettingsForm, value: string) => void;
  openCreateProject: () => void;
  closeCreateProject: () => void;
  openCreateTicket: () => void;
  closeCreateTicket: () => void;
  handleGlobalReportView: () => Promise<void>;
  closeProjectReports: () => void;
  handleDmRecipientChange: (userId: string) => void;
  markNotification: (notificationId: string) => Promise<void>;
  navigateToNotification: (notification: NotificationItem) => Promise<void>;
}

const ACTIVITY_VIEW_KEY = (userId: string) => `tsfe:activity:lastViewed:${userId}`;
const DM_VIEW_KEY = (userId: string) => `tsfe:dms:lastViewed:${userId}`;
const GLOBAL_REPORTS_KEY = (userId: string) => `tsfe:globalReports:lastSeen:${userId}`;
const GLOBAL_REPORT_PROJECT_ID = 'global-reports';

export const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, updateProfile } = useAuth();
  const [state, setState] = useState<WorkspaceState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const mergeState = useCallback((patch: Partial<WorkspaceState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetWorkspaceState = useCallback(() => {
    setState((prev) => ({
      ...initialState,
      workspaceLabel: defaultWorkspaceLabel,
      selectedUserId: user?.id || '',
      createTicketModel: { ...defaultTicketModel, projectId: '' },
    }));
  }, [user?.id]);

  const bootstrap = useCallback(async () => {
    if (!user || !isAuthenticated) {
      resetWorkspaceState();
      return;
    }
    mergeState({ isBootstrapping: true, feedback: '' });
    try {
      const [users, projects] = await Promise.all([apiClient.getUsers(), apiClient.getProjects()]);
      const selectedProjectId = stateRef.current.selectedProjectId || projects[0]?.id || '';
      mergeState({
        workspaceLabel: user.workspaceName?.trim() || defaultWorkspaceLabel,
        selectedUserId: user.id,
        users,
        projects,
        createTicketModel: {
          ...stateRef.current.createTicketModel,
          projectId: selectedProjectId,
        },
        selectedProjectId,
      });
      await loadTickets();
      await Promise.all([loadDashboard(), loadNotifications(), loadDms()]);
    } catch (error) {
      console.error('Failed to bootstrap workspace', error);
    } finally {
      mergeState({ isBootstrapping: false });
    }
  }, [isAuthenticated, mergeState, resetWorkspaceState, user]);

  useEffect(() => {
    if (isAuthenticated) {
      void bootstrap();
    } else {
      resetWorkspaceState();
    }
  }, [bootstrap, isAuthenticated, resetWorkspaceState]);

  useInterval(() => {
    if (!isAuthenticated) return;
    apiClient
      .sendHeartbeat()
      .then(() => loadUsers())
      .catch((error) => console.error('Heartbeat failed', error));
  }, isAuthenticated ? 60000 : null);

  const loadUsers = useCallback(async () => {
    try {
      const users = await apiClient.getUsers();
      mergeState({ users });
    } catch (error) {
      console.error('Unable to load users', error);
    }
  }, [mergeState]);

  const loadProjects = useCallback(async () => {
    try {
      const projects = await apiClient.getProjects();
      mergeState({ projects });
    } catch (error) {
      console.error('Unable to load projects', error);
    }
  }, [mergeState]);

  const loadTickets = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    mergeState({ isLoadingTickets: true });
    try {
      const tickets = await apiClient.getTickets({});
      mergeState({ tickets });
      if (stateRef.current.selectedTicket || stateRef.current.lockedTicket) {
        await refreshTicketDetail();
      }
    } catch (error) {
      console.error('Unable to load tickets', error);
    } finally {
      mergeState({ isLoadingTickets: false });
    }
  }, [mergeState]);

  const getDashboardFilters = useCallback(() => {
    const { dashboardRange, dashboardStartDate, dashboardEndDate } = stateRef.current;
    if (dashboardRange === 'all') return undefined;
    if (dashboardRange === 'custom') {
      if (dashboardStartDate && dashboardEndDate) {
        const start = new Date(`${dashboardStartDate}T00:00:00`).toISOString();
        const end = new Date(`${dashboardEndDate}T23:59:59`).toISOString();
        return { startDate: start, endDate: end };
      }
      return undefined;
    }
    const dayMap: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = dayMap[dashboardRange];
    if (!days) return undefined;
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    return { startDate: start, endDate: end };
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const filters = getDashboardFilters();
      const dashboard = await apiClient.getDashboard(filters);
      mergeState({ dashboard });
    } catch (error) {
      console.error('Unable to load dashboard', error);
    }
  }, [getDashboardFilters, mergeState]);

  const restoreTimestamp = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Unable to read timestamp key', key, error);
      return null;
    }
  };

  const persistTimestamp = (key: string, value: string | null) => {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Unable to persist timestamp key', key, error);
    }
  };

  const getLastSeenGlobalReportTimestamp = () => {
    const userId = stateRef.current.selectedUserId;
    if (!userId) return null;
    try {
      return localStorage.getItem(GLOBAL_REPORTS_KEY(userId));
    } catch (error) {
      console.warn('Unable to read report-of-work state', error);
      return null;
    }
  };

  const persistGlobalReportTimestamp = (timestamp: string | null) => {
    const userId = stateRef.current.selectedUserId;
    if (!userId) return;
    const key = GLOBAL_REPORTS_KEY(userId);
    try {
      if (timestamp) {
        localStorage.setItem(key, timestamp);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Unable to persist report-of-work state', error);
    }
  };

  const markGlobalReportsSeen = (timestamp: string | null) => {
    persistGlobalReportTimestamp(timestamp);
    mergeState({ hasUnseenGlobalReports: false, latestGlobalReportTimestamp: timestamp });
  };

  const updateActivityAttention = useCallback(() => {
    const userId = stateRef.current.selectedUserId;
    if (!userId) return;
    const lastViewed =
      stateRef.current.lastActivityViewTimestamp ?? restoreTimestamp(ACTIVITY_VIEW_KEY(userId));
    const unread = stateRef.current.notifications.filter((notification) => !notification.isRead);
    const hasUnread = unread.some((notification) => {
      if (!lastViewed) return true;
      return new Date(notification.createdAt).getTime() > new Date(lastViewed).getTime();
    });
    mergeState({ hasActivityAttention: hasUnread, lastActivityViewTimestamp: lastViewed });
  }, [mergeState]);

  const updateDmAttention = useCallback(() => {
    const userId = stateRef.current.selectedUserId;
    if (!userId) return;
    const lastViewed = stateRef.current.lastDmViewTimestamp ?? restoreTimestamp(DM_VIEW_KEY(userId));
    const latestIncoming = stateRef.current.dms
      .filter((dm) => dm.senderId !== userId)
      .map((dm) => dm.createdAt)
      .sort()
      .at(-1);
    if (!latestIncoming) {
      mergeState({ hasDmAttention: false, lastDmViewTimestamp: lastViewed });
      return;
    }
    const hasAttention =
      !lastViewed || new Date(latestIncoming).getTime() > new Date(lastViewed).getTime();
    mergeState({
      hasDmAttention: hasAttention,
      lastDmViewTimestamp: lastViewed,
    });
  }, [mergeState]);

  const closeProjectReports = () => {
    mergeState({
      projectReportEntries: [],
      viewingReportsForProjectId: '',
      viewingReportsForProjectName: '',
      projectReportsLoading: false,
      isGlobalReportView: false,
    });
  };

  const handleGlobalReportView = async () => {
    mergeState({ projectReportsLoading: true });
    try {
      const entries = await apiClient.getAllReports();
      const latest = entries[0]?.createdAt || null;
      mergeState({
        viewingReportsForProjectId: GLOBAL_REPORT_PROJECT_ID,
        viewingReportsForProjectName: 'All projects',
        projectReportEntries: entries,
        projectReportsLoading: false,
        isGlobalReportView: true,
        selectedTicket: null,
        lockedTicket: null,
      });
      markGlobalReportsSeen(latest);
    } catch (error) {
      console.error('Unable to load report-of-work', error);
      mergeState({ projectReportsLoading: false });
      closeProjectReports();
    }
  };

  const loadDms = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    try {
      const dms = await apiClient.getDms();
      mergeState({ dms });
      if (!stateRef.current.selectedDmRecipientId && dms.length) {
        const firstConversation = dms.find((dm) => dm.senderId !== stateRef.current.selectedUserId);
        const partnerId = firstConversation
          ? firstConversation.senderId === stateRef.current.selectedUserId
            ? firstConversation.recipientId
            : firstConversation.senderId
          : null;
        if (partnerId) {
          mergeState({
            selectedDmRecipientId: partnerId,
            dmForm: { ...stateRef.current.dmForm, recipientId: partnerId },
          });
        }
      }
      updateDmAttention();
    } catch (error) {
      console.error('Unable to load DMs', error);
    }
  }, [mergeState, updateDmAttention]);

  const checkGlobalReports = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    try {
      const entries = await apiClient.getAllReports();
      const latest = entries[0]?.createdAt || null;
      if (!latest) {
        mergeState({ latestGlobalReportTimestamp: null, hasUnseenGlobalReports: false });
        return;
      }
      const lastSeen = getLastSeenGlobalReportTimestamp();
      const latestTime = new Date(latest).getTime();
      const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : NaN;
      const hasUnseen =
        !lastSeen || !Number.isFinite(lastSeenTime) || (Number.isFinite(latestTime) && latestTime > lastSeenTime);
      mergeState({ latestGlobalReportTimestamp: latest, hasUnseenGlobalReports: hasUnseen });
    } catch (error) {
      console.error('Unable to check report-of-work updates', error);
    }
  }, [mergeState]);

  const loadNotifications = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    try {
      const notifications = await apiClient.getNotifications();
      mergeState({ notifications });
      updateActivityAttention();
      await checkGlobalReports();
    } catch (error) {
      console.error('Unable to load notifications', error);
    }
  }, [checkGlobalReports, mergeState, updateActivityAttention]);

  const selectProject = (projectId: string) => {
    mergeState({
      selectedProjectId: projectId,
      createTicketModel: { ...stateRef.current.createTicketModel, projectId },
      selectedTicket: null,
      lockedTicket: null,
      viewingReportsForProjectId: '',
      viewingReportsForProjectName: '',
      projectReportEntries: [],
      projectReportsLoading: false,
      isGlobalReportView: false,
    });
    void loadTickets();
  };

  const toggleProjectsCollapsed = () => {
    mergeState({ projectsCollapsed: !stateRef.current.projectsCollapsed });
  };

  const selectTicket = async (ticketId: string) => {
    mergeState({
      lockedTicket: null,
      viewingReportsForProjectId: '',
      viewingReportsForProjectName: '',
      projectReportEntries: [],
      projectReportsLoading: false,
      isGlobalReportView: false,
    });
    try {
      const ticket = await apiClient.getTicket(ticketId);
      mergeState({ selectedTicket: ticket, messageDraft: '', lockedTicket: null });
    } catch (error: any) {
      if (error?.response?.status === 403 && error?.response?.data?.ticket) {
        mergeState({
          selectedTicket: null,
          lockedTicket: error.response.data.ticket,
        });
      } else {
        console.error('Unable to select ticket', error);
      }
    }
  };

  const refreshTicketDetail = async (ticketId?: string) => {
    const target = ticketId || stateRef.current.selectedTicket?.id || stateRef.current.lockedTicket?.id;
    if (!target) return;
    await selectTicket(target);
  };

  const updateCreateTicketField = <K extends keyof CreateTicketModel>(
    key: K,
    value: CreateTicketModel[K],
  ) => {
    mergeState({ createTicketModel: { ...stateRef.current.createTicketModel, [key]: value } });
  };

  const updateCreateProjectField = <K extends keyof CreateProjectModel>(
    key: K,
    value: CreateProjectModel[K],
  ) => {
    mergeState({ createProjectModel: { ...stateRef.current.createProjectModel, [key]: value } });
  };

  const updateDmFormField = <K extends keyof DmForm>(key: K, value: DmForm[K]) => {
    mergeState({ dmForm: { ...stateRef.current.dmForm, [key]: value } });
  };

  const createProject = async () => {
    const { name, ticketPrefix } = stateRef.current.createProjectModel;
    if (!name.trim() || !ticketPrefix.trim()) {
      mergeState({ feedback: 'Project name and prefix are required.' });
      return;
    }
    const slug = slugify(
      stateRef.current.createProjectModel.slug || stateRef.current.createProjectModel.name,
    );
    if (!slug) {
      mergeState({ feedback: 'Unable to generate a valid project slug.' });
      return;
    }
    try {
      const response = await apiClient.createProject({
        name: name.trim(),
        slug,
        ticketPrefix: ticketPrefix.trim(),
        description: stateRef.current.createProjectModel.description.trim() || undefined,
      });
      mergeState({
        feedback: 'Project created.',
        createProjectModel: defaultProjectModel,
        selectedProjectId: response.id,
        createTicketModel: { ...stateRef.current.createTicketModel, projectId: response.id },
        showCreateProject: false,
      });
      await loadProjects();
      await loadTickets();
    } catch (error: any) {
      console.error('Unable to create project', error);
      mergeState({ feedback: error?.response?.data?.message || 'Project creation failed.' });
    }
  };

  const createTicket = async () => {
    const { title, projectId } = stateRef.current.createTicketModel;
    const creatorId = stateRef.current.selectedUserId;
    if (!title.trim() || !projectId || !creatorId) {
      mergeState({ feedback: 'Please complete the ticket form.' });
      return;
    }
    try {
      const ticket = await apiClient.createTicket({
        ...stateRef.current.createTicketModel,
        creatorId,
      });
      mergeState({
        createTicketModel: {
          ...stateRef.current.createTicketModel,
          title: '',
          description: '',
          inviteeIds: [],
        },
        feedback: `${ticket.ticketNumber} created.`,
        showCreateTicket: false,
      });
      await loadTickets();
      await selectTicket(ticket.id);
    } catch (error) {
      console.error('Unable to create ticket', error);
      mergeState({ feedback: 'Ticket creation failed.' });
    }
  };

  const postTicketMessage = async (body?: string) => {
    const ticketId = stateRef.current.selectedTicket?.id;
    const userId = stateRef.current.selectedUserId;
    const payload = (body ?? stateRef.current.messageDraft).trim();
    if (!ticketId || !userId || !payload) return;
    mergeState({ isPostingMessage: true });
    try {
      await apiClient.postTicketMessage(ticketId, { userId, body: payload });
      mergeState({ messageDraft: '' });
      await refreshTicketDetail(ticketId);
      await loadTickets();
      await loadNotifications();
    } catch (error) {
      console.error('Unable to post message', error);
    } finally {
      mergeState({ isPostingMessage: false });
    }
  };

  const sendDm = async () => {
    const { recipientId, body } = stateRef.current.dmForm;
    const senderId = stateRef.current.selectedUserId;
    if (!recipientId || !senderId || !body.trim()) return;
    await apiClient.sendDm({ senderId, recipientId, body });
    mergeState({
      dmForm: { ...stateRef.current.dmForm, body: '' },
      selectedDmRecipientId: recipientId,
    });
    await loadDms();
    await loadNotifications();
  };

  const handleAssign = async (assigneeId: string) => {
    if (!stateRef.current.selectedTicket || !assigneeId || !stateRef.current.selectedUserId) return;
    await apiClient.assignTicket(stateRef.current.selectedTicket.id, assigneeId, stateRef.current.selectedUserId);
    await refreshTicketDetail();
  };

  const handleJoinTicket = async (targetUserId?: string) => {
    const ticketId = stateRef.current.selectedTicket?.id || stateRef.current.lockedTicket?.id;
    const actorId = stateRef.current.selectedUserId;
    if (!ticketId || !actorId) return;
    await apiClient.joinTicket(ticketId, { userId: targetUserId || actorId, actorId });
    await loadTickets();
    await refreshTicketDetail(ticketId);
  };

  const handleArchiveTicket = async () => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId) return;
    const ticketId = stateRef.current.selectedTicket.id;
    await apiClient.archiveTicket(ticketId, stateRef.current.selectedUserId);
    mergeState({ selectedTicket: null });
    await loadTickets();
  };

  const handlePrivacyChange = async (privacy: TicketPrivacy) => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId) return;
    if (stateRef.current.selectedTicket.privacy === privacy) return;
    await apiClient.updateTicketPrivacy(stateRef.current.selectedTicket.id, {
      actorId: stateRef.current.selectedUserId,
      privacy,
    });
    await refreshTicketDetail(stateRef.current.selectedTicket.id);
    await loadTickets();
  };

  const handleDashboardRangeChange = async (range: DashboardRange) => {
    mergeState({ dashboardRange: range });
    if (range !== 'custom') {
      mergeState({ dashboardStartDate: null, dashboardEndDate: null });
      await loadDashboard();
    }
  };

  const handleDashboardDateChange = async (type: 'start' | 'end', value: string | null) => {
    const nextStart = type === 'start' ? value : stateRef.current.dashboardStartDate;
    const nextEnd = type === 'end' ? value : stateRef.current.dashboardEndDate;
    mergeState({ dashboardStartDate: nextStart, dashboardEndDate: nextEnd });
    if (stateRef.current.dashboardRange === 'custom' && nextStart && nextEnd) {
      await loadDashboard();
    }
  };

  const openUserSettings = () => {
    if (!user) return;
    mergeState({
      showUserSettings: true,
      userSettingsForm: {
        displayName: user.displayName,
        handle: user.handle,
        location: user.location || '',
      },
      userSettingsError: '',
    });
  };

  const closeUserSettings = () => {
    mergeState({ showUserSettings: false, userSettingsForm: defaultUserSettings, userSettingsError: '' });
  };

  const openCreateProject = () => {
    mergeState({ showCreateProject: true });
  };

  const closeCreateProject = () => {
    mergeState({ showCreateProject: false });
  };

  const openCreateTicket = () => {
    mergeState({ showCreateTicket: true });
  };

  const closeCreateTicket = () => {
    mergeState({ showCreateTicket: false });
  };

  const saveUserSettings = async () => {
    if (!user) return;
    const { displayName, handle, location } = stateRef.current.userSettingsForm;
    const updates: Partial<Pick<User, 'displayName' | 'handle' | 'location'>> = {};
    if (displayName.trim() && displayName.trim() !== user.displayName) {
      updates.displayName = displayName.trim();
    }
    if (handle.trim() && handle.trim() !== user.handle) {
      updates.handle = handle.trim();
    }
    if (location.trim() !== (user.location || '')) {
      updates.location = location.trim() || null;
    }
    if (!Object.keys(updates).length) {
      mergeState({ userSettingsError: 'No changes to save.' });
      return;
    }
    mergeState({ userSettingsSaving: true, userSettingsError: '' });
    try {
      await updateProfile(updates);
      mergeState({ feedback: 'Profile updated.' });
      closeUserSettings();
      await loadUsers();
    } catch (error: any) {
      console.error('Unable to update profile', error);
      mergeState({ userSettingsError: error?.response?.data?.message || 'Unable to update profile.' });
    } finally {
      mergeState({ userSettingsSaving: false });
    }
  };

  const updateUserSettingsField = (key: keyof UserSettingsForm, value: string) => {
    mergeState({ userSettingsForm: { ...stateRef.current.userSettingsForm, [key]: value } });
  };

  const setTicketSearch = (value: string) => {
    mergeState({ ticketSearch: value });
  };

  const setMessageDraft = (value: string) => {
    mergeState({ messageDraft: value });
  };

  const setActiveTab = (tab: WorkspaceTab) => {
    mergeState({ activeTab: tab });
    if (tab === 'activity') {
      const timestamp = new Date().toISOString();
      const userId = stateRef.current.selectedUserId;
      if (userId) {
        persistTimestamp(ACTIVITY_VIEW_KEY(userId), timestamp);
      }
      mergeState({ hasActivityAttention: false, lastActivityViewTimestamp: timestamp });
      void loadNotifications();
    } else if (tab === 'dms') {
      const timestamp = new Date().toISOString();
      const userId = stateRef.current.selectedUserId;
      if (userId) {
        persistTimestamp(DM_VIEW_KEY(userId), timestamp);
      }
      mergeState({ hasDmAttention: false, lastDmViewTimestamp: timestamp });
      void loadDms();
    } else if (tab === 'dashboard') {
      void loadDashboard();
    } else if (tab === 'home') {
      void loadTickets();
    }
  };

  const handleDmRecipientChange = (userId: string) => {
    mergeState({ selectedDmRecipientId: userId, dmForm: { ...stateRef.current.dmForm, recipientId: userId } });
  };

  const markNotification = async (notificationId: string) => {
    await apiClient.markNotificationRead(notificationId);
    await loadNotifications();
  };

  const navigateToNotification = async (notification: NotificationItem) => {
    if (!notification.ticketId) return;
    setActiveTab('home');
    await selectTicket(notification.ticketId);
    if (!notification.isRead) {
      await markNotification(notification.id);
    }
  };

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      setTicketSearch,
      setMessageDraft,
      setActiveTab,
      selectProject,
      toggleProjectsCollapsed,
      selectTicket,
      refreshTicketDetail,
      loadTickets,
      loadDashboard,
      loadNotifications,
      loadDms,
      updateCreateTicketField,
      updateCreateProjectField,
      updateDmFormField,
      createProject,
      createTicket,
      postTicketMessage,
      sendDm,
      handleAssign,
      handleJoinTicket,
      handleArchiveTicket,
      handlePrivacyChange,
      handleDashboardRangeChange,
      handleDashboardDateChange,
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
      handleDmRecipientChange,
      markNotification,
      navigateToNotification,
    }),
    [state],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

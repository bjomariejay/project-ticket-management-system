import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "../api";
import { useAuth } from "../hooks/useAuth";
import {
  DashboardEntry,
  DashboardFilter,
  DmMessage,
  NotificationItem,
  Project,
  ProjectReportEntry,
  Ticket,
  TicketDetail,
  TicketPriority,
  TicketPrivacy,
  User,
  UserWorkLogEntry,
  UserWorkLogFilter,
} from "../types/api";
import { slugify } from "../utils/text";
import { useInterval } from "../hooks/useInterval";

export type WorkspaceTab = "dashboard" | "home" | "dms" | "activity";
export type DashboardRange = "today" | "7d" | "30d" | "90d" | "all" | "custom";

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
  userWorkLogs: UserWorkLogEntry[];
  userWorkLogRange: DashboardRange;
  notifications: NotificationItem[];
  dms: DmMessage[];
  selectedUserId: string;
  selectedProjectId: string;
  expandedProjectId: string;
  selectedTicket: TicketDetail | null;
  lockedTicket: {
    id: string;
    ticketNumber: string;
    title: string;
    privacy: TicketPrivacy;
  } | null;
  activeTab: WorkspaceTab;
  projectsCollapsed: boolean;
  ticketSearch: string;
  messageDraft: string;
  createTicketModel: CreateTicketModel;
  createProjectModel: CreateProjectModel;
  projectEditorModel: CreateProjectModel;
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
  userWorkLogSearch: string;
  userWorkLogStartDate: string | null;
  userWorkLogEndDate: string | null;
  userWorkLogLoading: boolean;
  userSettingsForm: UserSettingsForm;
  userSettingsError: string;
  userSettingsSaving: boolean;
  showUserSettings: boolean;
  lastDmViewTimestamp: string | null;
  lastActivityViewTimestamp: string | null;
  showCreateProject: boolean;
  showCreateTicket: boolean;
  showProjectEditor: boolean;
  projectEditorProjectId: string;
  projectEditorSaving: boolean;
  projectEditorDeleting: boolean;
  projectReportEntries: ProjectReportEntry[];
  reviewerTickets: Ticket[];
  viewingReportsForProjectId: string;
  viewingReportsForProjectName: string;
  projectReportsLoading: boolean;
  isGlobalReportView: boolean;
  isReviewerReportView: boolean;
  hasUnseenGlobalReports: boolean;
  latestGlobalReportTimestamp: string | null;
}

const defaultTicketModel: CreateTicketModel = {
  title: "",
  description: "",
  projectId: "",
  estimatedHours: 1,
  privacy: "public",
  inviteeIds: [],
  priority: "normal",
};

const defaultProjectModel: CreateProjectModel = {
  name: "",
  slug: "",
  ticketPrefix: "",
  description: "",
};

const defaultDmForm: DmForm = {
  recipientId: "",
  body: "",
};

const defaultUserSettings: UserSettingsForm = {
  displayName: "",
  handle: "",
  location: "",
};

const defaultWorkspaceLabel = "Mission Control Workspace";

const initialState: WorkspaceState = {
  workspaceLabel: defaultWorkspaceLabel,
  users: [],
  projects: [],
  tickets: [],
  dashboard: [],
  userWorkLogs: [],
  userWorkLogRange: "today",
  notifications: [],
  dms: [],
  selectedUserId: "",
  selectedProjectId: "",
  expandedProjectId: "",
  selectedTicket: null,
  lockedTicket: null,
  activeTab: "home",
  projectsCollapsed: false,
  ticketSearch: "",
  messageDraft: "",
  createTicketModel: defaultTicketModel,
  createProjectModel: defaultProjectModel,
  projectEditorModel: defaultProjectModel,
  dmForm: defaultDmForm,
  selectedDmRecipientId: "",
  feedback: "",
  isLoadingTickets: false,
  isPostingMessage: false,
  hasDmAttention: false,
  hasActivityAttention: false,
  isBootstrapping: false,
  dashboardRange: "today",
  dashboardStartDate: null,
  dashboardEndDate: null,
  userWorkLogSearch: "",
  userWorkLogStartDate: null,
  userWorkLogEndDate: null,
  userWorkLogLoading: false,
  userSettingsForm: defaultUserSettings,
  userSettingsError: "",
  userSettingsSaving: false,
  showUserSettings: false,
  lastDmViewTimestamp: null,
  lastActivityViewTimestamp: null,
  showCreateProject: false,
  showCreateTicket: false,
  showProjectEditor: false,
  projectEditorProjectId: "",
  projectEditorSaving: false,
  projectEditorDeleting: false,
  projectReportEntries: [],
  reviewerTickets: [],
  viewingReportsForProjectId: "",
  viewingReportsForProjectName: "",
  projectReportsLoading: false,
  isGlobalReportView: false,
  isReviewerReportView: false,
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
  loadDashboard: (filtersOverride?: DashboardFilter) => Promise<void>;
  loadNotifications: () => Promise<void>;
  loadDms: () => Promise<void>;
  updateCreateTicketField: <K extends keyof CreateTicketModel>(
    key: K,
    value: CreateTicketModel[K],
  ) => void;
  updateCreateProjectField: <K extends keyof CreateProjectModel>(
    key: K,
    value: CreateProjectModel[K],
  ) => void;
  updateProjectEditorField: <K extends keyof CreateProjectModel>(
    key: K,
    value: CreateProjectModel[K],
  ) => void;
  updateDmFormField: <K extends keyof DmForm>(key: K, value: DmForm[K]) => void;
  createProject: () => Promise<void>;
  saveProjectEditor: () => Promise<void>;
  openProjectEditor: (projectId: string) => void;
  closeProjectEditor: () => void;
  removeProject: (projectId?: string) => Promise<void>;
  createTicket: () => Promise<void>;
  postTicketMessage: (body?: string) => Promise<void>;
  sendDm: () => Promise<void>;
  startTicket: () => Promise<void>;
  handleAssign: (userId: string) => Promise<void>;
  updateTicketReviewer: (reviewerId: string) => Promise<void>;
  updateTicketEstimate: (hours: number) => Promise<void>;
  updateTicketActualTime: (hours: number) => Promise<void>;
  quickUpdateTicket: (
    ticketId: string,
    updates: {
      title?: string;
      status?: Ticket["status"];
      priority?: TicketPriority;
      estimatedHours?: number | null;
    },
  ) => Promise<Ticket | null>;
  handleJoinTicket: (targetUserId?: string) => Promise<void>;
  handleArchiveTicket: () => Promise<void>;
  handlePrivacyChange: (privacy: TicketPrivacy) => Promise<void>;
  restoreArchivedTicket: () => Promise<void>;
  handleDashboardRangeChange: (range: DashboardRange) => Promise<void>;
  handleDashboardDateChange: (
    type: "start" | "end",
    value: string | null,
  ) => Promise<void>;
  handleUserWorkLogSearchChange: (value: string) => Promise<void>;
  handleUserWorkLogRangeChange: (range: DashboardRange) => Promise<void>;
  handleUserWorkLogDateChange: (
    type: "start" | "end",
    value: string | null,
  ) => Promise<void>;
  refreshUserWorkLogs: () => Promise<void>;
  openUserSettings: () => void;
  closeUserSettings: () => void;
  saveUserSettings: () => Promise<void>;
  updateUserSettingsField: (key: keyof UserSettingsForm, value: string) => void;
  openCreateProject: () => void;
  closeCreateProject: () => void;
  openCreateTicket: () => void;
  closeCreateTicket: () => void;
  handleGlobalReportView: () => Promise<void>;
  handleReviewerReportView: () => Promise<void>;
  closeProjectReports: () => void;
  handleDmRecipientChange: (userId: string) => void;
  markNotification: (notificationId: string) => Promise<void>;
  navigateToNotification: (notification: NotificationItem) => Promise<void>;
  updateUserInfo: (
    userId: string,
    payload: {
      displayName?: string;
      handle?: string;
      location?: string | null;
    },
  ) => Promise<void>;
}

const DM_VIEW_KEY = (userId: string) => `tsfe:dms:lastViewed:${userId}`;
const GLOBAL_REPORT_PROJECT_ID = "global-reports";
const REVIEWER_REPORT_PROJECT_ID = "reviewer-reports";

export const WorkspaceContext = createContext<
  WorkspaceContextValue | undefined
>(undefined);

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
      selectedUserId: user?.id || "",
      createTicketModel: { ...defaultTicketModel, projectId: "" },
    }));
  }, [user?.id]);

  const bootstrap = useCallback(async () => {
    if (!user || !isAuthenticated) {
      resetWorkspaceState();
      return;
    }
    mergeState({ isBootstrapping: true, feedback: "" });
    try {
      const [users, projects] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getProjects(),
      ]);
      const retainedProjectId = stateRef.current.selectedProjectId;
      const selectedProjectId =
        retainedProjectId &&
        projects.some((project) => project.id === retainedProjectId)
          ? retainedProjectId
          : "";
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
        expandedProjectId: selectedProjectId,
        activeTab:
          (user.handle || "").toLowerCase() === "admin" ? "dashboard" : "home",
      });
      await loadTickets();
      await Promise.all([
        loadDashboard(),
        loadUserWorkLogs(),
        loadNotifications(),
        loadDms(),
      ]);
    } catch (error) {
      console.error("Failed to bootstrap workspace", error);
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

  useInterval(
    () => {
      if (!isAuthenticated) return;
      apiClient
        .sendHeartbeat()
        .then(() => loadUsers())
        .catch((error) => console.error("Heartbeat failed", error));
    },
    isAuthenticated ? 30000 : null,
  );

  const loadUsers = useCallback(async () => {
    try {
      const users = await apiClient.getUsers();
      console.log("Loaded users", users);
      mergeState({ users });
    } catch (error) {
      console.error("Unable to load users", error);
    }
  }, [mergeState]);

  const loadProjects = useCallback(async () => {
    try {
      const projects = await apiClient.getProjects();
      mergeState({ projects });
    } catch (error) {
      console.error("Unable to load projects", error);
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
      console.error("Unable to load tickets", error);
    } finally {
      mergeState({ isLoadingTickets: false });
    }
  }, [mergeState]);

  const buildDashboardFilters = useCallback(
    (overrides?: {
      range?: DashboardRange;
      startDate?: string | null;
      endDate?: string | null;
    }): DashboardFilter | undefined => {
      const dashboardRange = overrides?.range ?? stateRef.current.dashboardRange;
      const dashboardStartDate =
        overrides?.startDate ?? stateRef.current.dashboardStartDate;
      const dashboardEndDate =
        overrides?.endDate ?? stateRef.current.dashboardEndDate;

      if (dashboardRange === "all") return undefined;

      if (dashboardRange === "today") {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
      }

      if (dashboardRange === "custom") {
        if (dashboardStartDate && dashboardEndDate) {
          const start = new Date(`${dashboardStartDate}T00:00:00`).toISOString();
          const end = new Date(`${dashboardEndDate}T23:59:59`).toISOString();
          return { startDate: start, endDate: end };
        }
        return undefined;
      }

      const dayMap: Record<"7d" | "30d" | "90d", number> = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
      };
      const days = dayMap[dashboardRange as keyof typeof dayMap];
      if (!days) return undefined;
      const now = new Date();
      const end = now.toISOString();
      const start = new Date(
        now.getTime() - days * 24 * 60 * 60 * 1000,
      ).toISOString();
      return { startDate: start, endDate: end };
    },
    [],
  );

  const buildUserWorkLogFilters = useCallback(
    (overrides?: {
      startDate?: string | null;
      endDate?: string | null;
      search?: string;
      range?: DashboardRange;
    }): UserWorkLogFilter | undefined => {
      const hasOverride = (key: 'startDate' | 'endDate' | 'search') =>
        overrides && Object.prototype.hasOwnProperty.call(overrides, key);

      const range = overrides?.range ?? stateRef.current.userWorkLogRange;
      const nextStart = hasOverride('startDate')
        ? overrides?.startDate ?? null
        : stateRef.current.userWorkLogStartDate;
      const nextEnd = hasOverride('endDate')
        ? overrides?.endDate ?? null
        : stateRef.current.userWorkLogEndDate;
      const nextSearch = hasOverride('search')
        ? overrides?.search ?? ''
        : stateRef.current.userWorkLogSearch;

      const filters: UserWorkLogFilter = {};

      if (range === 'today') {
        const today = new Date();
        const day = today.toISOString().slice(0, 10);
        filters.startDate = day;
        filters.endDate = day;
      } else if (range === 'custom') {
        if (nextStart) {
          filters.startDate = nextStart;
        }
        if (nextEnd) {
          filters.endDate = nextEnd;
        }
      }

      if (nextSearch?.trim()) {
        filters.search = nextSearch.trim();
      }

      return Object.keys(filters).length ? filters : undefined;
    },
    [],
  );

  const loadDashboard = useCallback(
    async (filtersOverride?: DashboardFilter) => {
      try {
        const filters = filtersOverride ?? buildDashboardFilters();
        const dashboard = await apiClient.getDashboard(filters);
        mergeState({ dashboard });
      } catch (error) {
        console.error("Unable to load dashboard", error);
      }
    },
    [buildDashboardFilters, mergeState],
  );

  const loadUserWorkLogs = useCallback(
    async (
      overrides?: {
        startDate?: string | null;
        endDate?: string | null;
        search?: string;
      },
    ) => {
      mergeState({ userWorkLogLoading: true });
      try {
        const filters = buildUserWorkLogFilters(overrides);
        const userWorkLogs = await apiClient.getUserWorkLogs(filters);
        mergeState({ userWorkLogs });
      } catch (error) {
        console.error("Unable to load user work logs", error);
      } finally {
        mergeState({ userWorkLogLoading: false });
      }
    },
    [buildUserWorkLogFilters, mergeState],
  );

  const restoreTimestamp = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn("Unable to read timestamp key", key, error);
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
      console.warn("Unable to persist timestamp key", key, error);
    }
  };

  const markGlobalReportsSeen = async (timestamp: string | null) => {
    const seenAt = timestamp ?? new Date().toISOString();
    mergeState({
      hasUnseenGlobalReports: false,
      latestGlobalReportTimestamp: timestamp,
    });
    try {
      await apiClient.markGlobalReportsSeen(seenAt);
    } catch (error) {
      console.error("Unable to persist report-of-work acknowledgement", error);
    }
  };

  const updateActivityAttention = useCallback(async () => {
    try {
      const { hasNew } = await apiClient.getNotificationStatus();
      mergeState({ hasActivityAttention: hasNew });
    } catch (error) {
      console.error("Unable to check ticket notifications", error);
    }
  }, [mergeState]);

  const markAllTicketNotificationsRead = useCallback(async () => {
    try {
      await apiClient.markTicketNotificationsSeen();
      mergeState({
        notifications: stateRef.current.notifications.map((notification) =>
          notification.ticketId
            ? { ...notification, isRead: true }
            : notification,
        ),
        hasActivityAttention: false,
      });
    } catch (error) {
      console.error("Unable to mark notifications read", error);
    }
  }, [mergeState]);

  const updateDmAttention = useCallback(() => {
    const userId = stateRef.current.selectedUserId;
    if (!userId) return;
    const lastViewed =
      stateRef.current.lastDmViewTimestamp ??
      restoreTimestamp(DM_VIEW_KEY(userId));
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
      !lastViewed ||
      new Date(latestIncoming).getTime() > new Date(lastViewed).getTime();
    mergeState({
      hasDmAttention: hasAttention,
      lastDmViewTimestamp: lastViewed,
    });
  }, [mergeState]);

  const closeProjectReports = () => {
    mergeState({
      projectReportEntries: [],
      reviewerTickets: [],
      viewingReportsForProjectId: "",
      viewingReportsForProjectName: "",
      projectReportsLoading: false,
      isGlobalReportView: false,
      isReviewerReportView: false,
    });
  };

  const handleGlobalReportView = async () => {
    mergeState({ projectReportsLoading: true });
    try {
      const entries = await apiClient.getAllReports();
      const latest = entries[0]?.createdAt || null;
      mergeState({
        viewingReportsForProjectId: GLOBAL_REPORT_PROJECT_ID,
        viewingReportsForProjectName: "All projects",
        projectReportEntries: entries,
        reviewerTickets: [],
        projectReportsLoading: false,
        isGlobalReportView: true,
        isReviewerReportView: false,
        selectedTicket: null,
        lockedTicket: null,
      });
      void markGlobalReportsSeen(latest);
    } catch (error) {
      console.error("Unable to load report-of-work", error);
      mergeState({ projectReportsLoading: false });
      closeProjectReports();
    }
  };

  const handleReviewerReportView = async () => {
    const reviewerId = stateRef.current.selectedUserId;
    if (!reviewerId) return;
    mergeState({ projectReportsLoading: true });
    try {
      const [entries, reviewerTickets] = await Promise.all([
        apiClient.getReviewerReports(reviewerId),
        apiClient.getTickets({ reviewerId }),
      ]);
      const inProgressReviewerTickets = reviewerTickets.filter(
        (ticket) => ticket.status === "in_progress",
      );
      const reviewer = stateRef.current.users.find(
        (user) => user.id === reviewerId,
      );
      mergeState({
        viewingReportsForProjectId: `${REVIEWER_REPORT_PROJECT_ID}:${reviewerId}`,
        viewingReportsForProjectName: reviewer
          ? `Reviewer: ${reviewer.displayName}`
          : "Reviewer reports",
        projectReportEntries: entries,
        reviewerTickets: inProgressReviewerTickets,
        projectReportsLoading: false,
        isReviewerReportView: true,
        isGlobalReportView: false,
        selectedTicket: null,
        lockedTicket: null,
      });
    } catch (error) {
      console.error("Unable to load reviewer report-of-work", error);
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
        const firstConversation = dms.find(
          (dm) => dm.senderId !== stateRef.current.selectedUserId,
        );
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
      console.error("Unable to load DMs", error);
    }
  }, [mergeState, updateDmAttention]);

  const checkGlobalReports = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    try {
      const { latest, lastSeen } = await apiClient.getGlobalReportsStatus();
      if (!latest) {
        mergeState({
          latestGlobalReportTimestamp: null,
          hasUnseenGlobalReports: false,
        });
        return;
      }
      const latestTime = new Date(latest).getTime();
      const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : NaN;
      const hasUnseen =
        !lastSeen ||
        !Number.isFinite(lastSeenTime) ||
        (Number.isFinite(latestTime) && latestTime > lastSeenTime);
      mergeState({
        latestGlobalReportTimestamp: latest,
        hasUnseenGlobalReports: hasUnseen,
      });
    } catch (error) {
      console.error("Unable to check report-of-work updates", error);
    }
  }, [mergeState]);

  const loadNotifications = useCallback(async () => {
    if (!stateRef.current.selectedUserId) return;
    try {
      const notifications = await apiClient.getNotifications();
      mergeState({ notifications });
      await updateActivityAttention();
      await checkGlobalReports();
    } catch (error) {
      console.error("Unable to load notifications", error);
    }
  }, [checkGlobalReports, mergeState, updateActivityAttention]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void updateActivityAttention();
  }, [isAuthenticated, updateActivityAttention]);

  const selectProject = (projectId: string) => {
    if (stateRef.current.expandedProjectId === projectId) {
      mergeState({ expandedProjectId: "" });
      return;
    }
    mergeState({
      selectedProjectId: projectId,
      expandedProjectId: projectId,
      createTicketModel: { ...stateRef.current.createTicketModel, projectId },
      selectedTicket: null,
      lockedTicket: null,
      viewingReportsForProjectId: "",
      viewingReportsForProjectName: "",
      projectReportEntries: [],
      reviewerTickets: [],
      projectReportsLoading: false,
      isGlobalReportView: false,
      isReviewerReportView: false,
    });
    void loadTickets();
  };

  const toggleProjectsCollapsed = () => {
    mergeState({ projectsCollapsed: !stateRef.current.projectsCollapsed });
  };

  const selectTicket = async (ticketId: string) => {
    mergeState({
      lockedTicket: null,
      viewingReportsForProjectId: "",
      viewingReportsForProjectName: "",
      projectReportEntries: [],
      reviewerTickets: [],
      projectReportsLoading: false,
      isGlobalReportView: false,
      isReviewerReportView: false,
    });
    try {
      const ticket = await apiClient.getTicket(ticketId);
      mergeState({
        selectedTicket: ticket,
        messageDraft: "",
        lockedTicket: null,
      });
    } catch (error: any) {
      if (error?.response?.status === 403 && error?.response?.data?.ticket) {
        mergeState({
          selectedTicket: null,
          lockedTicket: error.response.data.ticket,
        });
      } else {
        console.error("Unable to select ticket", error);
      }
    }
  };

  const refreshTicketDetail = async (ticketId?: string) => {
    const target =
      ticketId ||
      stateRef.current.selectedTicket?.id ||
      stateRef.current.lockedTicket?.id;
    if (!target) return;
    await selectTicket(target);
  };

  const updateCreateTicketField = <K extends keyof CreateTicketModel>(
    key: K,
    value: CreateTicketModel[K],
  ) => {
    mergeState({
      createTicketModel: {
        ...stateRef.current.createTicketModel,
        [key]: value,
      },
    });
  };

  const updateCreateProjectField = <K extends keyof CreateProjectModel>(
    key: K,
    value: CreateProjectModel[K],
  ) => {
    mergeState({
      createProjectModel: {
        ...stateRef.current.createProjectModel,
        [key]: value,
      },
    });
  };

  const updateDmFormField = <K extends keyof DmForm>(
    key: K,
    value: DmForm[K],
  ) => {
    mergeState({ dmForm: { ...stateRef.current.dmForm, [key]: value } });
  };

  const openProjectEditor = (projectId: string) => {
    const project = stateRef.current.projects.find(
      (item) => item.id === projectId,
    );
    if (!project) return;
    mergeState({
      showProjectEditor: true,
      projectEditorProjectId: projectId,
      projectEditorModel: {
        name: project.name,
        slug: project.slug,
        ticketPrefix: project.ticketPrefix,
        description: project.description || "",
      },
    });
  };

  const closeProjectEditor = () => {
    mergeState({
      showProjectEditor: false,
      projectEditorProjectId: "",
      projectEditorModel: defaultProjectModel,
      projectEditorSaving: false,
      projectEditorDeleting: false,
    });
  };

  const updateProjectEditorField = <K extends keyof CreateProjectModel>(
    key: K,
    value: CreateProjectModel[K],
  ) => {
    mergeState({
      projectEditorModel: {
        ...stateRef.current.projectEditorModel,
        [key]: value,
      },
    });
  };

  const saveProjectEditor = async () => {
    const projectId = stateRef.current.projectEditorProjectId;
    if (!projectId) return;
    const { name, ticketPrefix, slug, description } =
      stateRef.current.projectEditorModel;
    if (!name.trim() || !ticketPrefix.trim()) {
      mergeState({ feedback: "Project name and prefix are required." });
      return;
    }
    mergeState({ projectEditorSaving: true });
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        ticketPrefix: ticketPrefix.trim(),
        description: description.trim() || undefined,
      };
      console.log("Updating project", { projectId, payload });
      await apiClient.updateProject(projectId, {
        ...payload,
      });
      mergeState({ feedback: "Project updated." });
      closeProjectEditor();
      await loadProjects();
    } catch (error: any) {
      console.error("Unable to update project", error);
      mergeState({
        feedback: error?.response?.data?.message || "Project update failed.",
      });
    } finally {
      mergeState({ projectEditorSaving: false });
    }
  };

  const removeProject = async (projectId?: string) => {
    const targetId = projectId || stateRef.current.projectEditorProjectId;
    if (!targetId) return;
    mergeState({ projectEditorDeleting: true });
    try {
      await apiClient.deleteProject(targetId);
      mergeState({ feedback: "Project deleted." });
      if (stateRef.current.selectedProjectId === targetId) {
        mergeState({
          selectedProjectId: "",
          expandedProjectId: "",
          selectedTicket: null,
          lockedTicket: null,
          createTicketModel: {
            ...stateRef.current.createTicketModel,
            projectId: "",
          },
        });
      } else if (stateRef.current.expandedProjectId === targetId) {
        mergeState({ expandedProjectId: "" });
      }
      closeProjectEditor();
      await loadProjects();
      await loadTickets();
    } catch (error: any) {
      console.error("Unable to delete project", error);
      mergeState({
        feedback: error?.response?.data?.message || "Unable to delete project.",
      });
    } finally {
      mergeState({ projectEditorDeleting: false });
    }
  };

  //jay
  const createProject = async () => {
    const { name, ticketPrefix } = stateRef.current.createProjectModel;
    if (!name.trim() || !ticketPrefix.trim()) {
      mergeState({ feedback: "Project name and prefix are required." });
      return;
    }
    const slug = slugify(
      stateRef.current.createProjectModel.slug ||
        stateRef.current.createProjectModel.name,
    );
    if (!slug) {
      mergeState({ feedback: "Unable to generate a valid project slug." });
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        slug,
        ticketPrefix: ticketPrefix.trim(),
        description:
          stateRef.current.createProjectModel.description.trim() || undefined,
      };
      console.log("Creating project", payload);
      const response = await apiClient.createProject(payload);
      mergeState({
        feedback: "Project created.",
        createProjectModel: defaultProjectModel,
        selectedProjectId: response.id,
        expandedProjectId: response.id,
        createTicketModel: {
          ...stateRef.current.createTicketModel,
          projectId: response.id,
        },
        showCreateProject: false,
      });
      await loadProjects();
      await loadTickets();
    } catch (error: any) {
      console.error("Unable to create project", error);
      mergeState({
        feedback: error?.response?.data?.message || "Project creation failed.",
      });
    }
  };

  const createTicket = async () => {
    const { title, projectId } = stateRef.current.createTicketModel;
    const creatorId = stateRef.current.selectedUserId;
    if (!title.trim() || !projectId || !creatorId) {
      mergeState({ feedback: "Please complete the ticket form." });
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
          title: "",
          description: "",
          inviteeIds: [],
        },
        feedback: `${ticket.ticketNumber} created.`,
        showCreateTicket: false,
      });
      await loadTickets();
      await selectTicket(ticket.id);
    } catch (error) {
      console.error("Unable to create ticket", error);
      mergeState({ feedback: "Ticket creation failed." });
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
      mergeState({ messageDraft: "" });
      await refreshTicketDetail(ticketId);
      await loadTickets();
      await loadNotifications();
    } catch (error) {
      console.error("Unable to post message", error);
    } finally {
      mergeState({ isPostingMessage: false });
    }
  };

  const startTicket = async () => {
    await postTicketMessage("start ticket");
  };

  const sendDm = async () => {
    const { recipientId, body } = stateRef.current.dmForm;
    const senderId = stateRef.current.selectedUserId;
    if (!recipientId || !senderId || !body.trim()) return;
    await apiClient.sendDm({ senderId, recipientId, body });
    mergeState({
      dmForm: { ...stateRef.current.dmForm, body: "" },
      selectedDmRecipientId: recipientId,
    });
    await loadDms();
    await loadNotifications();
  };

  const handleAssign = async (assigneeId: string) => {
    if (
      !stateRef.current.selectedTicket ||
      !assigneeId ||
      !stateRef.current.selectedUserId
    )
      return;
    await apiClient.assignTicket(
      stateRef.current.selectedTicket.id,
      assigneeId,
      stateRef.current.selectedUserId,
    );
    await refreshTicketDetail();
  };

  const updateTicketReviewer = async (reviewerId: string) => {
    if (
      !stateRef.current.selectedTicket ||
      !reviewerId ||
      !stateRef.current.selectedUserId
    )
      return;
    await apiClient.updateTicketReviewer(stateRef.current.selectedTicket.id, {
      reviewerId,
      actorId: stateRef.current.selectedUserId,
    });
    await refreshTicketDetail();
    await loadTickets();
  };

  const handleJoinTicket = async (targetUserId?: string) => {
    const ticketId =
      stateRef.current.selectedTicket?.id || stateRef.current.lockedTicket?.id;
    const actorId = stateRef.current.selectedUserId;
    if (!ticketId || !actorId) return;
    await apiClient.joinTicket(ticketId, {
      userId: targetUserId || actorId,
      actorId,
    });
    await loadTickets();
    await refreshTicketDetail(ticketId);
  };

  const updateTicketEstimate = async (hours: number) => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId)
      return;
    await apiClient.updateTicketSettings(stateRef.current.selectedTicket.id, {
      actorId: stateRef.current.selectedUserId,
      estimatedHours: hours,
    });
    await refreshTicketDetail(stateRef.current.selectedTicket.id);
    await loadTickets();
  };

  const updateTicketActualTime = async (hours: number) => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId)
      return;
    await apiClient.updateTicketSettings(stateRef.current.selectedTicket.id, {
      actorId: stateRef.current.selectedUserId,
      actualHours: hours,
    });
    await refreshTicketDetail(stateRef.current.selectedTicket.id);
    await loadTickets();
  };

  const quickUpdateTicket = async (
    ticketId: string,
    updates: {
      title?: string;
      status?: Ticket["status"];
      priority?: TicketPriority;
      estimatedHours?: number | null;
    },
  ) => {
    if (!stateRef.current.selectedUserId) return null;
    const payload = {
      actorId: stateRef.current.selectedUserId,
      ...updates,
    };
    const updatedTicket = await apiClient.updateTicketSettings(
      ticketId,
      payload,
    );
    mergeState({
      tickets: stateRef.current.tickets.map((ticket) =>
        ticket.id === updatedTicket.id ? updatedTicket : ticket,
      ),
    });
    await loadDashboard();
    return updatedTicket;
  };

  const handleArchiveTicket = async () => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId)
      return;
    const ticketId = stateRef.current.selectedTicket.id;
    await apiClient.archiveTicket(ticketId, stateRef.current.selectedUserId);
    mergeState({ selectedTicket: null });
    await loadTickets();
  };

  const restoreArchivedTicket = async () => {
    if (
      !stateRef.current.selectedTicket ||
      stateRef.current.selectedTicket.status !== "archived"
    )
      return;
    if (!stateRef.current.selectedUserId) return;
    await apiClient.updateTicketSettings(stateRef.current.selectedTicket.id, {
      actorId: stateRef.current.selectedUserId,
      status: "in_progress",
    });
    mergeState({ feedback: "Ticket restarted and moved to In progress." });
    await refreshTicketDetail(stateRef.current.selectedTicket.id);
    await loadTickets();
  };

  const handlePrivacyChange = async (privacy: TicketPrivacy) => {
    if (!stateRef.current.selectedTicket || !stateRef.current.selectedUserId)
      return;
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
    if (range !== "custom") {
      mergeState({ dashboardStartDate: null, dashboardEndDate: null });
      const filters = buildDashboardFilters({ range, startDate: null, endDate: null });
      await loadDashboard(filters);
    }
  };

  const handleDashboardDateChange = async (
    type: "start" | "end",
    value: string | null,
  ) => {
    const { dashboardRange } = stateRef.current;
    const nextStart =
      type === "start" ? value : stateRef.current.dashboardStartDate;
    const nextEnd = type === "end" ? value : stateRef.current.dashboardEndDate;
    mergeState({ dashboardStartDate: nextStart, dashboardEndDate: nextEnd });
    if (dashboardRange === "custom" && nextStart && nextEnd) {
      const filters = buildDashboardFilters({
        range: dashboardRange,
        startDate: nextStart,
        endDate: nextEnd,
      });
      await loadDashboard(filters);
    }
  };

  const handleUserWorkLogRangeChange = async (range: DashboardRange) => {
    mergeState({ userWorkLogRange: range });
    if (range !== "custom") {
      mergeState({ userWorkLogStartDate: null, userWorkLogEndDate: null });
      await loadUserWorkLogs({ range });
    }
  };

  const handleUserWorkLogSearchChange = async (value: string) => {
    mergeState({ userWorkLogSearch: value });
    await loadUserWorkLogs({ search: value });
  };

  const handleUserWorkLogDateChange = async (
    type: "start" | "end",
    value: string | null,
  ) => {
    const normalizedValue = value || null;
    const nextStart =
      type === "start" ? normalizedValue : stateRef.current.userWorkLogStartDate;
    const nextEnd =
      type === "end" ? normalizedValue : stateRef.current.userWorkLogEndDate;
    mergeState({ userWorkLogStartDate: nextStart, userWorkLogEndDate: nextEnd });
    if (stateRef.current.userWorkLogRange === "custom" && nextStart && nextEnd) {
      await loadUserWorkLogs({ startDate: nextStart, endDate: nextEnd });
    }
  };

  const refreshUserWorkLogs = async () => {
    await loadUserWorkLogs();
  };

  const openUserSettings = () => {
    if (!user) return;
    mergeState({
      showUserSettings: true,
      userSettingsForm: {
        displayName: user.displayName,
        handle: user.handle,
        location: user.location || "",
      },
      userSettingsError: "",
    });
  };

  const closeUserSettings = () => {
    mergeState({
      showUserSettings: false,
      userSettingsForm: defaultUserSettings,
      userSettingsError: "",
    });
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
    const updates: Partial<Pick<User, "displayName" | "handle" | "location">> =
      {};
    if (displayName.trim() && displayName.trim() !== user.displayName) {
      updates.displayName = displayName.trim();
    }
    if (handle.trim() && handle.trim() !== user.handle) {
      updates.handle = handle.trim();
    }
    if (location.trim() !== (user.location || "")) {
      updates.location = location.trim() || null;
    }
    if (!Object.keys(updates).length) {
      mergeState({ userSettingsError: "No changes to save." });
      return;
    }
    mergeState({ userSettingsSaving: true, userSettingsError: "" });
    try {
      await updateProfile(updates);
      mergeState({ feedback: "Profile updated." });
      closeUserSettings();
      await loadUsers();
    } catch (error: any) {
      console.error("Unable to update profile", error);
      mergeState({
        userSettingsError:
          error?.response?.data?.message || "Unable to update profile.",
      });
    } finally {
      mergeState({ userSettingsSaving: false });
    }
  };

  const updateUserSettingsField = (
    key: keyof UserSettingsForm,
    value: string,
  ) => {
    mergeState({
      userSettingsForm: { ...stateRef.current.userSettingsForm, [key]: value },
    });
  };

  const setTicketSearch = (value: string) => {
    mergeState({ ticketSearch: value });
  };

  const setMessageDraft = (value: string) => {
    mergeState({ messageDraft: value });
  };

  const setActiveTab = (tab: WorkspaceTab) => {
    // Clear transient feedback each time user switches tabs so the inline banner hides.
    mergeState({ activeTab: tab, feedback: "" });
    if (tab === "activity") {
      mergeState({ hasActivityAttention: false });
      void (async () => {
        await markAllTicketNotificationsRead();
        await loadNotifications();
      })();
    } else if (tab === "dms") {
      const timestamp = new Date().toISOString();
      const userId = stateRef.current.selectedUserId;
      if (userId) {
        persistTimestamp(DM_VIEW_KEY(userId), timestamp);
      }
      mergeState({ hasDmAttention: false, lastDmViewTimestamp: timestamp });
      void loadDms();
    } else if (tab === "dashboard") {
      void loadDashboard();
      void loadUserWorkLogs();
    } else if (tab === "home") {
      void loadTickets();
    }
  };

  const handleDmRecipientChange = (userId: string) => {
    mergeState({
      selectedDmRecipientId: userId,
      dmForm: { ...stateRef.current.dmForm, recipientId: userId },
    });
  };

  const updateUserInfo = async (
    userId: string,
    payload: {
      displayName?: string;
      handle?: string;
      location?: string | null;
    },
  ) => {
    const updatedUser = await apiClient.updateUser(userId, payload);
    mergeState({
      users: stateRef.current.users.map((u) =>
        u.id === userId ? { ...u, ...updatedUser } : u,
      ),
    });
    if (stateRef.current.selectedTicket) {
      const updatedTicket = {
        ...stateRef.current.selectedTicket,
        members: stateRef.current.selectedTicket.members.map((member) =>
          member.userId === userId
            ? {
                ...member,
                displayName: updatedUser.displayName,
                handle: updatedUser.handle,
              }
            : member,
        ),
      };
      mergeState({ selectedTicket: updatedTicket });
    }
  };

  const markNotification = async (notificationId: string) => {
    await apiClient.markNotificationRead(notificationId);
    await loadNotifications();
  };

  const navigateToNotification = async (notification: NotificationItem) => {
    if (!notification.ticketId) return;
    setActiveTab("home");
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
      updateProjectEditorField,
      updateDmFormField,
      createProject,
      saveProjectEditor,
      openProjectEditor,
      closeProjectEditor,
      removeProject,
      createTicket,
      postTicketMessage,
      startTicket,
      sendDm,
      handleAssign,
      updateTicketReviewer,
      updateTicketEstimate,
      updateTicketActualTime,
      quickUpdateTicket,
      handleJoinTicket,
      handleArchiveTicket,
      handlePrivacyChange,
      restoreArchivedTicket,
      handleDashboardRangeChange,
      handleDashboardDateChange,
      handleUserWorkLogSearchChange,
      handleUserWorkLogRangeChange,
      handleUserWorkLogDateChange,
      refreshUserWorkLogs,
      openUserSettings,
      closeUserSettings,
      saveUserSettings,
      updateUserSettingsField,
      openCreateProject,
      closeCreateProject,
      openCreateTicket,
      closeCreateTicket,
      handleGlobalReportView,
      handleReviewerReportView,
      closeProjectReports,
      handleDmRecipientChange,
      markNotification,
      navigateToNotification,
      updateUserInfo,
    }),
    [state],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

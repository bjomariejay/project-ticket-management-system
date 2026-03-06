import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, SESSION_EXPIRED_EVENT } from '../api';
import { LoginPayload, RegisterPayload, User } from '../types/api';
import { storage } from '../utils/storage';

const TOKEN_KEY = 'tsfe:token';
const USER_KEY = 'tsfe:user';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: (options?: { silent?: boolean }) => Promise<void>;
  updateProfile: (payload: Partial<Pick<User, 'displayName' | 'handle' | 'location'>>) => Promise<User>;
  clearAuthError: () => void;
}

const readStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Unable to read stored token', error);
    return null;
  }
};

const readStoredUser = (): User | null => {
  return storage.get<User>(USER_KEY);
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  apiClient.setAuthToken(token);

  const persistSession = useCallback((nextToken: string | null, nextUser: User | null) => {
    setToken(nextToken);
    setUser(nextUser);
    apiClient.setAuthToken(nextToken);
    if (nextToken && nextUser) {
      try {
        localStorage.setItem(TOKEN_KEY, nextToken);
      } catch (error) {
        console.warn('Unable to persist auth token', error);
      }
      storage.set(USER_KEY, nextUser);
    } else {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (error) {
        console.warn('Unable to clear auth token', error);
      }
      storage.remove(USER_KEY);
    }
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const response = await apiClient.login(payload);
        console.log('fe response with user and created token:', response)
        persistSession(response.token, response.user);
      } catch (error) {
        setAuthError('Invalid username or password.');
        throw error;
      } finally {
        setAuthLoading(false);
      }
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const response = await apiClient.register(payload);
        persistSession(response.token, response.user);
      } catch (error: any) {
        setAuthError(error?.response?.data?.message || 'Unable to register.');
        throw error;
      } finally {
        setAuthLoading(false);
      }
    },
    [persistSession],
  );

  const logout = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        try {
          await apiClient.markInactive();
        } catch (error) {
          console.warn('Unable to mark inactive', error);
        }
      }
      persistSession(null, null);
    },
    [persistSession],
  );

  const updateProfile = useCallback(
    async (payload: Partial<Pick<User, 'displayName' | 'handle' | 'location'>>) => {
      if (!user) {
        throw new Error('Not authenticated');
      }
      const updatedUser = await apiClient.updateUser(user.id, payload);
      const nextUser = { ...user, ...updatedUser };
      persistSession(token, nextUser);
      return nextUser;
    },
    [persistSession, token, user],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleSessionExpired = () => {
      logout({ silent: true }).catch((error) => console.warn('Session cleanup failed', error));
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      authLoading,
      authError,
      login,
      register,
      logout,
      updateProfile,
      clearAuthError: () => setAuthError(null),
    }),
    [authError, authLoading, login, logout, register, token, updateProfile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api';
import { useAuth } from '../hooks/useAuth';
import { WorkspaceSummary } from '../types/api';

const LoginPage = () => {
  const { login, register, authLoading, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    displayName: '',
    username: '',
    handle: 'user',
    email: '',
    password: '',
    location: '',
    workspaceName: '',
  });
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspaceSuggestions, setWorkspaceSuggestions] = useState<WorkspaceSummary[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  useEffect(() => {
    if (!workspaceQuery.trim()) {
      setWorkspaceSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const fetchSuggestions = async () => {
      try {
        setWorkspaceLoading(true);
        const results = await apiClient.getWorkspaces(workspaceQuery.trim());
        if (!controller.signal.aborted) {
          setWorkspaceSuggestions(results);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Unable to fetch workspace suggestions', error);
          setWorkspaceSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setWorkspaceLoading(false);
        }
      }
    };
    const timeout = window.setTimeout(fetchSuggestions, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [workspaceQuery]);

  useEffect(() => {
    if (authError) {
      const timeout = window.setTimeout(() => clearAuthError(), 3500);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [authError, clearAuthError]);

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginForm.username.trim() || !loginForm.password) {
      return;
    }
    await login({ username: loginForm.username.trim(), password: loginForm.password });
  };

  const handleRegisterSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const form = registerForm;
    if (!form.displayName.trim() || !form.username.trim() || !form.email.trim() || !form.password) {
      return;
    }
    await register({
      displayName: form.displayName.trim(),
      handle: form.handle.trim() || 'user',
      email: form.email.trim(),
      password: form.password,
      location: form.location.trim() || undefined,
      username: form.username.trim(),
      workspaceName: form.workspaceName.trim(),
    });
  };

  const workspaceHint = useMemo(() => {
    if (workspaceLoading) return 'Searching workspaces…';
    if (workspaceSuggestions.length) {
      return `${workspaceSuggestions.length} matching workspaces available.`;
    }
    return 'Workspaces help teammates collaborate in a shared space.';
  }, [workspaceLoading, workspaceSuggestions]);

  return (
    <section className="auth">
      <article className="auth__card">
        <header>
          <h1>Mission Control</h1>
          <p>Plan projects, track tickets, and keep conversations together.</p>
        </header>

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit}>
            <label>
              Username
              <input
                type="text"
                value={loginForm.username}
                onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                required
              />
            </label>
            {authError && <p className="auth__error">{authError}</p>}
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <label>
              Display name
              <input
                type="text"
                value={registerForm.displayName}
                onChange={(event) => setRegisterForm({ ...registerForm, displayName: event.target.value })}
                required
              />
            </label>
            <label>
              Username
              <input
                type="text"
                value={registerForm.username}
                onChange={(event) => setRegisterForm({ ...registerForm, username: event.target.value })}
                required
              />
            </label>
            <label>
              Handle
              <input
                type="text"
                value={registerForm.handle}
                onChange={(event) => setRegisterForm({ ...registerForm, handle: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={registerForm.email}
                onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                required
              />
            </label>
            <label>
              Location (optional)
              <input
                type="text"
                value={registerForm.location}
                onChange={(event) => setRegisterForm({ ...registerForm, location: event.target.value })}
              />
            </label>
            <label>
              Workspace name
              <input
                type="text"
                value={registerForm.workspaceName}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegisterForm({ ...registerForm, workspaceName: value });
                  setWorkspaceQuery(value);
                }}
                required
              />
            </label>
            <small className="auth__hint">{workspaceHint}</small>
            {workspaceSuggestions.length > 0 && (
              <div className="workspace-suggestions">
                <ul>
                  {workspaceSuggestions.map((workspace) => (
                    <li key={workspace.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setRegisterForm({ ...registerForm, workspaceName: workspace.name })
                        }
                      >
                        {workspace.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {authError && <p className="auth__error">{authError}</p>}
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
        <p className="auth__hint">
          {mode === 'login' ? 'Need an account?' : 'Already have an account?'}{' '}
          <button
            type="button"
            className="link-button outline"
            onClick={() => {
              setMode((prev) => (prev === 'login' ? 'register' : 'login'));
              clearAuthError();
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </article>
    </section>
  );
};

export default LoginPage;

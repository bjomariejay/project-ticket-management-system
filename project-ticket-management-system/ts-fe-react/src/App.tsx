import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import WorkspacePage from './pages/WorkspacePage';
import './App.css';

const AppContent = () => {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('workspace-mode', isAuthenticated);
    console.log('isAuthenticated: ', isAuthenticated)
    return () => {
      root.classList.remove('workspace-mode');
    };
  }, [isAuthenticated]);
  return isAuthenticated ? <WorkspacePage /> : <LoginPage />;
};

const App = () => {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <AppContent />
      </WorkspaceProvider>
    </AuthProvider>
  );
};

export default App;

import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import WorkspacePage from './pages/WorkspacePage';
import './App.css';

const AppContent = () => {
  const { isAuthenticated } = useAuth();
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

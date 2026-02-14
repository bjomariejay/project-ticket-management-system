import { useContext } from 'react';
import { WorkspaceContext } from '../context/WorkspaceContext';

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};

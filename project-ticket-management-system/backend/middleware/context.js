const requireWorkspaceContext = (req, res) => {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ message: 'Workspace context is required' });
    return null;
  }
  return workspaceId;
};

const requireUserContext = (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(403).json({ message: 'User context is required' });
    return null;
  }
  return userId;
};

module.exports = { requireWorkspaceContext, requireUserContext };

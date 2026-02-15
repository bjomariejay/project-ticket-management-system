import type { ReactNode } from "react";
import type { WorkspaceTab } from "../../context/WorkspaceContext";

interface TabContentProps {
  activeTab: WorkspaceTab;
  dashboardView: ReactNode;
  dmView: ReactNode;
  activityView: ReactNode;
  homeView: ReactNode;
}

const TabContent = ({
  activeTab,
  dashboardView,
  dmView,
  activityView,
  homeView,
}: TabContentProps) => {
  switch (activeTab) {
    case "dashboard":
      return <>{dashboardView}</>;
    case "dms":
      return <>{dmView}</>;
    case "activity":
      return <>{activityView}</>;
    default:
      return <>{homeView}</>;
  }
};

export default TabContent;

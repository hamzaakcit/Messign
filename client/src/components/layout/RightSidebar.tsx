import { ChevronLeft } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import {
  DashboardRightSidebar,
  ChatRightSidebar,
  ProjectsRightSidebar,
  KnowledgeRightSidebar,
  AchievementsRightSidebar,
  TeamRightSidebar,
  SettingsRightSidebar,
} from './rightSidebars';

interface RightSidebarProps {
  collapsed?: boolean;
}

export function RightSidebar({ collapsed = false }: RightSidebarProps) {
  const { currentView, toggleRightSidebar } = useUIStore();

  if (collapsed) {
    return (
      <div className="h-full w-12 flex flex-col items-center justify-center border-l border-app bg-app-sidebar transition-colors duration-200">
        <button
          onClick={toggleRightSidebar}
          className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          aria-label="Expand right sidebar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    );
  }

  switch (currentView) {
    case 'dashboard':
      return <DashboardRightSidebar />;
    case 'chat':
      return <ChatRightSidebar />;
    case 'projects':
      return <ProjectsRightSidebar />;
    case 'knowledge':
      return <KnowledgeRightSidebar />;
    case 'achievements':
      return <AchievementsRightSidebar />;
    case 'team':
      return <TeamRightSidebar />;
    case 'settings':
      return <SettingsRightSidebar />;
    default:
      return <DashboardRightSidebar />;
  }
}

import { KnowledgeSidebar } from '@/components/knowledge/KnowledgeSidebar';

export function KnowledgeRightSidebar() {
  return (
    <div className="h-full bg-app-sidebar border-l border-app flex flex-col overflow-hidden transition-colors duration-200 p-4" role="complementary" aria-label="Knowledge hub sidebar">
      <KnowledgeSidebar />
    </div>
  );
}

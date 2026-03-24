import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Eye } from 'lucide-react';
import { ProgressBar } from '@/components/ui';

interface RightSidebarPreviewProps {
  activeTab: 'xp' | 'achievements';
}

export function RightSidebarPreview({ activeTab }: RightSidebarPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Live preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-app-muted mb-3">How changes will appear:</p>
        {activeTab === 'xp' ? (
          <div className="p-3 bg-app-surface-tertiary rounded-lg border border-app-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-app-text">Sample Employee</span>
              <span className="text-xs text-app-muted">L12</span>
            </div>
            <ProgressBar value={2450} max={5700} variant="xp" size="sm" />
            <p className="text-xs text-app-muted mt-1">2,450 / 5,700 MP to next level</p>
          </div>
        ) : (
          <div className="p-3 bg-app-surface-tertiary rounded-lg border border-app-border flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl">
              ✓
            </div>
            <div>
              <p className="text-sm font-medium text-app-text">Task Master</p>
              <p className="text-xs text-app-muted">Rare badge</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

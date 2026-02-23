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
        <p className="text-sm text-gray-500 mb-3">How changes will appear:</p>
        {activeTab === 'xp' ? (
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">Sample Employee</span>
              <span className="text-xs text-gray-400">L12</span>
            </div>
            <ProgressBar value={2450} max={5700} variant="xp" size="sm" />
            <p className="text-xs text-gray-500 mt-1">2,450 / 5,700 MP to next level</p>
          </div>
        ) : (
          <div className="p-3 bg-white/5 rounded-lg border border-white/10 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl">
              ✓
            </div>
            <div>
              <p className="text-sm font-medium text-white">Task Master</p>
              <p className="text-xs text-gray-500">Rare badge</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

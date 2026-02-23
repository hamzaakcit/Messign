import { useState, useMemo } from 'react';
import { Trophy, Zap, Award } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { calculateLevel } from '@/types';
import { XPSettingsCard } from '@/admin/components/XPSettingsCard';
import { LevelProgressionCard } from '@/admin/components/LevelProgressionCard';
import { XPEventsTable } from '@/admin/components/XPEventsTable';
import { BulkXPPanel } from '@/admin/components/BulkXPPanel';
import { RightSidebarPreview } from '@/admin/components/RightSidebarPreview';
import { RightSidebarInsights } from '@/admin/components/RightSidebarInsights';
import { RightSidebarActivity } from '@/admin/components/RightSidebarActivity';
import type { Employee } from '@/admin/types';

export function XPAchievements() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [activeTab, setActiveTab] = useState('xp');

  const { data: settings, refetch: refetchSettings } = useQuery(
    ['settings', userId],
    () =>
      adminAPI.settings.get(userId) as Promise<{
        xp?: {
          globalMultiplier?: number;
          leaderboardEnabled?: boolean;
          levelUpNotifications?: boolean;
          xpDecayEnabled?: boolean;
          xpDecayAfterDays?: number;
        };
      }>,
    { enabled: !!userId }
  );

  const xpSettings = settings && typeof settings === 'object' && settings.xp ? settings.xp : {};

  const { data: employeesData } = useQuery(
    ['employees', userId],
    () => adminAPI.employees.getAll(userId) as Promise<Employee[]>,
    { enabled: !!userId }
  );
  const employees = useMemo(() => (Array.isArray(employeesData) ? employeesData : []) as Employee[], [employeesData]);
  const lowLevelCount = useMemo(
    () => employees.filter((e) => calculateLevel(typeof e.xp === 'number' ? e.xp : 0).level <= 3).length,
    [employees]
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-app mb-6">MP & Achievements</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column ~60% */}
        <div className="flex-[6] min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="xp" className="space-y-6">
            <TabsList className="flex gap-1">
              <TabsTrigger value="xp" className="gap-2">
                <Zap className="w-4 h-4" />
                XP Management
              </TabsTrigger>
              <TabsTrigger value="achievements" className="gap-2">
                <Trophy className="w-4 h-4" />
                Achievement Management
              </TabsTrigger>
            </TabsList>

            <TabsContent value="xp" className="mt-0 space-y-6">
              <XPSettingsCard
                userId={userId}
                initialSettings={{
                  globalMultiplier: xpSettings.globalMultiplier ?? 1,
                  leaderboardEnabled: xpSettings.leaderboardEnabled ?? true,
                  levelUpNotifications: xpSettings.levelUpNotifications ?? true,
                  xpDecayEnabled: xpSettings.xpDecayEnabled ?? false,
                  xpDecayAfterDays: xpSettings.xpDecayAfterDays ?? 30,
                }}
                onSaved={refetchSettings}
              />
              <LevelProgressionCard />
              <XPEventsTable />
              <BulkXPPanel />
            </TabsContent>

            <TabsContent value="achievements" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Achievement Badges</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">
                    Create and manage badges. Award badges to employees from the Employee detail panel.
                  </p>
                  <Button variant="secondary" className="gap-2">
                    <Award className="w-4 h-4" />
                    Create badge
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Badge Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted">Charts and stats for badge distribution. (Placeholder.)</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column ~40% */}
        <div className="flex-[4] min-w-0 space-y-4 lg:max-w-sm">
          <RightSidebarPreview activeTab={activeTab === 'xp' ? 'xp' : 'achievements'} />
          <RightSidebarInsights totalEmployees={employees.length} lowLevelCount={lowLevelCount} />
          <RightSidebarActivity userId={userId} />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api';

export interface XPSettingsForm {
  globalMultiplier: number;
  leaderboardEnabled: boolean;
  levelUpNotifications: boolean;
  xpDecayEnabled: boolean;
  xpDecayAfterDays: number;
}

const DEFAULT_XP: XPSettingsForm = {
  globalMultiplier: 1,
  leaderboardEnabled: true,
  levelUpNotifications: true,
  xpDecayEnabled: false,
  xpDecayAfterDays: 30,
};

interface XPSettingsCardProps {
  userId: string;
  initialSettings: Partial<XPSettingsForm>;
  onSaved?: () => void;
}

export function XPSettingsCard({ userId, initialSettings, onSaved }: XPSettingsCardProps) {
  const [form, setForm] = useState<XPSettingsForm>({
    ...DEFAULT_XP,
    ...initialSettings,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm((prev) => ({ ...prev, ...initialSettings }));
  }, [initialSettings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await adminAPI.settings.update(userId, {
        xp: {
          globalMultiplier: form.globalMultiplier,
          leaderboardEnabled: form.leaderboardEnabled,
          levelUpNotifications: form.levelUpNotifications,
          xpDecayEnabled: form.xpDecayEnabled,
          xpDecayAfterDays: form.xpDecayAfterDays,
        },
      });
      toast.success('MP settings saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_XP);
    toast.info('Reset to defaults (click Save to apply)');
  };

  const estimatedDaily = Math.round(2450 * form.globalMultiplier);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Global MP Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-app-muted">Global multiplier</label>
            <span className="text-app font-medium">{form.globalMultiplier}x</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={form.globalMultiplier}
            onChange={(e) => setForm((p) => ({ ...p, globalMultiplier: Number(e.target.value) }))}
            className="w-full h-2 rounded-lg appearance-none bg-white/10 accent-primary-500"
            aria-label="Global MP multiplier"
          />
          <div className="flex justify-between text-xs text-app-muted mt-1">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>3.0x</span>
          </div>
        </div>

        <p className="text-sm text-app-muted">
          Current impact: +0 MP per action (multiplier applies when MP is awarded). Estimated daily MP increase: +{estimatedDaily} MP.
        </p>

        <div className="space-y-3">
          <ToggleRow
            label="Leaderboard enabled"
            checked={form.leaderboardEnabled}
            onChange={(v) => setForm((p) => ({ ...p, leaderboardEnabled: v }))}
          />
          <ToggleRow
            label="Level-up notifications"
            checked={form.levelUpNotifications}
            onChange={(v) => setForm((p) => ({ ...p, levelUpNotifications: v }))}
          />
          <ToggleRow
            label="MP decay for inactivity"
            checked={form.xpDecayEnabled}
            onChange={(v) => setForm((p) => ({ ...p, xpDecayEnabled: v }))}
          />
          {form.xpDecayEnabled && (
            <div className="pl-4 border-l-2 border-white/10">
              <label className="text-sm text-app-muted block mb-1">Decay after (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.xpDecayAfterDays}
                onChange={(e) => setForm((p) => ({ ...p, xpDecayAfterDays: Number(e.target.value) || 30 }))}
                className="input-theme w-24"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleReset}>
            Reset to default
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-app-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-primary-500' : 'bg-white/20'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
            checked ? 'left-[26px]' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

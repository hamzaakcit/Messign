import { useState } from 'react';
import { BarChart3, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';

const quickReports = [
  { id: 'perf', title: 'Employee Performance', description: 'MP and activity by employee' },
  { id: 'dept', title: 'Department Analytics', description: 'Department-level metrics' },
  { id: 'xp', title: 'MP Trends', description: 'MP over time' },
  { id: 'badges', title: 'Badge Distribution', description: 'Badge earners and types' },
];

export function Analytics() {
  const [reportStep, setReportStep] = useState(1);
  const [reportType, setReportType] = useState('');
  const [dataPoints, setDataPoints] = useState<string[]>([]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-app mb-6">Analytics & Reports</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quickReports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReportType(r.id)}
                    className="bg-app-card p-4 rounded-xl border border-app-border text-left hover:bg-app-surface-tertiary transition-colors"
                  >
                    <BarChart3 className="w-8 h-8 text-primary-400 mb-2" />
                    <p className="font-semibold text-app">{r.title}</p>
                    <p className="text-sm text-app-muted">{r.description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Report Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-app-muted">
                Build a custom report: choose type, data points, filters, grouping, and output.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-app-muted">Step {reportStep} of 5</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReportStep(s)}
                      className={`w-2 h-2 rounded-full ${s === reportStep ? 'bg-primary-500' : 'bg-app-surface-tertiary'}`}
                      aria-label={`Step ${s}`}
                    />
                  ))}
                </div>
              </div>
              {reportStep === 1 && (
                <div>
                  <label className="block text-sm font-medium text-app mb-2">Report type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="input-theme w-full max-w-xs"
                  >
                    <option value="">Select type</option>
                    <option value="employees">Employees</option>
                    <option value="departments">Departments</option>
                    <option value="xp">MP</option>
                  </select>
                </div>
              )}
              {reportStep === 2 && (
                <div>
                  <label className="block text-sm font-medium text-app mb-2">Data points</label>
                  <div className="flex flex-wrap gap-2">
                    {['Name', 'Department', 'MP', 'Level', 'Join date'].map((dp) => (
                      <label key={dp} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={dataPoints.includes(dp)}
                          onChange={(e) =>
                            setDataPoints((prev) =>
                              e.target.checked ? [...prev, dp] : prev.filter((x) => x !== dp)
                            )
                          }
                        />
                        {dp}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {reportStep >= 3 && (
                <p className="text-sm text-app-muted">
                  Filters, grouping, visualization, and output options (placeholder).
                </p>
              )}
              <Button variant="primary" className="gap-2">
                <FileText className="w-4 h-4" />
                Generate report
              </Button>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Saved Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-app-muted mb-4">No saved reports yet.</p>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-app-muted">No scheduled reports.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

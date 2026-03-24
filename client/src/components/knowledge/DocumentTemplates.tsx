import {
  FileText,
  Cpu,
  ClipboardList,
  BookOpen,
  HelpCircle,
  File,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  defaultContent: string;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Record meeting agendas and decisions',
    icon: FileText,
    defaultContent: `<h1>Meeting Notes</h1>
<h2>Meeting Info</h2>
<ul>
<li><strong>Date:</strong> </li>
<li><strong>Attendees:</strong> </li>
<li><strong>Duration:</strong> </li>
</ul>
<h2>Agenda</h2>
<ol>
<li></li>
</ol>
<h2>Discussion Notes</h2>
<p></p>
<h2>Decisions</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"></li>
</ul>
<h2>Action Items</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"></li>
</ul>`,
  },
  {
    id: 'tech-spec',
    name: 'Technical Specification',
    description: 'Document technical details and architecture decisions',
    icon: Cpu,
    defaultContent: `<h1>Technical Specification</h1>
<h2>Summary</h2>
<p></p>
<h2>Motivation</h2>
<p></p>
<h2>Technical Design</h2>
<h3>Architecture</h3>
<p></p>
<h3>API Definitions</h3>
<pre><code class="language-typescript">// Write API definitions here</code></pre>
<h3>Database Changes</h3>
<p></p>
<h2>Security Assessment</h2>
<p></p>
<h2>Test Plan</h2>
<p></p>
<h2>Deployment Plan</h2>
<p></p>`,
  },
  {
    id: 'sop',
    name: 'SOP (Procedure)',
    description: 'Create a standard operating procedure',
    icon: ClipboardList,
    defaultContent: `<h1>Standard Operating Procedure</h1>
<h2>Purpose</h2>
<p></p>
<h2>Scope</h2>
<p></p>
<h2>Responsibilities</h2>
<ul>
<li></li>
</ul>
<h2>Procedure Steps</h2>
<ol>
<li><strong>Step 1:</strong> </li>
<li><strong>Step 2:</strong> </li>
<li><strong>Step 3:</strong> </li>
</ol>
<h2>References</h2>
<p></p>
<h2>Revision History</h2>
<table>
<tr><th>Version</th><th>Date</th><th>Change</th></tr>
<tr><td>1.0</td><td></td><td>Initial release</td></tr>
</table>`,
  },
  {
    id: 'guide',
    name: 'Guide',
    description: 'Write step-by-step guides and tutorials',
    icon: BookOpen,
    defaultContent: `<h1>Guide Title</h1>
<h2>Introduction</h2>
<p>This guide covers...</p>
<h2>Prerequisites</h2>
<ul>
<li></li>
</ul>
<h2>Step 1: Getting Started</h2>
<p></p>
<h2>Step 2: Configuration</h2>
<p></p>
<h2>Step 3: Implementation</h2>
<p></p>
<h2>Troubleshooting</h2>
<p></p>
<h2>Next Steps</h2>
<p></p>`,
  },
  {
    id: 'faq',
    name: 'FAQ',
    description: 'Frequently asked questions document',
    icon: HelpCircle,
    defaultContent: `<h1>Frequently Asked Questions</h1>
<h2>General Questions</h2>
<h3>Question 1?</h3>
<p>Answer...</p>
<h3>Question 2?</h3>
<p>Answer...</p>
<h2>Technical Questions</h2>
<h3>Question 1?</h3>
<p>Answer...</p>
<h3>Question 2?</h3>
<p>Answer...</p>`,
  },
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Start from scratch',
    icon: File,
    defaultContent: '<p></p>',
  },
];

interface DocumentTemplatesProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: DocumentTemplate) => void;
}

export function DocumentTemplates({
  open,
  onClose,
  onSelect,
}: DocumentTemplatesProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl border border-app-border bg-app-sidebar shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-app-border">
          <div>
            <h2 className="text-lg font-semibold text-app-text">
              Choose a Template
            </h2>
            <p className="text-sm text-app-muted mt-1">
              Pick a starting template for your document
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-app-hover text-app-muted hover:text-app-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DOCUMENT_TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className={cn(
                    'flex flex-col items-center gap-3 p-5 rounded-xl border border-app-border',
                    'bg-app-bg hover:bg-app-hover hover:border-primary-500/50',
                    'transition-all text-center group',
                  )}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/20 transition-colors">
                    <Icon className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-app-text">
                      {template.name}
                    </p>
                    <p className="text-xs text-app-muted mt-1">
                      {template.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

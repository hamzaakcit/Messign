import { helpEntry } from '@/lib/helpContent';
import { useHelpDrawer } from '@/stores/helpDrawerStore';
import { SlideOverPanel } from './SlideOverPanel';

/** The side drawer behind "Learn more" in an InfoTooltip. Mount once per page. */
export function HelpDrawer(): JSX.Element {
  const openId = useHelpDrawer((s) => s.openId);
  const close = useHelpDrawer((s) => s.close);
  const entry = openId ? helpEntry(openId) : null;

  return (
    <SlideOverPanel isOpen={Boolean(entry)} onClose={close} title={entry?.title ?? ''} width={420}>
      {entry ? (
        <div className="space-y-3 px-6 py-5 text-sm leading-relaxed text-app-text" data-testid="help-drawer">
          {(entry.body ?? entry.tip).split('\n\n').map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
      ) : null}
    </SlideOverPanel>
  );
}

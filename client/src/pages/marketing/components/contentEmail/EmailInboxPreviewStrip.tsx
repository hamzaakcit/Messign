import {
  truncateInboxLine,
  TYPICAL_PREHEADER_MAX,
  TYPICAL_SUBJECT_MAX,
  evaluateInboxCopy,
  RECOMMENDED_PREHEADER_MIN_CHARS,
} from '../../lib/emailInboxPreview';

/**
 * Approximate how subject + preheader may appear in mobile inbox lists, with character budgets.
 */
export function EmailInboxPreviewStrip({
  subject,
  preheader,
}: {
  subject: string;
  preheader: string;
}) {
  const sub = truncateInboxLine(subject, TYPICAL_SUBJECT_MAX);
  const pre = truncateInboxLine(preheader, TYPICAL_PREHEADER_MAX);
  const evalCopy = evaluateInboxCopy(subject, preheader);

  return (
    <div className="rounded-lg border border-app-border bg-app-surface-tertiary/80 px-3 py-2 text-[11px] text-app-muted">
      <div className="text-[10px] uppercase tracking-wide text-app-muted mb-1">Inbox preview (approx.)</div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-app-text font-medium truncate min-w-0 flex-1" title={subject}>
          {sub.display}
        </div>
        <span
          className={`shrink-0 text-[10px] tabular-nums ${
            evalCopy.subjectOverRecommended ? 'text-amber-600 dark:text-amber-400' : 'text-app-muted'
          }`}
        >
          {evalCopy.subjectLength}/{TYPICAL_SUBJECT_MAX}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <div className="text-app-muted truncate min-w-0 flex-1" title={preheader}>
          {pre.display}
        </div>
        <span
          className={`shrink-0 text-[10px] tabular-nums ${
            evalCopy.preheaderUnderRecommended || evalCopy.preheaderOverSoftMax
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-app-muted'
          }`}
        >
          {evalCopy.preheaderLength}/{RECOMMENDED_PREHEADER_MIN_CHARS}+
        </span>
      </div>
      {sub.truncated || pre.truncated ? (
        <div className="text-amber-600/90 dark:text-amber-400/90 text-[10px] mt-1">
          Long lines may be cut off in some clients — tighten copy if needed.
        </div>
      ) : null}
      {evalCopy.warnings.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-500 dark:text-slate-400 list-disc pl-4">
          {evalCopy.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

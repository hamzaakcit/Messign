import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiIssues, listMetaTemplates, type Issue, type MetaTemplate, type WhatsappContent, type WhatsappContentInput, type WhatsappVariable } from './builderApi';
import { Button, ErrorLine, Field, Issues, Select, TextInput, inputClass } from './ui';

/**
 * Registering how a WhatsApp template approved by Meta is filled (WP-40b over the WP-40a API). The text itself is written and
 * approved in WhatsApp Manager; here the admin picks it from what Meta lists (or types it), and says where each numbered value
 * comes from. The preview fills the values with their names, the way the message will be filled with the customer's own values.
 */

type Source = WhatsappVariable['source'];
interface Row { source: Source; name: string; defaultValue: string }
const SOURCES: ReadonlyArray<{ value: Source; label: string }> = [
  { value: 'attribute', label: 'Customer field' }, { value: 'payload', label: 'Trigger value' }, { value: 'system', label: 'Sender name (Settings)' },
];
const emptyRow = (): Row => ({ source: 'attribute', name: '', defaultValue: '' });
const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;
/** How many numbered variables a text uses ({{1}} to {{n}}). */
export const variableCount = (text: string): number => Math.max(0, ...[...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1])));

const rowOf = (v: Omit<WhatsappVariable, 'position'> | null | undefined): Row => (v ? { source: v.source, name: v.name, defaultValue: v.defaultValue ?? '' } : emptyRow());
const toVariable = (r: Row) => ({ source: r.source, name: r.source === 'system' ? 'sender_name' : r.name.trim(), defaultValue: r.source === 'system' || !r.defaultValue.trim() ? null : r.defaultValue.trim() });
const label = (r: Row) => (r.source === 'system' ? 'sender_name' : r.name.trim() || '…');

function VariableRow({ row, onChange, title, testId }: { row: Row; onChange: (r: Row) => void; title: string; testId: string }): JSX.Element {
  return (
    <div className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_1fr] sm:items-end" data-testid={testId}>
      <span className="text-sm font-mono text-app">{title}</span>
      <Select value={row.source} onChange={(source) => onChange({ ...row, source })} options={SOURCES} ariaLabel={`${title} source`} />
      {row.source === 'system'
        ? <span className="text-xs text-app-muted">the sender name from Settings</span>
        : <TextInput value={row.name} onChange={(name) => onChange({ ...row, name })} placeholder={row.source === 'payload' ? 'cart_id' : 'first_name'} ariaLabel={`${title} field`} mono />}
      {row.source === 'system'
        ? <span />
        : <TextInput value={row.defaultValue} onChange={(defaultValue) => onChange({ ...row, defaultValue })} placeholder="if missing (optional)" ariaLabel={`${title} default`} />}
    </div>
  );
}

export function WhatsappTemplateForm({ initial, saveLabel, onSave }: {
  initial?: WhatsappContent; saveLabel: string; onSave: (content: WhatsappContentInput) => Promise<void>;
}): JSX.Element {
  const meta = useQuery({ queryKey: ['engage', 'whatsapp', 'templates'], queryFn: listMetaTemplates });
  const [metaName, setMetaName] = useState(initial?.metaName ?? '');
  const [language, setLanguage] = useState(initial?.language ?? 'tr');
  const [category, setCategory] = useState<'marketing' | 'utility'>(initial?.declaredCategory ?? 'marketing');
  const [optOut, setOptOut] = useState<WhatsappContent['optOut']>(initial?.optOut ?? 'quick_reply');
  const [body, setBody] = useState(initial?.bodyText ?? '');
  const [rows, setRows] = useState<Row[]>((initial?.variables ?? []).map(rowOf));
  const [headerText, setHeaderText] = useState(initial?.header?.text ?? '');
  const [headerRow, setHeaderRow] = useState<Row>(rowOf(initial?.header?.variable));
  const [buttonBase, setButtonBase] = useState(initial?.urlButton?.baseUrl ?? '');
  const [buttonIndex, setButtonIndex] = useState<'0' | '1'>(initial?.urlButton?.index === 1 ? '1' : '0');
  const [buttonRow, setButtonRow] = useState<Row>(rowOf(initial?.urlButton?.variable));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // One row per numbered variable in the body, kept in step with the text.
  const count = variableCount(body);
  const shown = useMemo(() => Array.from({ length: count }, (_v, i) => rows[i] ?? emptyRow()), [count, rows]);
  const headerHasVariable = variableCount(headerText) > 0;

  const fromMeta = (key: string) => {
    const t = (meta.data?.templates ?? []).find((x) => `${x.metaName}|${x.language}` === key);
    if (!t) return;
    setMetaName(t.metaName); setLanguage(t.language);
    if (t.category === 'MARKETING' || t.category === 'UTILITY') setCategory(t.category === 'MARKETING' ? 'marketing' : 'utility');
    if (t.shape.bodyText) setBody(t.shape.bodyText);
    setHeaderText(t.shape.headerFormat === 'TEXT' && t.shape.headerText ? t.shape.headerText : '');
    setOptOut((t.shape.buttons ?? []).includes('QUICK_REPLY') ? 'quick_reply' : 'text_in_body');
  };
  const atMeta: MetaTemplate[] = (meta.data?.templates ?? []).filter((t) => t.status !== 'DELETED');

  const preview = body.replace(PLACEHOLDER, (_m, n: string) => `[${label(shown[Number(n) - 1] ?? emptyRow())}]`);
  const save = async () => {
    setBusy(true); setIssues([]); setError(null);
    try {
      await onSave({
        metaName: metaName.trim(), language: language.trim(), declaredCategory: category, optOut, bodyText: body,
        variables: shown.map(toVariable),
        header: headerText.trim() ? { text: headerText, variable: headerHasVariable ? toVariable(headerRow) : null } : null,
        urlButton: buttonBase.trim() ? { index: buttonIndex === '1' ? 1 : 0, baseUrl: buttonBase.trim(), variable: toVariable(buttonRow) } : null,
      });
    } catch (err) {
      if (err instanceof ApiIssues && err.issues.length) setIssues(err.issues); else setError(err);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3" data-testid="whatsapp-template-form">
      <Field label="Template at Meta" hint={meta.data?.check.lastOkAt ? 'as Meta listed them at the last check' : 'no check has run yet: run it in Settings, or type the template below'}>
        <Select value="" onChange={fromMeta} ariaLabel="Template at Meta" testId="whatsapp-from-meta"
          options={[{ value: '', label: atMeta.length ? 'Fill in from a template at Meta…' : 'No templates seen at Meta yet' },
            ...atMeta.map((t) => ({ value: `${t.metaName}|${t.language}`, label: `${t.metaName} (${t.language}) · ${t.status.toLowerCase()}` }))]} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name at Meta" hint="lower-case letters, digits, underscores"><TextInput value={metaName} onChange={setMetaName} placeholder="cart_reminder" ariaLabel="Name at Meta" mono /></Field>
        <Field label="Language" hint="as in WhatsApp Manager: tr, en_US"><TextInput value={language} onChange={setLanguage} ariaLabel="Language" mono /></Field>
        <Field label="Category">
          <Select value={category} onChange={setCategory} ariaLabel="Category" options={[{ value: 'marketing', label: 'Marketing' }, { value: 'utility', label: 'Utility' }]} />
        </Field>
        <Field label="How a customer stops" hint="marketing needs one">
          <Select value={optOut} onChange={setOptOut} ariaLabel="How a customer stops"
            options={[{ value: 'quick_reply', label: 'A quick-reply button (Stop)' }, { value: 'text_in_body', label: 'The text says how' }, { value: 'none', label: 'Not stated' }]} />
        </Field>
      </div>
      <Field label="Body, exactly as approved" hint="{{1}}, {{2}} … are the values filled for each customer">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} aria-label="Body" className={`${inputClass} text-sm`} data-testid="whatsapp-body" />
      </Field>
      {count > 0 && (
        <div className="space-y-2 rounded-md border border-app p-3">
          <p className="text-xs text-app-muted">Where each value comes from: a customer field (for example first_name), a value of the trigger (for example cart_id, in a journey), or the sender name.</p>
          {shown.map((r, i) => (
            <VariableRow key={i} row={r} title={`{{${i + 1}}}`} testId={`whatsapp-variable-${i + 1}`}
              onChange={(n) => setRows(shown.map((x, j) => (j === i ? n : x)))} />
          ))}
        </div>
      )}
      <details className="rounded-md border border-app p-3" open={Boolean(headerText || buttonBase)}>
        <summary className="cursor-pointer text-sm text-app">Header and link button (optional)</summary>
        <div className="mt-3 space-y-3">
          <Field label="Text header, as approved" hint="at most one value, {{1}}"><TextInput value={headerText} onChange={setHeaderText} ariaLabel="Header text" /></Field>
          {headerHasVariable && <VariableRow row={headerRow} onChange={setHeaderRow} title="header {{1}}" testId="whatsapp-header-variable" />}
          <Field label="Link button: the URL before the value" hint="https only; the value is added to the end, encoded"><TextInput value={buttonBase} onChange={setButtonBase} placeholder="https://shop.example.com/cart/" ariaLabel="Button URL" mono /></Field>
          {buttonBase.trim() && <>
            <Field label="Which link button"><Select value={buttonIndex} onChange={setButtonIndex} ariaLabel="Button index" options={[{ value: '0', label: 'The first button' }, { value: '1', label: 'The second button' }]} /></Field>
            <VariableRow row={buttonRow} onChange={setButtonRow} title="link value" testId="whatsapp-button-variable" />
          </>}
        </div>
      </details>
      {body.trim() && (
        <div className="rounded-md bg-app-muted/10 p-3 text-sm text-app" data-testid="whatsapp-preview">
          {headerText.trim() && <p className="font-semibold">{headerText.replace(PLACEHOLDER, `[${label(headerRow)}]`)}</p>}
          <p className="whitespace-pre-wrap">{preview}</p>
          {buttonBase.trim() && <p className="mt-1 font-mono text-xs text-app-muted">{buttonBase.trim()}[{label(buttonRow)}]</p>}
        </div>
      )}
      <Issues issues={issues} />
      <ErrorLine error={error} />
      <Button kind="primary" onClick={() => void save()} disabled={busy || !metaName.trim() || !body.trim()} testId="save-whatsapp-template">{saveLabel}</Button>
    </div>
  );
}

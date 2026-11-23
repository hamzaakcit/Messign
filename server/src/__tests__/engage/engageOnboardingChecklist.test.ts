/**
 * WP-33: the onboarding kit cannot drift from the code. The readiness table of docs/onboarding/onboarding-checklist.md is compared with
 * REQUIRED_READINESS (the items the send gate enforces in live mode), item by item and channel by channel; every file the kit
 * points to exists; the CSV templates go through the real parsers without a single problem.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { REQUIRED_READINESS } from '../../engage/messaging/gate.js';
import { parseCsv } from '../../engage/import/csv.js';
import { tableBetween } from './helpers/docTable.js';
import { ErrorSink, parseOrderRows, parseProfileRows } from '../../engage/import/importers.js';

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs');
const ONBOARDING = join(DOCS, 'onboarding');
const read = (p: string): string => readFileSync(p, 'utf8');

describe('onboarding checklist and the send gate (WP-33)', () => {
  const doc = read(join(ONBOARDING, 'onboarding-checklist.md'));

  it('lists exactly the readiness items the gate requires, per channel, once each', () => {
    const rows = tableBetween(doc, 'readiness-items');
    const documented = rows.map((r) => `${r[0]}.${r[1]}`).sort();
    const required = Object.entries(REQUIRED_READINESS).flatMap(([channel, items]) => items.map((i) => `${channel}.${i}`)).sort();
    expect(documented).toEqual(required);
    expect(new Set(documented).size).toBe(documented.length);
  });

  it('says for every readiness item who provides it, what to record and where it comes from', () => {
    for (const r of tableBetween(doc, 'readiness-items')) {
      expect(r.length, r.join('|')).toBe(5);
      for (const cell of r) expect(cell.length, r.join('|')).toBeGreaterThan(2);
    }
  });

  it('every setup code has a meaning, a fix and a who', () => {
    const rows = tableBetween(doc, 'setup-codes');
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      expect(r.length, r.join('|')).toBe(4);
      expect(r[0]).toMatch(/^[a-z_]+$/);
      for (const cell of r) expect(cell.length, r.join('|')).toBeGreaterThan(2);
    }
  });

  it('makes no compliance claim and marks the legal items for confirmation', () => {
    const kit = ['README.md', 'tenant-agreements.md', 'onboarding-checklist.md', 'sms-baslik-iys.md', 'whatsapp-waba.md', 'dns-and-email.md', 'demo-script.md']
      .map((f) => read(join(ONBOARDING, f))).join('\n');
    expect(kit).not.toMatch(/\b(is|are|be|being) (fully )?(KVKK|GDPR|ISO|SOC ?2)[- ]compliant/i);
    expect(kit).not.toMatch(/guarantee[sd]? compliance/i);
    expect(kit).toContain('[LC]');
    expect(doc).toContain('does not say that a tenant meets any law');
  });

  it('every file the kit README and the checklist link to exists', () => {
    for (const f of ['README.md', 'onboarding-checklist.md']) {
      const text = read(join(ONBOARDING, f));
      for (const m of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        const target = m[1]!;
        if (/^https?:/.test(target)) continue;
        expect(existsSync(resolve(ONBOARDING, target)), `${f} -> ${target}`).toBe(true);
      }
    }
    for (const f of ['../runbooks/pilot-runbook.md', '../quality/kill-switch-drill-wp33.md']) expect(existsSync(resolve(ONBOARDING, f)), f).toBe(true);
  });
});

describe('CSV templates go through the real importer parsers without problems', () => {
  const csv = (f: string): string => read(join(ONBOARDING, 'csv-templates', f));

  it('customers.csv and consents.csv: every row is read, none rejected, no problems reported', () => {
    for (const f of ['customers.csv', 'consents.csv']) {
      const table = parseCsv(csv(f));
      const sink = new ErrorSink();
      const rows = parseProfileRows(table, sink);
      expect(sink.errors, f).toEqual([]);
      expect(rows.length, f).toBe(table.rows.length);
    }
  });

  it('consents.csv: each grant carries a date and an evidence reference, so it would be recorded', () => {
    const rows = parseProfileRows(parseCsv(csv('consents.csv')), new ErrorSink());
    const grants = rows.flatMap((r) => [...r.consents.values()].filter((c) => c.status === 'granted'));
    expect(grants.length).toBeGreaterThanOrEqual(4);
    for (const g of grants) expect(Object.keys(g.evidence).length).toBeGreaterThan(0);
  });

  it('orders.csv: every row is read; the only problem allowed is a date that has aged out of the 13-month window', () => {
    const table = parseCsv(csv('orders.csv'));
    const sink = new ErrorSink();
    const rows = parseOrderRows(table, sink);
    expect(sink.errors.filter((e) => e.code !== 'date_too_old')).toEqual([]);
    expect(rows.length + sink.errors.length).toBe(table.rows.length);
  });

  it('the templates use only example addresses and the unassigned test phone range', () => {
    for (const f of ['customers.csv', 'consents.csv', 'orders.csv']) {
      const text = csv(f);
      for (const m of text.matchAll(/[\w.+-]+@([\w.-]+)/g)) expect(m[1], f).toMatch(/^example\.(com|org|net)$/);
      for (const m of text.matchAll(/(\+90 ?|0)(5\d\d)[ \d]+/g)) expect(m[2], f).toBe('500');
    }
  });
});

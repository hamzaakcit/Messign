/** What the email domain check's result codes mean, in words for the admin (WP-39). Codes are the server's. */

export function spfText(code: string): string {
  switch (code) {
    case 'found': return 'SPF record found.';
    case 'spf_missing': return 'No SPF record at the domain. Publish a TXT record that starts with v=spf1 (your email provider shows the exact value).';
    case 'spf_multiple': return 'More than one SPF record. A domain may have only one; merge them into one.';
    case 'lookup_failed': return 'The DNS lookup did not complete. Try again in a moment.';
    default: return 'Not found.';
  }
}

export function dkimText(code: string, selector: string): string {
  switch (code) {
    case 'found': return 'DKIM record found.';
    case 'dkim_missing': return `No DKIM record for the selector ${selector}. Your email provider shows the records to publish.`;
    case 'dkim_selectors_not_set': return 'Name at least one DKIM selector above. Without one, the domain cannot be checked.';
    case 'lookup_failed': return 'The DNS lookup did not complete. Try again in a moment.';
    default: return 'Not found.';
  }
}

export function dmarcText(code: string, policy?: string): string {
  switch (code) {
    case 'found': return `DMARC record found${policy ? ` (policy: ${policy})` : ''}.`;
    case 'dmarc_missing': return 'No DMARC record. Publish a TXT record at _dmarc, for example v=DMARC1; p=none.';
    case 'dmarc_multiple': return 'More than one DMARC record. A domain may have only one.';
    case 'dmarc_invalid': return 'The DMARC record has no valid policy (p=none, p=quarantine or p=reject).';
    case 'lookup_failed': return 'The DNS lookup did not complete. Try again in a moment.';
    default: return 'Not found.';
  }
}

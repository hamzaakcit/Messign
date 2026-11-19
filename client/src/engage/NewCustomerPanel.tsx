import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCustomer } from './customersApi';
import { Button, ErrorLine, Field, TextInput } from './ui';

/**
 * Add one customer by hand (admins, Customers page). Email consent needs a note of where the customer agreed: the
 * server keeps it as the evidence and refuses consent without it, so the form asks for it first.
 */
export function NewCustomerPanel({ onSaved }: { onSaved: (id: string) => void }): JSX.Element {
  const qc = useQueryClient();
  const [externalId, setExternalId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => createCustomer({
      external_id: externalId.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      email_consent: consent,
      consent_note: consent ? note.trim() : null,
    }),
    onSuccess: async (profile) => {
      await qc.invalidateQueries({ queryKey: ['engage', 'customers'] });
      onSaved(profile.id);
    },
  });

  const consentNeedsEmail = consent && !email.trim();
  const consentNeedsNote = consent && !note.trim();
  const canSave = externalId.trim().length > 0 && !consentNeedsEmail && !consentNeedsNote && !save.isPending;

  return (
    <div data-testid="new-customer-panel">
      <p className="mb-3 text-sm text-app-muted">Add a customer you already have. The customer ID is the one your store uses, so the same customer is not added twice.</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Customer ID" hint="from your store or system">
          <TextInput value={externalId} onChange={setExternalId} placeholder="kitap-1001" ariaLabel="Customer ID" testId="customer-external-id" mono />
        </Field>
        <Field label="Email">
          <TextInput value={email} onChange={setEmail} placeholder="name@example.com" ariaLabel="Email" testId="customer-email" />
        </Field>
        <Field label="Phone" hint="optional">
          <TextInput value={phone} onChange={setPhone} placeholder="+90 5xx xxx xx xx" ariaLabel="Phone" testId="customer-phone" />
        </Field>
      </div>

      <label className="mb-3 flex items-start gap-2 text-sm text-app">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          data-testid="customer-email-consent"
          className="mt-0.5"
        />
        <span>This customer agreed to receive marketing email.</span>
      </label>
      {consent && (
        <Field label="Where they agreed" hint="for example a paper form, a date or a reference. It is kept with the customer as the evidence.">
          <TextInput value={note} onChange={setNote} placeholder="Paper form, 12 March" ariaLabel="Where they agreed" testId="customer-consent-note" />
        </Field>
      )}
      {consentNeedsEmail && <p className="mt-2 text-sm text-amber-700">Enter the customer's email address to record their consent.</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <ErrorLine error={save.error} />
        <Button kind="primary" onClick={() => save.mutate()} disabled={!canSave} testId="save-customer">
          {save.isPending ? 'Adding…' : 'Add customer'}
        </Button>
      </div>
    </div>
  );
}

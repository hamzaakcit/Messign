/**
 * Email blast / sequence — stub Resend/SendGrid; production: template + audience list from workspace settings.
 */
import type { AdapterPublishSuccess, CalendarRecordForPublish, ContentPayloadForPublish } from '../types.js';
import { withTransientRetry, errorFromResponse } from '../adapterUtils.js';

export interface EmailAdapterInput {
  calendar: CalendarRecordForPublish;
  content: ContentPayloadForPublish;
}

export async function publishEmailCampaign(input: EmailAdapterInput): Promise<AdapterPublishSuccess> {
  const subject = input.content.title;
  const html = input.content.body_html ?? `<p>${escapeHtml(input.content.body ?? '')}</p>`;

  return withTransientRetry(async () => {
    const apiKey = process.env.RESEND_API_KEY ?? process.env.SENDGRID_API_KEY;

    if (apiKey && process.env.EMAIL_FORCE_REAL === '1') {
      const provider = process.env.RESEND_API_KEY ? 'resend' : 'sendgrid';
      const res = await fetch(provider === 'resend' ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: provider === 'resend' ? `Bearer ${apiKey}` : `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          provider === 'resend'
            ? {
                from: process.env.MARKETING_EMAIL_FROM ?? 'marketing@example.com',
                to: [process.env.MARKETING_EMAIL_TEST_TO ?? 'test@example.com'],
                subject,
                html,
              }
            : { personalizations: [{ to: [{ email: process.env.MARKETING_EMAIL_TEST_TO ?? 'test@example.com' }] }], subject, content: [{ type: 'text/html', value: html }] },
        ),
      });
      if (!res.ok) {
        const t = await res.text();
        throw errorFromResponse(res, t);
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return {
        publishedUrl: `email:${json.id ?? input.calendar.id}`,
        externalPostId: json.id ?? input.calendar.id,
      };
    }

    console.log('[emailAdapter] MOCK send', { calendarId: input.calendar.id, subject: subject.slice(0, 80) });
    return {
      publishedUrl: `mailto:audience?campaign=${input.calendar.id}`,
      externalPostId: `email-mock-${input.calendar.id}`,
    };
  }, { maxAttempts: 3 });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

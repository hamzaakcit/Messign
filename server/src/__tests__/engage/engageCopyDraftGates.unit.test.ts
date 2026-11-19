/**
 * AI copy drafting (WP-24), without a database: the personal-data detector, the prompt builder, the model-output parser
 * and the gatekeepers that decide whether drafted copy may be queued. The model is replaced by a stub; nothing is sent.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/ai/gateway.js', () => ({ generateText: vi.fn(), AiBudgetExceededError: class extends Error {} }));

const { personalDataKinds, containsPersonalData } = await import('../../engage/copy/personalData.js');
const { buildCopyPrompt, gateDraftCopy, hasLinkOtherThanUnsubscribe, parseModelOutput, COPY_SYSTEM_PROMPT } = await import('../../engage/copy/copyDraft.js');

const GOOD_MARKETING = {
  subject: '{{first_name | default: "Merhaba"}}, sepetiniz sizi bekliyor',
  html: '<p>{{first_name | default: "okurumuz"}}, sepetinizdeki kitaplar hâlâ burada.</p><p><a href="{{unsubscribe_url}}">Abonelikten çık</a></p>',
  text: 'Sepetinizdeki kitaplar hâlâ burada.',
};

describe('personal-data detector', () => {
  it.each([
    ['an email address', 'yaz: ayse.yilmaz@example.com', ['email']],
    ['a Turkish mobile with spaces', 'ara: 0532 123 45 67', ['phone']],
    ['a +90 international form', 'tel +90 532 123 45 67', ['phone']],
    ['a 00-prefixed form', '00905321234567', ['phone']],
    ['a bare 10-digit mobile', 'numara 5321234567', ['phone']],
    ['a Turkish IBAN', 'IBAN TR33 0006 1005 1978 6457 8413 26', ['iban']],
    ['an 11-digit national id', 'TC 12345678901', ['national_id']],
    ['a Luhn-valid card number', 'kart 4111 1111 1111 1111', ['card_number']],
    ['an email spelled out with [at] and [dot]', 'ayse [at] example [dot] com', ['email']],
    ['an email spelled out in words', 'ayse yilmaz at gmail dot com', ['email']],
    ['an email with a Turkish domain', 'ayse@örnek.com.tr', ['email']],
    ['a phone with dots between groups', '0 532 . 123 . 45 . 67', ['phone']],
    ['a phone in full-width digits', '０５３２１２３４５６７', ['phone']],
    ['an email with a zero-width space inside', 'ayse\u200b@example.com', ['email']],
    ['a national id typed in groups', '123 456 789 01', ['national_id']],
  ])('flags %s', (_label, text, kinds) => {
    expect(personalDataKinds(text)).toEqual(kinds);
    expect(containsPersonalData(text)).toBe(true);
  });

  it('reports each kind once, sorted, and never the value', () => {
    const text = 'a@example.com ve b@example.org, 0532 111 22 33 ve 0533 111 22 44';
    expect(personalDataKinds(text)).toEqual(['email', 'phone']);
  });

  it.each([
    'Ücretsiz kargo 150 TL ve 2 kitap al, 1 bedava',
    '%10 indirim, 3 gün içinde bitiyor',
    'Yeni sezon 2026 kataloğu https://www.example.com/kampanya',
    'Lilyana çiçekleri: 10000 adet stok',
    'Sipariş 1234 hazır',
    'Kitaplar raflarda; yeni gelenler at the front, dot the i',
    'Ankara dot com fiyatı 120 TL, 3 kitap at 40 TL',
    'Kargo 100 000 TL üzeri ücretsiz, 2 gün içinde teslim',
  ])('does not flag ordinary copy: %s', (text) => {
    expect(personalDataKinds(text)).toEqual([]);
  });

  it('does not flag a 16-digit number that fails the Luhn check', () => {
    expect(personalDataKinds('kod 4111 1111 1111 1112')).toEqual([]);
  });
});

describe('prompt builder', () => {
  it('carries the language, purpose, trigger name and brief, and no personal data', () => {
    const p = buildCopyPrompt({ language: 'tr', purpose: 'marketing', triggerEvent: 'cart_updated', brief: 'Sepet hatırlatması, kısa ve samimi.' });
    expect(p.user).toContain('Turkish');
    expect(p.user).toContain('marketing');
    expect(p.user).toContain('"cart_updated"');
    expect(p.user).toContain('Sepet hatırlatması, kısa ve samimi.');
    expect(p.system).toBe(COPY_SYSTEM_PROMPT);
    expect(containsPersonalData(p.system)).toBe(false);
    expect(containsPersonalData(p.user)).toBe(false);
  });
});

describe('model output parser', () => {
  it('accepts one JSON object, with or without a code fence', () => {
    const json = JSON.stringify(GOOD_MARKETING);
    expect(parseModelOutput(json)).toEqual({ subject: GOOD_MARKETING.subject, html: GOOD_MARKETING.html, text: GOOD_MARKETING.text });
    expect(parseModelOutput('```json\n' + json + '\n```')?.subject).toBe(GOOD_MARKETING.subject);
  });

  it.each([
    ['prose instead of JSON', 'Tabii, işte metin: ...'],
    ['an extra key', JSON.stringify({ ...GOOD_MARKETING, bcc: 'x' })],
    ['no subject', JSON.stringify({ html: '<p>x</p>' })],
    ['neither html nor text', JSON.stringify({ subject: 'Konu', html: '  ', text: '' })],
    ['an empty answer', ''],
  ])('refuses %s', (_label, raw) => {
    expect(parseModelOutput(raw)).toBeNull();
  });
});

describe('gatekeepers for drafted copy', () => {
  it('passes a marketing draft with the first name and the unsubscribe link', () => {
    const r = gateDraftCopy(GOOD_MARKETING, 'marketing');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.variables.map((v) => `${v.source}:${v.name}`).sort()).toEqual(['attribute:first_name', 'system:unsubscribe_url']);
  });

  it('passes a transactional draft without an unsubscribe link', () => {
    const r = gateDraftCopy({ subject: 'Siparişiniz kargoda', html: '<p>{{first_name | default: "Merhaba"}}, siparişiniz yola çıktı.</p>', text: null }, 'transactional');
    expect(r.ok).toBe(true);
  });

  it('refuses marketing mail without the unsubscribe link', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>Merhaba</p>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['unsubscribe_missing'] });
  });

  it('refuses an unsubscribe link in transactional mail', () => {
    const r = gateDraftCopy({ ...GOOD_MARKETING }, 'transactional');
    expect(r).toEqual({ ok: false, reasons: ['unsubscribe_not_allowed'] });
  });

  it('refuses personalisation other than the first name', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>{{last_name | default: "Değerli müşterimiz"}}</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['variable_not_allowed'] });
  });

  it('refuses payload variables', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>{{payload.book | default: "kitap"}}</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['variable_not_allowed'] });
  });

  it('refuses the first name without a fallback, because a missing value would block the send', () => {
    const r = gateDraftCopy({ subject: 'Konu {{first_name}}', html: '<p>x</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['variable_needs_default'] });
  });

  it('refuses markup the template renderer forbids', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<script>alert(1)</script><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['template_invalid'] });
  });

  it('refuses a javascript: link', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<a href="javascript:void(0)">x</a><a href="{{unsubscribe_url}}">u</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['link_not_allowed', 'template_invalid'] });
  });

  it('refuses a variable the template language does not know', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>{{ order.total }}</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['template_invalid'] });
  });

  // Found in the real-model check (WP-24 follow-up): drafts carried a placeholder shop address and a bare path, and
  // repeated the greeting before the first-name placeholder.
  it('refuses a link or web address the model made up, in the text or the HTML', () => {
    const english = { subject: 'Your books', html: '<p>Hi</p><a href="{{unsubscribe_url}}">x</a>', text: 'Return to my basket: https://www.example.com/cart' };
    expect(gateDraftCopy(english, 'marketing')).toEqual({ ok: false, reasons: ['link_not_allowed'] });
    const bare = { subject: 'Konu', html: null, text: 'Sepetime dön: /sepet\nAbonelikten çık: {{unsubscribe_url}}' };
    expect(gateDraftCopy(bare, 'marketing')).toEqual({ ok: false, reasons: ['link_not_allowed'] });
    const image = { subject: 'Konu', html: '<img src="https://cdn.example.org/a.png"><a href="{{unsubscribe_url}}">x</a>', text: null };
    expect(gateDraftCopy(image, 'marketing')).toEqual({ ok: false, reasons: ['link_not_allowed'] });
  });

  it('allows the unsubscribe placeholder as the only link, and a slash inside a word', () => {
    expect(hasLinkOtherThanUnsubscribe({ subject: 'Konu', html: '<a href="{{unsubscribe_url}}">x</a>', text: '1/2 fiyat, Sepet/Kargo' })).toBe(false);
  });

  it('refuses a greeting word right before the first-name placeholder, in any language', () => {
    for (const greeting of ['Merhaba', 'Sayın', 'Hi', 'Dear']) {
      const r = gateDraftCopy({ subject: 'Konu', html: `<p>${greeting} {{first_name | default: "Merhaba"}},</p><a href="{{unsubscribe_url}}">x</a>`, text: null }, 'marketing');
      expect(r).toEqual({ ok: false, reasons: ['greeting_repeated'] });
    }
    const plain = gateDraftCopy({ subject: 'Konu', html: '<p>{{first_name | default: "Merhaba"}}, sepetiniz bekliyor.</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(plain.ok).toBe(true);
  });

  it('tells the model where the greeting and the links go, and that no URL is written', () => {
    expect(COPY_SYSTEM_PROMPT).toMatch(/Greeting\. The first-name placeholder carries the greeting/);
    expect(COPY_SYSTEM_PROMPT).toMatch(/Do not write any URL/);
  });

  // Found in the second real-model run: the copy referred to a button below and to links in the email, which the
  // message does not have, and was signed by a team the brief never named.
  it('refuses copy that refers to a link or button', () => {
    for (const text of [
      'Sepetinize dönmek için bağlantıya tıklayın.',
      'Siparişinizi butondan tamamlayabilirsiniz.',
      'Kargo takip bilgilerini bu e-postadaki bağlantılardan inceleyebilirsiniz.',
      'Use the button below to return to your basket.',
      'Click here to finish your order.',
      'Follow the link in this email.',
    ]) {
      const r = gateDraftCopy({ subject: 'Konu', html: '<a href="{{unsubscribe_url}}">x</a>', text }, 'marketing');
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.reasons, text).toContain('link_reference');
    }
  });

  it('refuses the word link even in ordinary copy (a known false positive, kept on purpose), and passes clean copy', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>{{first_name | default: "okurumuz"}}, sepetiniz bekliyor. Kitap linkleri yok, sadece kitaplar.</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toEqual(['link_reference']);
    const clean = gateDraftCopy({ subject: 'Konu', html: '<p>{{first_name | default: "okurumuz"}}, sepetiniz bekliyor.</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(clean.ok).toBe(true);
  });

  it('refuses a sign-off that ends with a team or brand name, and not a sentence that mentions one', () => {
    const signed = gateDraftCopy({ subject: 'Konu', html: '<p>{{first_name | default: "okurumuz"}}, iyi okumalar.</p><p>Sevgiyle,</p><p>Çiçek Mağazası Ekibi</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(signed.ok).toBe(false);
    if (!signed.ok) expect(signed.reasons).toEqual(['sender_name']);
    const mention = gateDraftCopy({ subject: 'Konu', html: '<p>{{first_name | default: "okurumuz"}}, ekibimiz size yardımcı olmaktan mutluluk duyar.</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(mention.ok).toBe(true);
  });

  it('tells the model not to name a sender, not to refer to links, and not to claim more than the brief', () => {
    expect(COPY_SYSTEM_PROMPT).toMatch(/Sender\. Never write the name of the shop/);
    expect(COPY_SYSTEM_PROMPT).toMatch(/Do not refer to a link, a button or an address/);
    expect(COPY_SYSTEM_PROMPT).toMatch(/Claims\. Say only what the brief says/);
  });

  it('refuses personal data in the copy, and names only the kind', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>Yazın: ayse@example.com</p><a href="{{unsubscribe_url}}">x</a>', text: '0532 111 22 33' }, 'marketing');
    expect(r).toEqual({ ok: false, reasons: ['personal_data:email', 'personal_data:phone'] });
    expect(JSON.stringify(r)).not.toContain('ayse');
  });
});

import { describe, expect, it } from 'vitest';
import { parseTemplate, renderTemplate, TemplateSyntaxError } from '../../engage/templates/render.js';

/** Shaped like Unlayer's HTML export: doctype, conditional comments for Outlook, a <style> block, tables, merge tags. */
const UNLAYER = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style type="text/css">@media (max-width: 620px) { .u-row { width: 100% !important; }}.u-row .u-col{display:block}</style>
</head>
<body class="clean-body u_body" style="margin: 0;padding: 0;background-color: #f9f9f9;color: #000000">
<table style="border-collapse: collapse;width:100%" cellpadding="0" cellspacing="0"><tr><td>
<!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><![endif]-->
<img src="https://cdn.example.com/logo.png" alt="{{brand | default: "Kitapyurdu"}}" width="120" style="display:block">
<h1 style="font-size:22px">Merhaba {{first_name | default: "değerli okurumuz"}},</h1>
<p>Sepetinizdeki <strong>{{payload.book_title}}</strong> sizi bekliyor.</p>
<a href="{{payload.cart_url}}" target="_blank" style="color:#fff">Sepete dön</a>
<a href="https://shop.example.com/kitap?id={{payload.book_id}}&amp;utm=email">Kitaba bak</a>
<p style="font-size:11px"><a href="{{unsubscribe_url}}">Abonelikten çık</a></p>
<!--[if (mso)|(IE)]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

const parse = (html: string, subject = 'Merhaba', text: string | null = null) => parseTemplate({ subject, html, text });
const render = (html: string, attributes: Record<string, unknown> = {}, payload: Record<string, unknown> = {}, system = { unsubscribe_url: 'https://app.example.com/u/TOKEN' }) =>
  renderTemplate(parse(html), { attributes, payload, system });

describe('Unlayer HTML', () => {
  it('parses a real-shaped export and lists what it uses', () => {
    const t = parseTemplate({ subject: '{{first_name | default: "Merhaba"}}, sepetiniz bekliyor', html: UNLAYER });
    expect(t.variables.map((v) => `${v.source}:${v.name}`).sort()).toEqual([
      'attribute:brand', 'attribute:first_name', 'payload:book_id', 'payload:book_title', 'payload:cart_url', 'system:unsubscribe_url',
    ]);
  });

  it('renders it (snapshot of the parts that change)', () => {
    const r = renderTemplate(parseTemplate({ subject: '{{first_name | default: "Merhaba"}}, sepetiniz bekliyor', html: UNLAYER }), {
      attributes: { first_name: 'Ayşe' },
      payload: { book_title: 'Kürk Mantolu Madonna', cart_url: 'https://shop.example.com/cart/abc', book_id: 'ISBN 978/975' },
      system: { unsubscribe_url: 'https://app.example.com/u/TOKEN' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject).toBe('Ayşe, sepetiniz bekliyor');
    const html = r.html!;
    expect(html).toContain('alt="Kitapyurdu"');
    expect(html).toContain('<h1 style="font-size:22px">Merhaba Ayşe,</h1>');
    expect(html).toContain('<strong>Kürk Mantolu Madonna</strong>');
    expect(html).toContain('<a href="https://shop.example.com/cart/abc" target="_blank"');
    expect(html).toContain('href="https://shop.example.com/kitap?id=ISBN%20978%2F975&amp;utm=email"');
    expect(html).toContain('<a href="https://app.example.com/u/TOKEN">Abonelikten çık</a>');
    // Everything that is not a variable is byte for byte the same.
    expect(html.replace(/Ayşe|Kitapyurdu|Kürk Mantolu Madonna|https:\/\/shop\.example\.com\/cart\/abc|ISBN%20978%2F975|https:\/\/app\.example\.com\/u\/TOKEN/g, '')).toBe(
      UNLAYER.replace(/\{\{[^}]*\}\}/g, '').replace(/Kitapyurdu/g, ''));
  });
});

describe('missing values never produce a blank send', () => {
  it('a missing attribute fails the whole render, with the variable named', () => {
    expect(render('<p>Hi {{first_name}}</p>')).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'first_name' }] });
  });
  it.each([['null', null], ['empty', ''], ['spaces', '   '], ['undefined', undefined]])('treats %s as missing', (_n, v) => {
    expect(render('<p>{{x}}</p>', { x: v }).ok).toBe(false);
  });
  it('uses the author\'s default only when the value is missing', () => {
    expect(render('<p>{{x | default: "okur"}}</p>', {})).toMatchObject({ ok: true, html: '<p>okur</p>' });
    expect(render('<p>{{x | default: "okur"}}</p>', { x: 'Ali' })).toMatchObject({ ok: true, html: '<p>Ali</p>' });
  });
  it('reports every problem, once each, and never returns partial output', () => {
    const r = render('<p>{{a}} {{b}} {{a}}</p><a href="{{payload.u}}">x</a>', {}, { u: 'javascript:alert(1)' });
    expect(r).toEqual({ ok: false, errors: [
      { code: 'missing_variable', variable: 'a' }, { code: 'missing_variable', variable: 'b' }, { code: 'unsafe_url', variable: 'payload.u' },
    ] });
  });
  it('a payload variable is not satisfied by an attribute of the same name, or the other way round', () => {
    expect(render('<p>{{payload.x}}</p>', { x: 'attr' }).ok).toBe(false);
    expect(render('<p>{{x}}</p>', {}, { x: 'payload' }).ok).toBe(false);
  });
  it('marketing links are values like any other: missing means the render fails', () => {
    expect(renderTemplate(parse('<a href="{{unsubscribe_url}}">x</a>'), { attributes: {}, system: {} })).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'unsubscribe_url' }] });
  });
  it('does not read inherited object properties as values: they are simply missing', () => {
    expect(render('<p>{{constructor}}</p>')).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'constructor' }] });
    expect(render('<p>{{toString | default: "x"}}</p>')).toMatchObject({ ok: true, html: '<p>x</p>' });
    expect(render('<p>{{payload.__proto__}}</p>')).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'payload.__proto__' }] });
  });
});

describe('escaping by context', () => {
  const evil = `<script>alert("x")</script>&'`;
  it('escapes text and attribute values', () => {
    const r = render('<p title="{{x}}">{{x}}</p>', { x: evil });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.html).toBe('<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;</p>');
  });
  it('a value that starts a URL must be an https URL', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'http://shop.example.com', 'data:text/html,x', '//evil.example.com', 'https://a b.com', 'https://x.com/"onmouseover="x', 'not a url']) {
      expect(render('<a href="{{u}}">x</a>', { u: bad })).toEqual({ ok: false, errors: [{ code: 'unsafe_url', variable: 'u' }] });
    }
    expect(render('<a href="{{u}}">x</a>', { u: 'https://shop.example.com/a?b=1&c=2' })).toMatchObject({ ok: true, html: '<a href="https://shop.example.com/a?b=1&amp;c=2">x</a>' });
    expect(render('<img src="{{u}}">', { u: 'https://cdn.example.com/a.png' }).ok).toBe(true);
  });
  it('a value after a static https prefix is percent-encoded, so it cannot change the URL', () => {
    expect(render('<a href="https://s.example.com/p/{{id}}">x</a>', { id: '../admin?x="y"' })).toMatchObject({ ok: true, html: '<a href="https://s.example.com/p/..%2Fadmin%3Fx%3D%22y%22">x</a>' });
  });
  it('the subject stays one line (no header injection); the text part keeps line breaks only', () => {
    const t = parseTemplate({ subject: 'Merhaba {{n}}', text: 'Merhaba {{n}}\nhoşça kal' });
    expect(renderTemplate(t, { attributes: { n: 'Ali\r\nBcc: x@example.com' } })).toMatchObject({ ok: true, subject: 'Merhaba Ali Bcc: x@example.com', text: 'Merhaba Ali \nBcc: x@example.com\nhoşça kal' });
  });
  it('numbers and booleans render; objects, arrays and non-finite numbers do not', () => {
    expect(render('<p>{{n}} {{b}}</p>', { n: 42.5, b: true })).toMatchObject({ ok: true, html: '<p>42.5 true</p>' });
    for (const v of [{ a: 1 }, [1, 2], Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(render('<p>{{v}}</p>', { v })).toEqual({ ok: false, errors: [{ code: 'unsupported_value', variable: 'v' }] });
    }
  });
  it('caps value length and the rendered subject', () => {
    expect(render('<p>{{v}}</p>', { v: 'x'.repeat(1001) })).toEqual({ ok: false, errors: [{ code: 'value_too_long', variable: 'v' }] });
    const t = parseTemplate({ subject: '{{a}}', html: '<p>x</p>' });
    expect(renderTemplate(t, { attributes: { a: 'x'.repeat(999) } })).toEqual({ ok: false, errors: [{ code: 'subject_too_long', variable: '' }] });
  });
});

describe('what a template may not contain (rejected when the version is saved)', () => {
  const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof TemplateSyntaxError ? e.code : 'other'; } };
  it.each([
    ['logic', '<p>{{#if vip}}x{{/if}}</p>', 'invalid_variable'],
    ['filters', '<p>{{ name | upcase }}</p>', 'invalid_variable'],
    ['expressions', '<p>{{ a + b }}</p>', 'invalid_variable'],
    ['nested paths', '<p>{{ payload.a.b }}</p>', 'invalid_variable'],
    ['unknown namespace', '<p>{{ event.name }}</p>', 'invalid_variable'],
    ['unclosed', '<p>{{ name </p>', 'unclosed_variable'],
    ['default on a system value', '<a href="{{unsubscribe_url | default: "x"}}">x</a>', 'invalid_variable'],
    ['default with braces', '<p>{{ a | default: "{{b}}" }}</p>', 'invalid_variable'],
    ['script', '<script>var a=1</script>', 'forbidden_tag'],
    ['SCRIPT in capitals', '<SCRIPT src="https://x.com/a.js"></SCRIPT>', 'forbidden_tag'],
    ['iframe', '<iframe src="https://x.com"></iframe>', 'forbidden_tag'],
    ['form', '<form action="https://x.com"><input></form>', 'forbidden_tag'],
    ['base', '<base href="https://x.com/">', 'forbidden_tag'],
    ['event handler', '<img src="https://x.com/a.png" onerror="alert(1)">', 'forbidden_attribute'],
    ['javascript: link', '<a href="javascript:alert(1)">x</a>', 'forbidden_url'],
    ['obfuscated javascript: link', '<a href=" jav\tascript:alert(1)">x</a>', 'forbidden_url'],
    ['data: image', '<img src="data:image/svg+xml,<svg onload=alert(1)>">', 'forbidden_url'],
    ['variable in <style>', '<style>.a{color:{{c}}}</style>', 'variable_in_unsafe_context'],
    ['variable in a comment', '<!-- {{a}} -->', 'variable_in_unsafe_context'],
    ['variable as a tag name', '<{{t}}>x</p>', 'variable_in_unsafe_context'],
    ['variable as a closing tag name', '<p>x</{{t}}>', 'variable_in_unsafe_context'],
    ['variable as an attribute name', '<p {{a}}="x">x</p>', 'variable_in_unsafe_context'],
    ['variable in an unquoted attribute', '<p title={{a}}>x</p>', 'variable_in_unsafe_context'],
    // Mid-value too: escaping does not touch spaces, so "x {{a}}" with a = "y onmouseover=..." would add an attribute.
    ['variable inside an unquoted attribute value', '<p title=x{{a}}>x</p>', 'variable_in_unsafe_context'],
    ['variable in style=', '<p style="color:{{c}}">x</p>', 'variable_in_unsafe_context'],
    ['variable in srcset', '<img srcset="{{a}} 2x">', 'variable_in_unsafe_context'],
    ['variable after an http prefix', '<a href="http://x.com/{{a}}">x</a>', 'variable_in_unsafe_context'],
    ['variable after mailto:', '<a href="mailto:{{a}}">x</a>', 'variable_in_unsafe_context'],
  ])('%s', (_n, html, expected) => {
    expect(code(() => parse(html))).toBe(expected);
  });
  it('requires a one-line subject and some body', () => {
    expect(code(() => parseTemplate({ subject: '', html: '<p>x</p>' }))).toBe('missing_subject');
    expect(code(() => parseTemplate({ subject: 'a\r\nBcc: x', html: '<p>x</p>' }))).toBe('invalid_subject');
    expect(code(() => parseTemplate({ subject: 'a', html: '  ', text: null }))).toBe('missing_body');
  });
  it('allows what real emails use: inline styles, CSS media queries with }}, Outlook conditional comments, https images', () => {
    expect(code(() => parse(UNLAYER))).toBeNull();
    expect(code(() => parse('<style>@media (max-width:600px){.a{b:c}}</style><p>x</p>'))).toBeNull();
  });
  it('a text-only template is fine, and its variables are plain', () => {
    const t = parseTemplate({ subject: 'Sipariş {{payload.order_id}}', text: 'Merhaba {{first_name}}, siparişiniz <yolda>.' });
    expect(renderTemplate(t, { attributes: { first_name: 'Ali' }, payload: { order_id: 'A-1' } })).toEqual({ ok: true, subject: 'Sipariş A-1', html: null, text: 'Merhaba Ali, siparişiniz <yolda>.' });
  });
});

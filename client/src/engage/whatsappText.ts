/**
 * Plain-English text for what can stop a WhatsApp template from being sent (WP-40a). Codes come from the server (whatsapp/templates.ts
 * health and the send gate); an unknown code is shown as itself.
 */
export const WHATSAPP_PROBLEM_TEXT: Record<string, string> = {
  status_unknown: 'Meta has not been asked about this template yet. Run the template check in Settings.',
  not_approved: 'Meta has not approved this template, or has paused or disabled it. Messages from it are not sent.',
  body_variable_count: 'The number of values does not match the body Meta approved.',
  header_variable_count: 'The header value does not match the header Meta approved.',
  url_button_variable_count: 'The button link value does not match the button Meta approved.',
  unsupported_header: 'The template at Meta has an image, video or document header, which Messign cannot fill yet.',
  unsupported_button: 'The template at Meta has a button type Messign cannot fill yet.',
  named_parameters_unsupported: 'The template at Meta uses named variables; Messign fills numbered ones ({{1}}, {{2}}).',
  meta_category_differs: 'Meta files this template under a different category than declared. Meta\'s category is the one that counts.',
  body_text_differs: 'The body text here is not the text Meta approved. Check that this is the right template.',
};

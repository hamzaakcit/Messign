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

/** What a failed template check means and what to do (WP-40c). Codes from the server's template check; Meta's codes as wa_<n>. */
export const CHECK_ERROR_TEXT: Record<string, string> = {
  no_whatsapp_account: 'There is no active WhatsApp account.',
  waba_missing: 'The WhatsApp account has no WhatsApp Business Account id (waba_id). Rotate the account with --config waba_id=<id>; the id is on WhatsApp Manager > Account tools, or the API Setup page.',
  provider_has_no_templates: 'This account\'s provider does not list templates.',
  whatsapp_config_invalid: 'The WhatsApp account\'s configuration is not valid (an id or the access token is missing). Rotate the account.',
  wa_190: 'Meta refused the access token: it expired or was revoked. Rotate the account with a new token (a permanent system user token for live use). Sending fails until then.',
  wa_10: 'The access token does not have permission to read templates. Give the system user the whatsapp_business_management permission and create a new token.',
  wa_200: 'The access token does not have permission to read templates. Give the system user the whatsapp_business_management permission and create a new token.',
  wa_100: 'Meta did not recognise the request; the waba_id is probably wrong. Check it against WhatsApp Manager and rotate the account.',
  wa_80008: 'Meta is limiting how often this account can be asked. The next hourly check will try again.',
  whatsapp_unreachable: 'Meta could not be reached. The next hourly check will try again.',
  whatsapp_timeout: 'Meta did not answer in time. The next hourly check will try again.',
  whatsapp_too_many_templates: 'The account has more templates than one check reads (5,000). Archive unused templates in WhatsApp Manager.',
  whatsapp_unexpected_response: 'Meta answered in a way Messign does not expect. Tell your Messign contact.',
  check_failed: 'The check failed. Tell your Messign contact if this continues.',
};

/** The WhatsApp setup checklist, in the server's order. */
export const SETUP_STEP_TEXT: Record<string, { title: string; todo: string }> = {
  account: { title: 'WhatsApp account added', todo: 'Add it in a terminal: npm run engage:add-account -- --org <org id> --whatsapp --mode test --label "WhatsApp" --config phone_number_id=<id> --config waba_id=<id>. The token and secrets are typed at hidden prompts.' },
  waba_id: { title: 'WhatsApp Business Account id set', todo: 'The account needs waba_id for the template check and Meta\'s template updates. Rotate the account with --config waba_id=<id>.' },
  webhook_url: { title: 'Webhook URL available', todo: 'The server needs ENGAGE_PUBLIC_API_URL (its public https address) to build the URL. Ask your Messign contact.' },
  template_check: { title: 'Template check working', todo: 'Press "Check now" below. If it fails, the reason is shown under it.' },
  templates_in_use: { title: 'Templates in use approved by Meta', todo: 'A template that a journey or a recent campaign uses is not approved, or is rated red. See the list below.' },
  sending_ready: { title: 'Ready to send WhatsApp', todo: 'Rate card, budget cap and (for live sending) the readiness items. See the list below and the cards further down.' },
};

/** Meta's template status words, for the admin. */
export const META_STATUS_TEXT: Record<string, string> = {
  APPROVED: 'Approved', PENDING: 'In review', REJECTED: 'Rejected', PAUSED: 'Paused by Meta', DISABLED: 'Disabled by Meta',
  DELETED: 'Deleted', PENDING_DELETION: 'Being deleted', ARCHIVED: 'Archived', IN_APPEAL: 'In appeal', LIMIT_EXCEEDED: 'Over the template limit',
};

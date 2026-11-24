/** The published contract for the ingestion API. A test keeps it in step with the routes in v1Routes.ts. */
const error = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const key = [{ ApiKey: [] }];

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Messign Engage ingestion API',
    version: '1.0.0',
    description: 'Send customer profiles, consents and events. The tenant is the one the API key belongs to; a body `organization_id` is rejected.',
  },
  servers: [{ url: '/api/engage/v1' }],
  security: key,
  paths: {
    '/profiles:upsert': {
      post: {
        summary: 'Create or update a profile by your own customer id',
        description: 'Attributes are merged (null removes a key). An email or phone that changes keeps the old value as history. Consents are appended to the ledger; a grant needs evidence.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpsert' } } } },
        responses: {
          '200': { description: 'The profile as stored', content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } } },
          '400': error, '401': error, '403': error, '409': { ...error, description: 'The email or phone already belongs to another profile' }, '429': error,
        },
      },
    },
    '/events:track': {
      post: {
        summary: 'Record up to 500 events',
        description: 'Idempotent on `client_event_id`: a replay returns `duplicate: true` and stores nothing. Events for an unknown profile are rejected individually.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TrackRequest' } } } },
        responses: {
          '200': { description: 'One result per event, in order', content: { 'application/json': { schema: { $ref: '#/components/schemas/TrackResponse' } } } },
          '400': error, '401': error, '403': error, '429': error,
        },
      },
    },
    '/journeys/{key}/trigger': {
      post: {
        summary: 'Start an API-triggered journey for a profile',
        description: 'Enrolls the profile in the active version of the journey. The idempotency key is unique per journey: '
          + 'repeating a request returns the same enrollment with duplicate: true (200); reusing the key for a different '
          + 'profile or payload is a 409. A profile already in the journey is not enrolled again (200, not_enrolled).',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TriggerRequest' } } } },
        responses: {
          '202': { description: 'Enrolled' },
          '200': { description: 'Duplicate request, or the profile is already in the journey' },
          '400': error, '401': error, '403': error, '404': error, '409': error, '429': error,
        },
      },
    },
    '/openapi.json': {
      get: { summary: 'This document', responses: { '200': { description: 'OpenAPI 3 document' }, '401': error } },
    },
  },
  components: {
    securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, issues: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } } } },
      ProfileUpsert: {
        type: 'object', required: ['external_id'], additionalProperties: false,
        properties: {
          external_id: { type: 'string', minLength: 1, maxLength: 200 },
          identifiers: { type: 'object', additionalProperties: false, properties: { email: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true, description: 'Turkish national formats default to +90' } } },
          attributes: { type: 'object' }, timezone: { type: 'string', nullable: true }, locale: { type: 'string', nullable: true },
          consents: { type: 'array', maxItems: 8, items: { $ref: '#/components/schemas/Consent' } },
          skip_triggers: { type: 'boolean' },
        },
      },
      Consent: {
        type: 'object', required: ['channel', 'status'], additionalProperties: false,
        properties: {
          channel: { type: 'string', enum: ['sms', 'email', 'call', 'whatsapp'] },
          status: { type: 'string', enum: ['granted', 'revoked'] },
          source: { type: 'string', enum: ['api', 'web', 'import'], default: 'api' },
          evidence: { type: 'object', description: 'Required for a grant: source, text version, timestamp, IP or channel' },
          recorded_at: { type: 'string', format: 'date-time' },
        },
      },
      Profile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }, externalId: { type: 'string' }, attributes: { type: 'object' },
          identifiers: { type: 'object', properties: { email: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true } } },
          consents: { type: 'object', additionalProperties: { type: 'string', enum: ['granted', 'revoked'] } },
        },
      },
      TrackRequest: {
        type: 'object', required: ['events'], additionalProperties: false,
        properties: { events: { type: 'array', minItems: 1, maxItems: 500, items: { $ref: '#/components/schemas/Event' } } },
      },
      Event: {
        type: 'object', required: ['client_event_id', 'external_id', 'name', 'occurred_at'], additionalProperties: false,
        properties: {
          client_event_id: { type: 'string', maxLength: 200 }, external_id: { type: 'string' },
          name: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$', description: 'Reserved: cart_updated, checkout_started, order_completed, product_viewed, profile_attribute_changed' },
          occurred_at: { type: 'string', format: 'date-time' }, properties: { type: 'object', description: 'Up to 8000 bytes' },
        },
      },
      TrackResponse: {
        type: 'object',
        properties: {
          accepted: { type: 'integer' }, duplicates: { type: 'integer' }, rejected: { type: 'integer' },
          results: { type: 'array', items: { type: 'object', properties: { client_event_id: { type: 'string' }, status: { type: 'string', enum: ['accepted', 'duplicate', 'rejected'] }, duplicate: { type: 'boolean' }, error: { type: 'string' } } } },
        },
      },
      TriggerRequest: {
        type: 'object', required: ['external_id', 'idempotency_key'], additionalProperties: false,
        properties: { external_id: { type: 'string' }, idempotency_key: { type: 'string' }, payload: { type: 'object' }, create_if_missing: { type: 'boolean' } },
      },
    },
  },
} as const;

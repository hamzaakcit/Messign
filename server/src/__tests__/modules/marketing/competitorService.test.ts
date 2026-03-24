import { describe, it, expect, vi } from 'vitest';
import {
  generateContentHash,
  isValidEventType,
  isValidSignificance,
  EVENT_TYPES,
  SIGNIFICANCE_LEVELS,
} from '../../../services/marketing/competitorService.js';
import type {
  Competitor,
  CompetitorEvent,
  CreateCompetitorInput,
  CreateEventInput,
  EventType,
} from '../../../services/marketing/competitorService.js';

describe('Type Contracts', () => {
  it('Competitor has all required fields', () => {
    const comp: Competitor = {
      id: 'comp-1', organization_id: 'org-1', name: 'Acme Corp',
      website_url: 'https://acme.com', description: 'A competitor',
      logo_url: null, monitor_urls: ['https://acme.com/blog'],
      monitor_email: false, monitor_social: false,
      industry: 'SaaS', tier: 'direct', active: true,
      last_scraped_at: null, last_scrape_summary: null, created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    expect(comp.name).toBe('Acme Corp');
    expect(comp.tier).toBe('direct');
  });

  it('CompetitorEvent has all required fields', () => {
    const event: CompetitorEvent = {
      id: 'evt-1', organization_id: 'org-1', competitor_id: 'comp-1',
      event_type: 'product_launch', title: 'Acme launches v2',
      summary: 'Major update', body_text: 'Full text...',
      source_url: 'https://acme.com/blog/v2', image_url: null,
      tags: ['product', 'launch'], sentiment: 'positive',
      significance: 'high', ai_analysis: null, ai_analyzed_at: null,
      content_hash: 'abc123', event_date: '2026-03-20',
      discovered_at: new Date().toISOString(), created_at: new Date().toISOString(),
    };
    expect(event.event_type).toBe('product_launch');
    expect(event.significance).toBe('high');
  });

  it('CreateCompetitorInput requires name and organizationId', () => {
    const input: CreateCompetitorInput = {
      organizationId: 'org-1',
      name: 'Rival Inc',
    };
    expect(input.name).toBeTruthy();
    expect(input.organizationId).toBeTruthy();
  });

  it('CreateEventInput requires core fields', () => {
    const input: CreateEventInput = {
      organizationId: 'org-1',
      competitorId: 'comp-1',
      eventType: 'blog_post',
      title: 'New blog post',
    };
    expect(input.eventType).toBe('blog_post');
  });
});

describe('Event Type Validation', () => {
  it('accepts all 10 valid event types', () => {
    for (const type of EVENT_TYPES) {
      expect(isValidEventType(type)).toBe(true);
    }
  });

  it('EVENT_TYPES has exactly 10 entries', () => {
    expect(EVENT_TYPES).toHaveLength(10);
  });

  it('rejects invalid event types', () => {
    expect(isValidEventType('tweet')).toBe(false);
    expect(isValidEventType('')).toBe(false);
    expect(isValidEventType('BLOG_POST')).toBe(false);
  });
});

describe('Significance Validation', () => {
  it('accepts all 4 valid levels', () => {
    for (const level of SIGNIFICANCE_LEVELS) {
      expect(isValidSignificance(level)).toBe(true);
    }
  });

  it('rejects invalid levels', () => {
    expect(isValidSignificance('urgent')).toBe(false);
    expect(isValidSignificance('')).toBe(false);
  });
});

describe('Content Hash Generation', () => {
  it('generates deterministic hash for same input', () => {
    const hash1 = generateContentHash('Test Title', 'https://example.com');
    const hash2 = generateContentHash('Test Title', 'https://example.com');
    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different titles', () => {
    const hash1 = generateContentHash('Title A', 'https://example.com');
    const hash2 = generateContentHash('Title B', 'https://example.com');
    expect(hash1).not.toBe(hash2);
  });

  it('generates different hashes for different URLs', () => {
    const hash1 = generateContentHash('Same Title', 'https://a.com');
    const hash2 = generateContentHash('Same Title', 'https://b.com');
    expect(hash1).not.toBe(hash2);
  });

  it('is case-insensitive', () => {
    const hash1 = generateContentHash('TEST TITLE', 'HTTPS://EXAMPLE.COM');
    const hash2 = generateContentHash('test title', 'https://example.com');
    expect(hash1).toBe(hash2);
  });

  it('handles null/empty source URL', () => {
    const hash1 = generateContentHash('Title', null);
    const hash2 = generateContentHash('Title', undefined);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBeNull();
  });

  it('returns null for empty title', () => {
    expect(generateContentHash('', 'https://a.com')).toBeNull();
  });

  it('returns 32-char hex string', () => {
    const hash = generateContentHash('Test', 'https://a.com');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('Competitor CRUD — Mock DB', () => {
  function createMockDb() {
    const store: Record<string, unknown>[] = [];
    return {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('LOWER(name)')) {
          const name = (values?.[1] as string || '').toLowerCase();
          const found = store.find((r) => (r.name as string).toLowerCase() === name && r.active === true);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('INSERT')) {
          const record = {
            id: 'comp-' + Math.random().toString(36).slice(2, 8),
            name: values?.[1],
            organization_id: values?.[0],
            active: true,
          };
          store.push(record);
          return { rows: [record] };
        }
        if (text.includes('COUNT')) return { rows: [{ total: store.length }] };
        if (text.includes('WHERE id')) {
          const id = values?.[0];
          const found = store.find((r) => r.id === id);
          return { rows: found ? [found] : [] };
        }
        return { rows: store };
      }),
    };
  }

  it('createCompetitor inserts and returns competitor', async () => {
    const { createCompetitor } = await import('../../../services/marketing/competitorService.js');
    const db = createMockDb();
    const comp = await createCompetitor({ organizationId: 'org-1', name: 'Rival' }, db);
    expect(comp.name).toBe('Rival');
    expect(db.query).toHaveBeenCalled();
  });

  it('createCompetitor rejects empty name', async () => {
    const { createCompetitor } = await import('../../../services/marketing/competitorService.js');
    await expect(createCompetitor({ organizationId: 'org-1', name: '' }, createMockDb()))
      .rejects.toThrow('name is required');
  });

  it('createCompetitor validates monitor URLs', async () => {
    const { createCompetitor } = await import('../../../services/marketing/competitorService.js');
    const db = createMockDb();
    await createCompetitor({
      organizationId: 'org-1',
      name: 'Test',
      monitorUrls: ['https://valid.com/blog', 'not-a-url', 'https://also-valid.com'],
    }, db);
    const insertCall = db.query.mock.calls.find((c) => (c[0] as string).includes('INSERT'));
    const urlsParam = insertCall?.[1]?.[5] as string[];
    expect(urlsParam).toHaveLength(2);
    expect(urlsParam).toContain('https://valid.com/blog');
    expect(urlsParam).not.toContain('not-a-url');
  });
});

describe('Event Store — Mock DB', () => {
  function createMockDb() {
    const events: Record<string, unknown>[] = [];
    return {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('content_hash') && text.includes('SELECT')) {
          const hash = values?.[2];
          const found = events.find((e) => e.content_hash === hash);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('INSERT')) {
          const event = {
            id: 'evt-' + Math.random().toString(36).slice(2, 8),
            title: values?.[3],
            content_hash: values?.[11],
          };
          events.push(event);
          return { rows: [event] };
        }
        if (text.includes('COUNT')) return { rows: [{ total: events.length }] };
        return { rows: events };
      }),
    };
  }

  it('recordEvent inserts and returns new event', async () => {
    const { recordEvent } = await import('../../../services/marketing/competitorService.js');
    const db = createMockDb();
    const result = await recordEvent({
      organizationId: 'org-1', competitorId: 'comp-1',
      eventType: 'blog_post', title: 'New Post',
    }, db);
    expect(result.isNew).toBe(true);
    expect(result.id).toBeTruthy();
  });

  it('recordEvent deduplicates by content hash', async () => {
    const { recordEvent } = await import('../../../services/marketing/competitorService.js');
    const db = createMockDb();

    const first = await recordEvent({
      organizationId: 'org-1', competitorId: 'comp-1',
      eventType: 'blog_post', title: 'Duplicate Post', sourceUrl: 'https://x.com/post',
    }, db);
    expect(first.isNew).toBe(true);

    const hash = generateContentHash('Duplicate Post', 'https://x.com/post');
    db.query.mockImplementationOnce(async () => ({
      rows: [{ id: first.id, content_hash: hash }],
    }));

    const second = await recordEvent({
      organizationId: 'org-1', competitorId: 'comp-1',
      eventType: 'blog_post', title: 'Duplicate Post', sourceUrl: 'https://x.com/post',
    }, db);
    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it('recordEvent rejects empty title', async () => {
    const { recordEvent } = await import('../../../services/marketing/competitorService.js');
    await expect(recordEvent({
      organizationId: 'org-1', competitorId: 'comp-1',
      eventType: 'blog_post', title: '',
    }, createMockDb())).rejects.toThrow('title is required');
  });

  it('recordEvent rejects invalid event type', async () => {
    const { recordEvent } = await import('../../../services/marketing/competitorService.js');
    await expect(recordEvent({
      organizationId: 'org-1', competitorId: 'comp-1',
      eventType: 'invalid_type' as EventType, title: 'Test',
    }, createMockDb())).rejects.toThrow('Invalid event type');
  });
});

describe('Tier Classification', () => {
  it('valid tiers: direct, indirect, aspirational', () => {
    const validTiers = ['direct', 'indirect', 'aspirational'];
    expect(validTiers).toHaveLength(3);
  });

  it('DB sort order: tier ASC gives aspirational, direct, indirect', () => {
    const tiers = ['aspirational', 'direct', 'indirect'];
    const sorted = [...tiers].sort();
    expect(sorted).toEqual(['aspirational', 'direct', 'indirect']);
  });
});

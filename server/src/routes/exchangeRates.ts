import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

const SUPPORTED_CURRENCIES = [
  'EUR','USD','GBP','TRY','JPY','CHF','CAD','AUD','SEK','NOK','DKK','PLN','CZK','HUF','RON',
];

/** Fetch rate from Frankfurter: "X units of currency = ? EUR". Uses base=&symbols=EUR. Returns rate or null. */
async function fetchFrankfurterRate(currency: string, dateOrLatest: string): Promise<number | null> {
  const path = dateOrLatest === 'latest' ? '/latest' : `/${dateOrLatest}`;
  const url = `${FRANKFURTER_BASE}${path}?base=${encodeURIComponent(currency)}&symbols=EUR`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const data = await response.json() as { rates?: { EUR?: number } };
  const rate = data.rates?.EUR;
  return rate != null ? rate : null;
}

/** Get exchange rate: cache → Frankfurter API (date then latest) → fallback */
async function getRate(currency: string, date: string): Promise<number> {
  if (currency === 'EUR') return 1.0;

  const today = new Date().toISOString().slice(0, 10);
  const useDate = date > today ? today : date; // Frankfurter has no future dates

  // 1. Check cache
  try {
    const cached = await query<{ rate: string }>(
      `SELECT rate FROM exchange_rates WHERE currency = $1 AND rate_date = $2`,
      [currency, useDate]
    );
    if (cached.rows.length > 0) return parseFloat(cached.rows[0].rate);
  } catch { /* table may not exist yet, continue */ }

  // 2. Fetch from Frankfurter API (historical or today)
  let rate: number | null = null;
  try {
    rate = await fetchFrankfurterRate(currency, useDate);
    if (rate != null) {
      try {
        await query(
          `INSERT INTO exchange_rates (currency, rate, rate_date) VALUES ($1, $2, $3)
           ON CONFLICT (currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()`,
          [currency, rate, useDate]
        );
      } catch { /* cache write failure is non-fatal */ }
      return rate;
    }
  } catch (apiErr) {
    console.warn(`[exchange] Frankfurter API failed for ${currency}/${useDate}:`, (apiErr as Error).message);
  }

  // 3. Fallback: try "latest" (current rate) so we don't return 1:1
  try {
    const latestRate = await fetchFrankfurterRate(currency, 'latest');
    if (latestRate != null && latestRate > 0) {
      console.warn(`[exchange] Using latest rate for ${currency} (date ${date} unavailable)`);
      return latestRate;
    }
  } catch { /* ignore */ }

  // 4. Closest cached date
  try {
    const fallback = await query<{ rate: string }>(
      `SELECT rate FROM exchange_rates WHERE currency = $1 ORDER BY ABS(rate_date - $2::date) LIMIT 1`,
      [currency, useDate]
    );
    if (fallback.rows.length > 0) return parseFloat(fallback.rows[0].rate);
  } catch { /* no cache at all */ }

  // 5. Ultimate fallback (avoids silent 1:1 for unsupported currencies if possible)
  console.warn(`[exchange] No rate for ${currency}/${date}; using 1.0`);
  return 1.0;
}

// GET /:from/:to?date=YYYY-MM-DD
router.get('/:from/:to', async (req: ReimbursementRequest, res) => {
  const fromCur = (req.params.from || '').toUpperCase().slice(0, 3);
  const toCur = (req.params.to || '').toUpperCase().slice(0, 3);
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  if (!fromCur || !toCur) {
    res.status(400).json({ error: 'Invalid currency codes' });
    return;
  }
  if (fromCur === toCur) {
    return res.json({ from: fromCur, to: toCur, rate: 1, date });
  }

  try {
    let rate: number;
    if (toCur === 'EUR') {
      rate = await getRate(fromCur, date);
    } else if (fromCur === 'EUR') {
      const inverseRate = await getRate(toCur, date);
      rate = inverseRate > 0 ? 1 / inverseRate : 1;
    } else {
      // Cross rate via EUR
      const fromToEur = await getRate(fromCur, date);
      const toToEur = await getRate(toCur, date);
      rate = toToEur > 0 ? fromToEur / toToEur : 1;
    }
    res.json({ from: fromCur, to: toCur, rate: Math.round(rate * 1e6) / 1e6, date });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get exchange rate' });
  }
});

// GET /currencies
router.get('/currencies', async (_req: ReimbursementRequest, res) => {
  res.json(SUPPORTED_CURRENCIES);
});

export { getRate as getExchangeRate };
export const exchangeRatesRouter = router;

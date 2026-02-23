import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const GRAPHHOPPER_GEOCODE = 'https://graphhopper.com/api/1/geocode';
const GRAPHHOPPER_ROUTE = 'https://graphhopper.com/api/1/route';

async function geocodeAddress(address: string, key: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: address,
    limit: '1',
    key,
  });
  const url = `${GRAPHHOPPER_GEOCODE}?${params.toString()}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as {
    hits?: Array<{ point?: { lat: number; lng: number } }>;
    message?: string;
  };
  if (!resp.ok) {
    console.warn('[mileage] GraphHopper geocode non-2xx', {
      address,
      status: resp.status,
      message: (data as { message?: string }).message,
    });
    return null;
  }
  const hit = data.hits?.[0]?.point;
  if (!hit || hit.lat == null || hit.lng == null) {
    console.warn('[mileage] GraphHopper geocode: no hits', { address });
    return null;
  }
  return { lat: hit.lat, lng: hit.lng };
}

async function getRouteDistance(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  key: string
): Promise<{ distanceM: number; timeMs?: number } | null> {
  const params = new URLSearchParams({ profile: 'car', key });
  params.append('point', `${origin.lat},${origin.lng}`);
  params.append('point', `${dest.lat},${dest.lng}`);
  const url = `${GRAPHHOPPER_ROUTE}?${params.toString()}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as {
    paths?: Array<{ distance?: number; time?: number }>;
    message?: string;
  };
  if (!resp.ok) {
    console.warn('[mileage] GraphHopper route non-2xx', {
      status: resp.status,
      message: data.message,
    });
    return null;
  }
  const path = data.paths?.[0];
  if (!path || path.distance == null) {
    console.warn('[mileage] GraphHopper route: no path or distance');
    return null;
  }
  return { distanceM: path.distance, timeMs: path.time };
}

const router = Router();
router.use(reimbursementAuth);

router.get('/rate', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  try {
    const result = await query(
      `SELECT mileage_rate_per_km, mileage_currency FROM reimbursement_settings WHERE organization_id = $1`,
      [orgId]
    );
    const row = result.rows[0];
    res.json({
      ratePerKm: row ? parseFloat(row.mileage_rate_per_km) : 0.67,
      currency: row?.mileage_currency ?? 'USD',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get mileage rate' });
  }
});

router.post('/calculate', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { origin_address, destination_address, is_round_trip } = req.body;
  if (!origin_address || !destination_address) {
    res.status(400).json({ error: 'origin_address and destination_address required' });
    return;
  }
  const apiKey = process.env.GRAPHHOPPER_API_KEY;
  let distanceKm = 0;
  let durationMinutes: number | undefined;

  if (!apiKey) {
    console.warn('[mileage] GRAPHHOPPER_API_KEY not set; using fallback distance');
  }
  if (apiKey) {
    try {
      const originPoint = await geocodeAddress(String(origin_address), apiKey);
      const destPoint = await geocodeAddress(String(destination_address), apiKey);
      if (originPoint && destPoint) {
        const route = await getRouteDistance(originPoint, destPoint, apiKey);
        if (route) {
          distanceKm = route.distanceM / 1000;
          if (route.timeMs != null) durationMinutes = Math.round(route.timeMs / 60000);
          console.info('[mileage] GraphHopper OK:', {
            origin_address,
            destination_address,
            distanceKm: Math.round(distanceKm * 100) / 100,
          });
        }
      }
    } catch (e) {
      console.error('[mileage] GraphHopper API error:', e);
    }
  }

  if (distanceKm <= 0) {
    console.warn('[mileage] Using fallback distance 10 km (no API key, API error, or no results)');
    distanceKm = 10;
  }

  const multiplier = is_round_trip ? 2 : 1;
  const totalKm = Math.round(distanceKm * multiplier * 100) / 100;

  try {
    const settings = await query(
      `SELECT mileage_rate_per_km, mileage_currency FROM reimbursement_settings WHERE organization_id = $1`,
      [orgId]
    );
    const row = settings.rows[0];
    const ratePerKm = row ? parseFloat(row.mileage_rate_per_km) : 0.67;
    const currency = row?.mileage_currency ?? 'USD';
    const calculatedAmount = Math.round(totalKm * ratePerKm * 100) / 100;
    const payload: Record<string, unknown> = {
      origin_address,
      destination_address,
      distance_km: totalKm,
      rate_per_km: ratePerKm,
      calculated_amount: calculatedAmount,
      currency,
      is_round_trip: !!is_round_trip,
    };
    if (durationMinutes != null) payload.duration_minutes = durationMinutes;
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to calculate mileage' });
  }
});

export const mileageRouter = router;

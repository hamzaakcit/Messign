/**
 * Fal must receive the reference image as a URL it can fetch or as a data URI.
 * Supabase (and other hosts) may block Fal's servers — we fetch on our backend and send base64.
 *
 * Huge data URIs (e.g. 900k+ chars) make Fal queue requests slow and often hit **Gateway Timeout**.
 * We aggressively cap pixel size and JPEG bytes while keeping enough detail for Kontext (~1280px).
 */
import sharp from 'sharp';

const MAX_FETCH_BYTES = 25 * 1024 * 1024;

/** Longest edge for first pass — more pixels help Kontext match lighting/texture (still capped by byte budget). */
const REFERENCE_MAX_EDGE_PX = 1440;

/** If still over this after first encode, shrink further (second pass). */
const MAX_JPEG_BYTES_BEFORE_SHRINK_AGAIN = 400_000;

const REFERENCE_FALLBACK_EDGE_PX = 960;
const REFERENCE_LAST_RESORT_EDGE_PX = 768;
const JPEG_Q_PRIMARY = 83;
const JPEG_Q_FALLBACK = 74;
const JPEG_Q_LAST_RESORT = 68;

export interface PreparedReferenceForFal {
  /** `data:image/jpeg;base64,...` for Fal `image_url`. */
  dataUri: string;
  /** Pixel width after resize/encode (for Fal `aspect_ratio`). */
  width: number;
  /** Pixel height after resize/encode. */
  height: number;
}

async function encodeReferenceJpeg(buf: Buffer, maxEdge: number, quality: number): Promise<Buffer> {
  const pipeline = sharp(buf).rotate();
  const meta = await sharp(buf).metadata();
  let img = pipeline;
  if (meta.width && meta.height && (meta.width > maxEdge || meta.height > maxEdge)) {
    img = img.resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  return img.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
}

async function encodeReferenceJpegLastResort(buf: Buffer): Promise<Buffer> {
  return encodeReferenceJpeg(buf, REFERENCE_LAST_RESORT_EDGE_PX, JPEG_Q_LAST_RESORT);
}

/** Same header rules as {@link ./storage.ts} storageAuthHeaders — avoid importing to prevent cycles. */
function storageServiceAuthHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (key.startsWith('sb_')) {
    return { apikey: key };
  }
  return { Authorization: `Bearer ${key}` };
}

/**
 * Public Supabase URLs can 403 when the bucket is not public; service role can still read the object.
 */
async function fetchSupabaseReferenceWithServiceRoleIfPossible(publicOrAuthUrl: string): Promise<Buffer | null> {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!base || !serviceKey) return null;
  const prefix = `${base}/storage/v1/object/public/`;
  if (!publicOrAuthUrl.startsWith(prefix)) return null;
  const rest = publicOrAuthUrl.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const objectPath = rest.slice(slash + 1);
  if (!bucket || !objectPath) return null;
  const authUrl = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')}`;
  const res = await fetch(authUrl, { redirect: 'follow', headers: storageServiceAuthHeaders() });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Normalizes URL before download (e.g. upgrade http → https for Supabase).
 */
export function normalizeReferenceImageUrlForDownload(url: string): string {
  const t = url.trim();
  if (/^http:\/\//i.test(t) && /\.supabase\.co\//i.test(t)) {
    return `https://${t.slice('http://'.length)}`;
  }
  return t;
}

function isMockStorageUrl(url: string): boolean {
  return /storage\.mock\.local/i.test(url);
}

/**
 * Fetches raw bytes for a reference image. Tries anonymous GET, then Supabase service-role download.
 */
export async function fetchReferenceImageBufferForFal(url: string): Promise<Buffer> {
  const normalized = normalizeReferenceImageUrlForDownload(url);
  if (isMockStorageUrl(normalized)) {
    throw new Error(
      'Reference image editing needs a real storage URL. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY so uploads persist to Supabase (dev mock URLs are not downloadable).',
    );
  }

  const res = await fetch(normalized, { redirect: 'follow' });
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('Reference image download was empty.');
    return buf;
  }

  /** Private buckets or edge quirks: anonymous GET fails; service role can still read the object path. */
  const viaService = await fetchSupabaseReferenceWithServiceRoleIfPossible(normalized);
  if (viaService && viaService.length > 0) {
    console.log('[falReferenceImage] fetched_via_service_role', { bytes: viaService.length });
    return viaService;
  }

  throw new Error(
    `Could not download reference image (HTTP ${res.status}). Re-upload the photo or check bucket policies / URL.`,
  );
}

/**
 * Downloads the reference image, normalizes to a small JPEG, returns a data URI and dimensions for Fal.
 */
export async function prepareReferenceImageDataUriForFal(httpsUrl: string): Promise<PreparedReferenceForFal> {
  const buf = await fetchReferenceImageBufferForFal(httpsUrl);
  if (buf.length === 0) {
    throw new Error('Reference image download was empty.');
  }
  if (buf.length > MAX_FETCH_BYTES) {
    throw new Error(`Reference image is too large (max ${Math.floor(MAX_FETCH_BYTES / (1024 * 1024))}MB).`);
  }

  let jpeg = await encodeReferenceJpeg(buf, REFERENCE_MAX_EDGE_PX, JPEG_Q_PRIMARY);
  let usedMaxEdge = REFERENCE_MAX_EDGE_PX;
  if (jpeg.length > MAX_JPEG_BYTES_BEFORE_SHRINK_AGAIN) {
    jpeg = await encodeReferenceJpeg(buf, REFERENCE_FALLBACK_EDGE_PX, JPEG_Q_FALLBACK);
    usedMaxEdge = REFERENCE_FALLBACK_EDGE_PX;
  }
  if (jpeg.length > MAX_JPEG_BYTES_BEFORE_SHRINK_AGAIN) {
    jpeg = await encodeReferenceJpegLastResort(buf);
    usedMaxEdge = REFERENCE_LAST_RESORT_EDGE_PX;
  }

  const metaOut = await sharp(jpeg).metadata();
  const width = metaOut.width && metaOut.width > 0 ? metaOut.width : 1;
  const height = metaOut.height && metaOut.height > 0 ? metaOut.height : 1;

  const b64 = jpeg.toString('base64');
  const dataUri = `data:image/jpeg;base64,${b64}`;
  console.log('[falReferenceImage] prepared', {
    jpegBytes: jpeg.length,
    dataUriChars: dataUri.length,
    maxEdge: usedMaxEdge,
    width,
    height,
  });
  return { dataUri, width, height };
}

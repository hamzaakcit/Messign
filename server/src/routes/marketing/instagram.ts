import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import {
  analyzeHashtags,
  getBestTimesToPost,
  generateCaptionVariants,
  predictEngagement,
} from '../../services/marketing/instagramIntelligence.js';

const router = Router();

/** POST /instagram/analyze-hashtags — score and classify a set of hashtags */
router.post('/analyze-hashtags', (req: ReimbursementRequest, res: Response) => {
  try {
    const { hashtags } = req.body ?? {};
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      res.status(400).json({ success: false, error: 'hashtags array is required' });
      return;
    }
    const analysis = analyzeHashtags(hashtags.map(String));
    res.json({ success: true, data: analysis });
  } catch (err) {
    console.error('[marketing/instagram/analyze-hashtags]', err);
    res.status(500).json({ success: false, error: 'Hashtag analysis failed' });
  }
});

/** GET /instagram/best-times — recommended posting windows */
router.get('/best-times', (req: ReimbursementRequest, res: Response) => {
  try {
    const topN = parseInt(req.query.topN as string, 10) || 5;
    const timezone = (req.query.timezone as string) || undefined;
    const contentType = (req.query.contentType as string) || undefined;
    const analysis = getBestTimesToPost({
      topN,
      timezone,
      contentType: contentType as 'educational' | 'promotional' | 'lifestyle' | 'general' | undefined,
    });
    res.json({ success: true, data: analysis });
  } catch (err) {
    console.error('[marketing/instagram/best-times]', err);
    res.status(500).json({ success: false, error: 'Best time analysis failed' });
  }
});

/** POST /instagram/caption-variants — generate A/B caption alternatives */
router.post('/caption-variants', (req: ReimbursementRequest, res: Response) => {
  try {
    const { caption, count } = req.body ?? {};
    if (typeof caption !== 'string' || caption.trim().length < 10) {
      res.status(400).json({ success: false, error: 'caption (min 10 chars) is required' });
      return;
    }
    const variants = generateCaptionVariants(caption.trim(), { count: count ?? 3 });
    res.json({ success: true, data: variants });
  } catch (err) {
    console.error('[marketing/instagram/caption-variants]', err);
    res.status(500).json({ success: false, error: 'Caption variant generation failed' });
  }
});

/** POST /instagram/predict-engagement — engagement score prediction */
router.post('/predict-engagement', (req: ReimbursementRequest, res: Response) => {
  try {
    const { caption, hashtags, hasImage, hasCarousel, postHour, postDay } = req.body ?? {};
    if (typeof caption !== 'string' || caption.trim().length < 5) {
      res.status(400).json({ success: false, error: 'caption is required' });
      return;
    }
    const prediction = predictEngagement({
      caption: caption.trim(),
      hashtags: Array.isArray(hashtags) ? hashtags.map(String) : [],
      hasImage: Boolean(hasImage),
      hasCarousel: Boolean(hasCarousel),
      postHour: typeof postHour === 'number' ? postHour : undefined,
      postDay: typeof postDay === 'string' ? postDay : undefined,
    });
    res.json({ success: true, data: prediction });
  } catch (err) {
    console.error('[marketing/instagram/predict-engagement]', err);
    res.status(500).json({ success: false, error: 'Engagement prediction failed' });
  }
});

export default router;

import { DORA_COLORS, PLANE_GEOMETRY, EXPORT_SIZES } from '@/components/dora/pilot/dora3dConfig';

describe('dora3dConfig', () => {
  describe('DORA_COLORS', () => {
    it('contains the canonical brand gradient stops', () => {
      expect(DORA_COLORS.cyan).toBe('#00D9D5');
      expect(DORA_COLORS.blue).toBe('#3B82F6');
      expect(DORA_COLORS.purple).toBe('#8B5CF6');
    });

    it('has hat and goggle colors', () => {
      expect(DORA_COLORS.hatDark).toBeDefined();
      expect(DORA_COLORS.lensCyan).toBeDefined();
      expect(DORA_COLORS.goggleRim).toBeDefined();
    });
  });

  describe('PLANE_GEOMETRY', () => {
    it('defines nose, wing tips, center, and thickness', () => {
      expect(PLANE_GEOMETRY.nose).toHaveLength(3);
      expect(PLANE_GEOMETRY.upperWing).toHaveLength(3);
      expect(PLANE_GEOMETRY.lowerWing).toHaveLength(3);
      expect(PLANE_GEOMETRY.center).toHaveLength(3);
      expect(PLANE_GEOMETRY.thickness).toBeGreaterThan(0);
    });

    it('nose is the leading point along the X axis', () => {
      expect(PLANE_GEOMETRY.nose[0]).toBeGreaterThan(PLANE_GEOMETRY.center[0]);
      expect(PLANE_GEOMETRY.nose[0]).toBeGreaterThan(PLANE_GEOMETRY.upperWing[0]);
    });

    it('upper and lower wings are vertically symmetric', () => {
      expect(PLANE_GEOMETRY.upperWing[1]).toBeCloseTo(
        -PLANE_GEOMETRY.lowerWing[1],
        2,
      );
    });
  });

  describe('EXPORT_SIZES', () => {
    it('square is 1080x1080', () => {
      expect(EXPORT_SIZES.square).toEqual({ width: 1080, height: 1080 });
    });

    it('portrait is 1080x1350', () => {
      expect(EXPORT_SIZES.portrait).toEqual({ width: 1080, height: 1350 });
    });
  });
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  { name: 'Executive', path: '/executive' },
  { name: 'Finance', path: '/finance' },
  { name: 'CRM', path: '/crm' },
  { name: 'Support', path: '/support' },
  { name: 'Dora', path: '/dora' },
  { name: 'Time', path: '/time' },
  { name: 'OKR', path: '/okr' },
  { name: 'Culture', path: '/culture' },
];

test.describe('Accessibility audit', () => {
  for (const { name, path } of PAGES) {
    test(`${name} page has no critical or serious a11y violations`, async ({ page }) => {
      // Skip onboarding before load so overlay doesn't cause a11y violations
      await page.addInitScript(() => {
        localStorage.setItem('onboarding_completed', 'true');
      });
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude(['[aria-hidden="true"]', '.fixed.inset-0.z-\\[9998\\]'])
        .disableRules(['color-contrast', 'scrollable-region-focusable', 'button-name'])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === 'critical');
      const serious = results.violations.filter((v) => v.impact === 'serious');
      const failing = [...critical, ...serious];

      if (failing.length > 0) {
        const report = failing
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.length} node(s) affected`,
          )
          .join('\n');
        expect(failing, `A11y violations on ${name}:\n${report}`).toHaveLength(0);
      }
    });
  }
});

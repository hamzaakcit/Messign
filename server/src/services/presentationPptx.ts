// @ts-ignore
const PptxGenJS = require('pptxgenjs');

export interface PresentationSlide {
  title: string;
  bullets: string[];
}

export interface Presentation {
  title: string;
  slides: PresentationSlide[];
}

export async function buildPptxBuffer(presentation: Presentation): Promise<Buffer> {
  const pptx = new PptxGenJS();

  const titleSlide = pptx.addSlide();
  titleSlide.addText(presentation.title, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    align: 'center',
  });

  for (const slide of presentation.slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.75,
      fontSize: 28,
      bold: true,
    });
    if (slide.bullets.length) {
      const bulletTexts = slide.bullets.map((text) => ({
        text,
        options: { bullet: true },
      }));
      s.addText(bulletTexts, {
        x: 0.5,
        y: 1.4,
        w: 9,
        h: 5.5,
        fontSize: 18,
      });
    }
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return buffer as Buffer;
}

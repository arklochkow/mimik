import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from 'docx';
import { i18n } from '@/core/env';
import { type Branding, dataUrlToBytes, fitLogo, loadBranding } from '@/core/export/branding';
import { type ExportOptions, IMAGE_SCALE_FACTORS, loadExportOptions } from '@/core/export/options';
import { blobToArrayBuffer, extractDomain, formatDate, stepContext } from '@/core/export/utils';
import { actionSteps, calloutAccent, isBlock, stepNumbers, tint } from '@/core/guides/blocks';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { logger } from '@/core/logger';
import { resolveViewport } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';

const DOCX_MAX_IMAGE_WIDTH = 520;
const DOCX_MAX_IMAGE_HEIGHT = 640; // px @ 96dpi, fits one page after margins
const DOCX_STEP_INDENT = 900;
const DOCX_FONT_FAMILY = 'Helvetica';

const MM = 56.7;
const dxa = (mm: number) => Math.round(mm * MM);
const px = (mm: number) => Math.round((mm / 25.4) * 96);

const MARGIN_MM = 18.5;
const CONTENT_MM = 210 - MARGIN_MM * 2;
const NUM_COL_MM = 22;
const COL_GAP_MM = 8;
const TEXT_COL_MM = CONTENT_MM - NUM_COL_MM - COL_GAP_MM;
const META_COL_MM = 43;
const LOGO_MAX_W = px(34);
const LOGO_MAX_H = px(15);
const BLOCK_SPACING_AFTER = 200;
const BLOCK_RULE_SIZE = 6;
const HEADING_SIZE = 28;
const CALLOUT_SIZE = 22;
const CALLOUT_BAR_SIZE = 18;
const CALLOUT_PAD_X_MM = 3;
const CALLOUT_PAD_Y_MM = 2;

const INK = '1E1B4B';
const MUTED = '6B7280';
const HAIR = 'E5E7EB';

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, right: NONE, bottom: NONE, left: NONE };

const bare = (hex: string) => hex.slice(1).toUpperCase();

/** Scale screenshot to fit page bounds without upscaling or distorting. */
export function fitDocxImageSize(
  screenshotWidth: number,
  screenshotHeight: number,
  leftIndent = 0,
): { width: number; height: number } {
  const maxWidth = DOCX_MAX_IMAGE_WIDTH - Math.round(leftIndent / 20);
  const scale = Math.min(maxWidth / screenshotWidth, DOCX_MAX_IMAGE_HEIGHT / screenshotHeight, 1);
  return {
    width: Math.max(1, Math.round(screenshotWidth * scale)),
    height: Math.max(1, Math.round(screenshotHeight * scale)),
  };
}

function plainCell(children: Paragraph[], widthMm: number, rightGapMm = 0, bottom = false): TableCell {
  return new TableCell({
    borders: NO_BORDERS,
    width: { size: dxa(widthMm), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: dxa(rightGapMm) },
    ...(bottom ? { verticalAlign: VerticalAlign.BOTTOM } : {}),
    children,
  });
}

function label(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: MUTED, size: 15, font: DOCX_FONT_FAMILY })],
  });
}

function buildLogoCell(brand: Branding): TableCell {
  const children: Paragraph[] = [];
  if (brand.logo) {
    try {
      const { width, height } = fitLogo(brand.logo, LOGO_MAX_W, LOGO_MAX_H);
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new ImageRun({ type: 'png', data: dataUrlToBytes(brand.logo.dataUrl), transformation: { width, height } }),
          ],
        }),
      );
    } catch (err) {
      logger.warn('DOCX: failed to embed brand logo', err);
    }
  }
  if (!children.length) children.push(new Paragraph({ children: [] }));
  return plainCell(children, 40);
}

function buildCover(guide: Guide, steps: Step[], domain: string | null, brand: Branding): Array<Paragraph | Table> {
  const accent = bare(brand.accent);

  const head = new Table({
    width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [dxa(CONTENT_MM - 40), dxa(40)],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          plainCell(
            [
              new Paragraph({
                spacing: { after: 360 },
                children: [
                  new TextRun({
                    text: i18n.t('export.guideLabel'),
                    bold: true,
                    color: MUTED,
                    size: 16,
                    font: DOCX_FONT_FAMILY,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: guide.title, bold: true, color: INK, size: 60, font: DOCX_FONT_FAMILY }),
                ],
              }),
              ...(guide.description
                ? [
                    new Paragraph({
                      spacing: { before: 220 },
                      children: [
                        new TextRun({ text: guide.description, color: MUTED, size: 22, font: DOCX_FONT_FAMILY }),
                      ],
                    }),
                  ]
                : []),
            ],
            CONTENT_MM - 40,
          ),
          buildLogoCell(brand),
        ],
      }),
    ],
  });

  const rule = new Paragraph({
    spacing: { before: 200, after: 280 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: INK, space: 4 } },
    children: [],
  });

  const metaKeys = [i18n.t('export.steps').toUpperCase(), i18n.t('export.created').toUpperCase()];
  const metaValues: Paragraph[][] = [
    [
      new Paragraph({
        children: [
          new TextRun({
            text: String(actionSteps(steps).length).padStart(2, '0'),
            bold: true,
            color: accent,
            size: 60,
            font: DOCX_FONT_FAMILY,
          }),
        ],
      }),
    ],
    [
      new Paragraph({
        children: [new TextRun({ text: formatDate(guide.createdAt), color: INK, size: 22, font: DOCX_FONT_FAMILY })],
      }),
    ],
  ];

  if (domain) {
    metaKeys.push(i18n.t('export.source').toUpperCase());
    metaValues.push([
      new Paragraph({
        children: [
          new ExternalHyperlink({
            link: `https://${domain}`,
            children: [new TextRun({ text: domain, color: accent, size: 22, font: DOCX_FONT_FAMILY })],
          }),
        ],
      }),
    ]);
  }

  const widths = metaKeys.map(() => META_COL_MM);
  const meta = new Table({
    width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths.map((w) => dxa(w)),
    rows: [
      new TableRow({ cantSplit: true, children: metaKeys.map((k) => plainCell([label(k)], META_COL_MM, 4, true)) }),
      new TableRow({ cantSplit: true, children: metaValues.map((v) => plainCell(v, META_COL_MM, 4, true)) }),
    ],
  });

  return [head, rule, meta];
}

async function buildImageParagraph(
  screenshot: Screenshot,
  stepIndex: number,
  scale: number,
): Promise<Paragraph | null> {
  try {
    const arrayBuffer = await blobToArrayBuffer(await renderScreenshot(screenshot, { format: 'image/png' }));
    const viewport = resolveViewport(screenshot);
    const fitted = fitDocxImageSize(viewport.width, viewport.height, DOCX_STEP_INDENT / 2);
    const width = Math.max(1, Math.round(fitted.width * scale));
    const height = Math.max(1, Math.round(fitted.height * scale));

    return new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new ImageRun({ type: 'png', data: new Uint8Array(arrayBuffer), transformation: { width, height } })],
    });
  } catch (err) {
    logger.warn('DOCX: failed to render screenshot for step', stepIndex, err);
    return null;
  }
}

function buildHeadingParagraph(step: Step): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: BLOCK_RULE_SIZE, color: INK, space: 4 } },
    children: [
      new TextRun({ text: step.description, bold: true, color: INK, size: HEADING_SIZE, font: DOCX_FONT_FAMILY }),
    ],
  });
}

function buildCalloutTable(step: Step): Table {
  const accent = calloutAccent(step);

  return new Table({
    width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [dxa(CONTENT_MM)],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            borders: {
              ...NO_BORDERS,
              left: { style: BorderStyle.SINGLE, size: CALLOUT_BAR_SIZE, color: bare(accent) },
            },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: bare(tint(accent)) },
            width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
            margins: {
              top: dxa(CALLOUT_PAD_Y_MM),
              bottom: dxa(CALLOUT_PAD_Y_MM),
              left: dxa(CALLOUT_PAD_X_MM),
              right: dxa(CALLOUT_PAD_X_MM),
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: step.description, color: INK, size: CALLOUT_SIZE, font: DOCX_FONT_FAMILY }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function buildStepTable(
  step: Step,
  number: number,
  screenshot: Screenshot | undefined,
  brand: Branding,
  opts: ExportOptions,
): Promise<Table> {
  const accent = bare(brand.accent);
  const stepNumber = String(number).padStart(2, '0');
  const stepCtx = opts.stepUrls ? stepContext(step, 64) : null;

  const textChildren: Paragraph[] = [
    new Paragraph({
      spacing: { after: 140 },
      children: [
        new TextRun({ text: step.description, bold: true, color: INK, size: 22, font: DOCX_FONT_FAMILY }),
        ...(stepCtx
          ? [
              new TextRun({ text: '   ·   ', color: MUTED, size: 18, font: DOCX_FONT_FAMILY }),
              stepCtx.href
                ? new ExternalHyperlink({
                    link: stepCtx.href,
                    children: [
                      new TextRun({
                        text: stepCtx.label,
                        color: accent,
                        underline: { type: UnderlineType.SINGLE, color: accent },
                        size: 18,
                        font: DOCX_FONT_FAMILY,
                      }),
                    ],
                  })
                : new TextRun({ text: stepCtx.label, color: accent, size: 18, font: DOCX_FONT_FAMILY }),
            ]
          : []),
      ],
    }),
  ];

  if (screenshot) {
    const imageParagraph = await buildImageParagraph(screenshot, step.index, IMAGE_SCALE_FACTORS[opts.imageScale]);
    if (imageParagraph) textChildren.push(imageParagraph);
  }

  return new Table({
    width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [dxa(NUM_COL_MM + COL_GAP_MM), dxa(TEXT_COL_MM)],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          plainCell(
            [
              new Paragraph({
                children: [
                  new TextRun({ text: stepNumber, bold: true, color: accent, size: 60, font: DOCX_FONT_FAMILY }),
                ],
              }),
            ],
            NUM_COL_MM + COL_GAP_MM,
          ),
          new TableCell({
            borders: { ...NO_BORDERS, top: { style: BorderStyle.SINGLE, size: 6, color: INK } },
            width: { size: dxa(TEXT_COL_MM), type: WidthType.DXA },
            margins: { top: dxa(2), bottom: 0, left: 0, right: 0 },
            children: textChildren,
          }),
        ],
      }),
    ],
  });
}

function buildFooter(brand: Branding): Footer {
  const children: TextRun[] = [
    new TextRun({ text: brand.footer, color: MUTED, size: 16, font: DOCX_FONT_FAMILY }),
    new TextRun({
      text: `\t${brand.attribution ? i18n.t('export.madeWith') : ''}\t`,
      color: MUTED,
      size: 16,
      font: DOCX_FONT_FAMILY,
    }),
    new TextRun({
      children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
      color: MUTED,
      size: 16,
      font: DOCX_FONT_FAMILY,
    }),
  ];

  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 6 } },
        tabStops: [
          { type: 'center', position: dxa(CONTENT_MM / 2) },
          { type: 'right', position: dxa(CONTENT_MM) },
        ],
        children,
      }),
    ],
  });
}

function buildHeader(guide: Guide, brand: Branding, withLogo: boolean): Header {
  const titleRun = new TextRun({ text: guide.title, bold: true, color: INK, size: 16, font: DOCX_FONT_FAMILY });

  if (!withLogo || !brand.logo) {
    return new Header({
      children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 4 } },
          children: [titleRun],
        }),
      ],
    });
  }

  const { width, height } = fitLogo(brand.logo, px(18), px(7));
  return new Header({
    children: [
      new Table({
        width: { size: dxa(CONTENT_MM), type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [dxa(CONTENT_MM - 22), dxa(22)],
        borders: {
          top: NONE,
          right: NONE,
          left: NONE,
          insideHorizontal: NONE,
          insideVertical: NONE,
          bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR },
        },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              plainCell([new Paragraph({ children: [titleRun] })], CONTENT_MM - 22),
              plainCell(
                [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new ImageRun({
                        type: 'png',
                        data: dataUrlToBytes(brand.logo.dataUrl),
                        transformation: { width, height },
                      }),
                    ],
                  }),
                ],
                22,
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

export async function exportGuideAsDOCX(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
  options?: ExportOptions,
): Promise<Blob> {
  const opts = options ?? (await loadExportOptions());
  const domain = extractDomain(steps);
  const brand = await loadBranding();

  const children: Array<Paragraph | Table> = opts.cover
    ? buildCover(guide, steps, domain, brand)
    : guide.description
      ? [
          new Paragraph({
            spacing: { after: 320 },
            children: [new TextRun({ text: guide.description, color: MUTED, size: 22, font: DOCX_FONT_FAMILY })],
          }),
        ]
      : [];
  const numbers = stepNumbers(steps);

  for (const [i, step] of steps.entries()) {
    if (i === 0 && opts.cover) {
      children.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 120 }, children: [] }));
    }
    if (isBlock(step)) {
      children.push(step.blockType === 'heading' ? buildHeadingParagraph(step) : buildCalloutTable(step));
      children.push(new Paragraph({ spacing: { after: BLOCK_SPACING_AFTER }, children: [] }));
      continue;
    }
    children.push(
      await buildStepTable(
        step,
        numbers.get(step.id) ?? 0,
        opts.screenshots ? screenshots.get(step.id) : undefined,
        brand,
        opts,
      ),
    );
    children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: DOCX_FONT_FAMILY } } } },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: dxa(MARGIN_MM),
              bottom: dxa(MARGIN_MM),
              left: dxa(MARGIN_MM),
              right: dxa(MARGIN_MM),
            },
          },
          titlePage: opts.cover,
        },
        headers: {
          default: buildHeader(guide, brand, !opts.cover),
          ...(opts.cover ? { first: new Header({ children: [new Paragraph({ children: [] })] }) } : {}),
        },
        footers: {
          default: buildFooter(brand),
          ...(opts.cover ? { first: buildFooter(brand) } : {}),
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

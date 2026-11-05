import { chromium } from 'playwright';
import { driverReportHtml } from './driver-report.service';
import { HttpError } from '../middleware/errorHandler';

let rendering = 0;
/** Render the authorized, current backend snapshot. Never load remote URLs or private
 * document links in Chromium; originals are downloaded through the ownership guard. */
export async function driverPdf(id: string): Promise<Buffer> {
  return renderBackendPdf(await driverReportHtml(id));
}
export async function renderBackendPdf(html: string, shareable = false): Promise<Buffer> {
  if (rendering >= 2) throw new HttpError(503, 'PDF_BUSY', 'Two reports are being generated. Please try again shortly.');
  rendering++;
  try {
    const browser = await chromium.launch({ headless: true, timeout: 15000,
      ...(process.env.DRIVER_PDF_CHROMIUM_PATH ? { executablePath: process.env.DRIVER_PDF_CHROMIUM_PATH } : {}) });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.route('**/*', route => route.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '18mm', left: '12mm', right: '12mm' },
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: (shareable ? '<div style="font:9px Arial;width:100%;text-align:center">Mera Driver | Resume | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>' : '<div style="font:9px Arial;width:100%;text-align:center">Mera Driver · Confidential · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>') });
    } finally { await browser.close(); }
  } finally { rendering--; }
}

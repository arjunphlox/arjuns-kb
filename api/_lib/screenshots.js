/**
 * Full-page screenshots at three responsive widths, returned as WebP
 * buffers. Designed for /api/reenrich so the panel slider can surface
 * 1440w / 640w / 360w captures alongside OG + manual images.
 *
 * Every heavy dependency is lazy-required inside launchBrowser so the
 * module loads even when puppeteer-core / @sparticuz/chromium aren't
 * installed (e.g. Vercel bundles that exclude chromium for size). If
 * the load throws, launchBrowser returns null and captureScreenshots
 * returns [] — Enrich succeeds without screenshots.
 *
 * Set STELLO_DISABLE_SCREENSHOTS=1 to skip attempting the launch
 * entirely (useful for Vercel Hobby where the bundle doesn't include
 * chromium).
 */
const DEFAULT_WIDTHS = [1440, 640, 360];

async function captureScreenshots(url, opts = {}) {
  const widths = Array.isArray(opts.widths) ? opts.widths : DEFAULT_WIDTHS;
  const browser = await launchBrowser();
  if (!browser) return [];

  const out = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    // Single load; we resize viewport between shots so layout reflows
    // correctly without triple-navigation cost.
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    // Small settle for lazy-loaded assets above the fold.
    await page.waitForTimeout?.(400).catch(() => {});

    for (const width of widths) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      // A reflow + short settle after viewport change so responsive CSS lands.
      await new Promise(r => setTimeout(r, 250));
      try {
        const buffer = await page.screenshot({
          fullPage: true,
          type: 'webp',
          quality: 78,
        });
        out.push({ width, buffer });
      } catch (err) {
        console.warn('screenshots: shot failed', url, width, err.message);
      }
    }
  } catch (err) {
    console.warn('screenshots: top-level failure', url, err.message);
  } finally {
    try { await browser.close(); } catch {}
  }
  return out;
}

async function launchBrowser() {
  if (process.env.STELLO_DISABLE_SCREENSHOTS === '1') return null;
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  try {
    let puppeteerCore;
    try { puppeteerCore = require('puppeteer-core'); }
    catch { console.warn('screenshots: puppeteer-core not installed'); return null; }

    if (isServerless) {
      let chromium;
      try { chromium = require('@sparticuz/chromium'); }
      catch { console.warn('screenshots: @sparticuz/chromium not installed'); return null; }
      return await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: { width: 1440, height: 900 },
        executablePath: await chromium.executablePath(),
        headless: 'shell',
      });
    }
    // Local dev: prefer an explicit path, fall back to the canonical
    // Chrome install location on macOS. If neither works, we bail.
    const exec = process.env.PUPPETEER_EXECUTABLE_PATH
      || process.env.CHROMIUM_EXECUTABLE_PATH
      || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return await puppeteerCore.launch({
      executablePath: exec,
      headless: 'shell',
      defaultViewport: { width: 1440, height: 900 },
    });
  } catch (err) {
    console.warn('screenshots: browser launch failed', err.message);
    return null;
  }
}

module.exports = { captureScreenshots, DEFAULT_WIDTHS };

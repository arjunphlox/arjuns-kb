/**
 * Single viewport screenshot at 1440×900, returned as a WebP buffer.
 * Designed for /api/reenrich so the panel slider gets a predictable
 * desktop-viewport thumbnail alongside OG + manual + extracted images.
 *
 * Previous version captured three full-page widths (1440/640/360). That
 * produced three slider entries per item with wildly variable aspect
 * ratios — slider layout had to handle each separately. Switched to one
 * fixed viewport so the slider thumbnail size is predictable.
 *
 * Every heavy dependency is lazy-required inside launchBrowser so the
 * module loads even when puppeteer-core / @sparticuz/chromium aren't
 * installed (e.g. Vercel bundles that exclude chromium for size). If
 * the load throws, launchBrowser returns null and captureScreenshot
 * returns null — re-enrichment succeeds without a screenshot.
 *
 * Set STELLO_DISABLE_SCREENSHOTS=1 to skip attempting the launch
 * entirely (useful for Vercel Hobby where the bundle doesn't include
 * chromium).
 */
const SHOT_WIDTH = 1440;
const SHOT_HEIGHT = 900;

async function captureScreenshot(url) {
  const browser = await launchBrowser();
  if (!browser) return null;

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: SHOT_WIDTH, height: SHOT_HEIGHT, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    // Small settle for lazy-loaded assets above the fold.
    await page.waitForTimeout?.(400).catch(() => {});

    const buffer = await page.screenshot({
      fullPage: false,
      type: 'webp',
      quality: 78,
    });
    return { buffer, width: SHOT_WIDTH, height: SHOT_HEIGHT };
  } catch (err) {
    console.warn('screenshots: capture failed', url, err.message);
    return null;
  } finally {
    try { await browser.close(); } catch {}
  }
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
        defaultViewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
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
      defaultViewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
    });
  } catch (err) {
    console.warn('screenshots: browser launch failed', err.message);
    return null;
  }
}

module.exports = { captureScreenshot, SHOT_WIDTH, SHOT_HEIGHT };

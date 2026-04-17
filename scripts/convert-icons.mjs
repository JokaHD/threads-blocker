import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../icons');

const sizes = [16, 48, 128];

async function convertSvgToPng() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const size of sizes) {
    const svgPath = resolve(iconsDir, `icon-${size}.svg`);
    const pngPath = resolve(iconsDir, `icon-${size}.png`);

    const svgContent = readFileSync(svgPath, 'utf-8');

    // Create HTML with SVG centered on transparent background
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; }
            body {
              width: ${size}px;
              height: ${size}px;
              background: transparent;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            svg { display: block; }
          </style>
        </head>
        <body>${svgContent}</body>
      </html>
    `;

    await page.setContent(html);
    await page.setViewportSize({ width: size, height: size });

    const screenshot = await page.screenshot({
      omitBackground: true,
      type: 'png'
    });

    writeFileSync(pngPath, screenshot);
    console.log(`Created: icon-${size}.png`);
  }

  await browser.close();
  console.log('Done!');
}

convertSvgToPng().catch(console.error);

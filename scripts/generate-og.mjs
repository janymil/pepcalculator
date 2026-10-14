/**
 * Social-preview (Open Graph) card generator.
 *
 * Writes `public/og-image.png` — the 1200x630 card Facebook, X, WhatsApp,
 * Telegram, Slack and LinkedIn show when someone pastes pepstool.com.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PUBLIC = resolve(HERE, '..', 'public', 'og-image.png');
const OUT_DIST = resolve(HERE, '..', 'dist', 'og-image.png');

const SITE = 'pepstool.com';
const WIDTH = 1200;
const HEIGHT = 630;

const CARD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 1200px;
        height: 630px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background-color: #061110;
        color: #ffffff;
        -webkit-font-smoothing: antialiased;
      }

      /* Ambient background lights and grid */
      .bg {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 80% 40%, rgba(20, 184, 166, 0.28) 0%, rgba(13, 148, 136, 0.08) 45%, transparent 70%),
          radial-gradient(circle at 15% 15%, rgba(45, 212, 191, 0.18) 0%, transparent 50%),
          radial-gradient(circle at 40% 90%, rgba(15, 118, 110, 0.22) 0%, transparent 60%),
          #061110;
      }
      .grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 40px 40px;
      }

      .container {
        position: relative;
        z-index: 10;
        width: 1200px;
        height: 630px;
        padding: 56px 64px;
        display: grid;
        grid-template-columns: 500px 1fr;
        gap: 44px;
        align-items: center;
      }

      /* Left side: Branding & Hero text */
      .left {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .brand-row {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 24px;
      }
      .logo-icon {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%);
        box-shadow: 0 8px 20px rgba(20, 184, 166, 0.4);
        display: grid;
        place-items: center;
      }
      .logo-icon svg { width: 28px; height: 28px; }
      .brand-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #ffffff;
      }
      .brand-badge {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #2dd4bf;
        background: rgba(45, 212, 191, 0.12);
        border: 1px solid rgba(45, 212, 191, 0.3);
        padding: 4px 10px;
        border-radius: 20px;
        text-transform: uppercase;
      }

      h1 {
        font-size: 44px;
        font-weight: 800;
        line-height: 1.14;
        letter-spacing: -1.2px;
        color: #ffffff;
        margin-bottom: 16px;
      }
      h1 span {
        background: linear-gradient(90deg, #5eead4 0%, #2dd4bf 50%, #99f6e4 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .desc {
        font-size: 18px;
        line-height: 1.45;
        color: #94a3b8;
        margin-bottom: 28px;
        font-weight: 400;
      }

      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 32px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        padding: 7px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
      }
      .pill-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #14b8a6;
        box-shadow: 0 0 8px #14b8a6;
      }

      .footer-tag {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 15px;
        font-weight: 600;
        color: #64748b;
      }
      .footer-tag strong {
        color: #2dd4bf;
      }

      /* Right side: Mockup Card */
      .card-wrap {
        position: relative;
      }
      .card-glow {
        position: absolute;
        inset: -4px;
        border-radius: 28px;
        background: linear-gradient(135deg, rgba(45, 212, 191, 0.4) 0%, rgba(13, 148, 136, 0.05) 60%, rgba(20, 184, 166, 0.3) 100%);
        filter: blur(12px);
        opacity: 0.7;
      }
      .app-card {
        position: relative;
        background: rgba(11, 26, 24, 0.88);
        border: 1.5px solid rgba(45, 212, 191, 0.28);
        border-radius: 24px;
        padding: 28px 30px;
        box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 14px;
        margin-bottom: 20px;
      }
      .card-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .circle { width: 10px; height: 10px; border-radius: 50%; }
      .c-red { background: #ef4444; }
      .c-yellow { background: #eab308; }
      .c-green { background: #22c55e; }
      .card-header-title {
        margin-left: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .status-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: #2dd4bf;
        background: rgba(45, 212, 191, 0.12);
        padding: 4px 10px;
        border-radius: 20px;
      }
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #2dd4bf;
        box-shadow: 0 0 6px #2dd4bf;
      }

      /* 3-column input preview */
      .inputs-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      .input-box {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 12px;
        padding: 10px 12px;
      }
      .input-lbl {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        margin-bottom: 4px;
        letter-spacing: 0.4px;
      }
      .input-val {
        font-size: 16px;
        font-weight: 700;
        color: #ffffff;
      }
      .input-sub {
        font-size: 11px;
        color: #2dd4bf;
        font-weight: 500;
      }

      /* Big Result Box */
      .result-banner {
        background: linear-gradient(135deg, rgba(13, 148, 136, 0.28) 0%, rgba(15, 118, 110, 0.12) 100%);
        border: 1.5px solid rgba(45, 212, 191, 0.4);
        border-radius: 16px;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 22px;
      }
      .result-left .result-lbl {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #5eead4;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .result-left .result-main {
        font-size: 42px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.5px;
        color: #ffffff;
      }
      .result-left .result-main span {
        font-size: 24px;
        font-weight: 600;
        color: #2dd4bf;
        margin-left: 6px;
      }
      .result-right {
        text-align: right;
      }
      .result-tag {
        font-size: 13px;
        font-weight: 700;
        background: #14b8a6;
        color: #042f2e;
        padding: 5px 12px;
        border-radius: 8px;
        display: inline-block;
        margin-bottom: 4px;
      }
      .result-detail {
        font-size: 12px;
        color: #94a3b8;
      }

      /* Syringe visualizer container */
      .syringe-card {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 14px 16px;
      }
      .syringe-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .syringe-title-row strong {
        color: #e2e8f0;
      }

      /* Custom Syringe SVG */
      .syringe-svg {
        width: 100%;
        height: 60px;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="bg"></div>
    <div class="grid"></div>

    <div class="container">
      <!-- Left Column -->
      <div class="left">
        <div class="brand-row">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m18 2 4 4" />
              <path d="m17 7 3-3" />
              <path d="M19 9 8.7 19.3c-.4.4-1 .6-1.6.6H3v-4.1c0-.6.2-1.2.6-1.6L14 3.9" />
              <path d="m9 11 4 4" />
              <path d="m5 19-3 3" />
              <path d="m14 4 6 6" />
            </svg>
          </div>
          <span class="brand-title">PepCalculator</span>
          <span class="brand-badge">${SITE}</span>
        </div>

        <h1>Turn Any Peptide Dose <span>Into Syringe Units</span></h1>
        <p class="desc">
          Instant reconstitution and dosing calculator for peptides, GLP-1 pens, and research compounds. See the exact syringe mark to draw.
        </p>

        <div class="pills">
          <div class="pill"><span class="pill-dot"></span>Visual Syringe (U-100 &amp; U-40)</div>
          <div class="pill"><span class="pill-dot"></span>Reconstitution Math &amp; mL</div>
          <div class="pill"><span class="pill-dot"></span>100% Free &amp; Offline PWA</div>
        </div>

        <div class="footer-tag">
          <span>Official Domain: <strong>${SITE}</strong></span>
          <span>&bull;</span>
          <span>Zero Sign-Up Required</span>
        </div>
      </div>

      <!-- Right Column -->
      <div class="card-wrap">
        <div class="card-glow"></div>
        <div class="app-card">
          <!-- Top bar -->
          <div class="card-header">
            <div class="card-header-left">
              <span class="circle c-red"></span>
              <span class="circle c-yellow"></span>
              <span class="circle c-green"></span>
              <span class="card-header-title">Dose Calculator</span>
            </div>
            <div class="status-pill">
              <span class="status-dot"></span>
              CALCULATED
            </div>
          </div>

          <!-- Input summary row -->
          <div class="inputs-grid">
            <div class="input-box">
              <div class="input-lbl">Vial Size</div>
              <div class="input-val">10 mg</div>
              <div class="input-sub">BPC-157</div>
            </div>
            <div class="input-box">
              <div class="input-lbl">BAC Water</div>
              <div class="input-val">2.0 mL</div>
              <div class="input-sub">Reconstituted</div>
            </div>
            <div class="input-box">
              <div class="input-lbl">Target Dose</div>
              <div class="input-val">250 mcg</div>
              <div class="input-sub">0.25 mg</div>
            </div>
          </div>

          <!-- Big Hero Result Banner -->
          <div class="result-banner">
            <div class="result-left">
              <div class="result-lbl">Draw On Syringe</div>
              <div class="result-main">5.0 Units <span>(0.05 mL)</span></div>
            </div>
            <div class="result-right">
              <span class="result-tag">U-100 SYRINGE</span>
              <div class="result-detail">40 doses per vial</div>
            </div>
          </div>

          <!-- Visual Syringe -->
          <div class="syringe-card">
            <div class="syringe-title-row">
              <span>Visual Syringe Markings: <strong>1.0 mL (100 Units)</strong></span>
              <span style="color: #2dd4bf;">Plunger positioned at 5 units &bull;</span>
            </div>

            <svg class="syringe-svg" viewBox="0 0 520 70" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="liquid-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#0d9488" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#2dd4bf" stop-opacity="1" />
                </linearGradient>
                <linearGradient id="barrel-glass" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" />
                  <stop offset="50%" stop-color="#ffffff" stop-opacity="0.05" />
                  <stop offset="100%" stop-color="#ffffff" stop-opacity="0.15" />
                </linearGradient>
              </defs>

              <!-- Plunger rod behind barrel -->
              <rect x="15" y="27" width="105" height="12" rx="2" fill="#475569" opacity="0.6" />
              <!-- Plunger thumb rest -->
              <rect x="5" y="16" width="12" height="34" rx="3" fill="#64748b" />

              <!-- Syringe Barrel Body (starts at 100, ends at 460) -->
              <rect x="100" y="14" width="360" height="38" rx="7" fill="url(#barrel-glass)" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" />

              <!-- Flanges (wings) at back of barrel -->
              <rect x="94" y="8" width="8" height="50" rx="3" fill="#64748b" />

              <!-- Needle Hub & Needle -->
              <polygon points="460,24 476,27 476,39 460,42" fill="#0d9488" stroke="#14b8a6" stroke-width="1" />
              <rect x="476" y="31.5" width="40" height="3" rx="1.5" fill="#cbd5e1" />

              <!-- Plunger Stopper (Rubber tip inside barrel at 5 units) -->
              <!-- 0 units is at x=455, 100 units is at x=115. Total width 340px -> 3.4px per unit -->
              <!-- 5 units = 455 - 17 = 438px -->
              <rect x="424" y="16" width="14" height="34" rx="2" fill="#0f172a" />
              <rect x="428" y="16" width="6" height="34" fill="#334155" />

              <!-- Liquid in barrel from 438 to 460 -->
              <rect x="438" y="16" width="22" height="34" fill="url(#liquid-grad)" opacity="0.95" />

              <!-- Scale Marks along the barrel (0 to 100 units) -->
              <!-- Units: 0=455, 10=421, 20=387, 30=353, 40=319, 50=285, 60=251, 70=217, 80=183, 90=149, 100=115 -->
              <!-- Major tick marks with numbers -->
              <g stroke="rgba(255,255,255,0.85)" stroke-width="1.8">
                <!-- 0 -->
                <line x1="455" y1="14" x2="455" y2="28" />
                <!-- 5 (Target!) -->
                <line x1="438" y1="14" x2="438" y2="26" stroke="#2dd4bf" stroke-width="2.5" />
                <!-- 10 -->
                <line x1="421" y1="14" x2="421" y2="28" />
                <!-- 20 -->
                <line x1="387" y1="14" x2="387" y2="28" />
                <!-- 30 -->
                <line x1="353" y1="14" x2="353" y2="28" />
                <!-- 40 -->
                <line x1="319" y1="14" x2="319" y2="28" />
                <!-- 50 -->
                <line x1="285" y1="14" x2="285" y2="28" />
                <!-- 60 -->
                <line x1="251" y1="14" x2="251" y2="28" />
                <!-- 70 -->
                <line x1="217" y1="14" x2="217" y2="28" />
                <!-- 80 -->
                <line x1="183" y1="14" x2="183" y2="28" />
                <!-- 90 -->
                <line x1="149" y1="14" x2="149" y2="28" />
                <!-- 100 -->
                <line x1="115" y1="14" x2="115" y2="28" />
              </g>

              <!-- Minor tick marks -->
              <g stroke="rgba(255,255,255,0.4)" stroke-width="1">
                <line x1="404" y1="14" x2="404" y2="22" />
                <line x1="370" y1="14" x2="370" y2="22" />
                <line x1="336" y1="14" x2="336" y2="22" />
                <line x1="302" y1="14" x2="302" y2="22" />
                <line x1="268" y1="14" x2="268" y2="22" />
                <line x1="234" y1="14" x2="234" y2="22" />
                <line x1="200" y1="14" x2="200" y2="22" />
                <line x1="166" y1="14" x2="166" y2="22" />
                <line x1="132" y1="14" x2="132" y2="22" />
              </g>

              <!-- Numbers below marks -->
              <g fill="#94a3b8" font-size="10" font-weight="700" text-anchor="middle" font-family="sans-serif">
                <text x="455" y="44">0</text>
                <text x="438" y="44" fill="#2dd4bf" font-weight="900">5</text>
                <text x="421" y="44">10</text>
                <text x="387" y="44">20</text>
                <text x="353" y="44">30</text>
                <text x="319" y="44">40</text>
                <text x="285" y="44">50</text>
                <text x="217" y="44">70</text>
                <text x="115" y="44">100</text>
              </g>

              <!-- Target pointer badge -->
              <polygon points="438,2 432,-7 444,-7" fill="#2dd4bf" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`;

function findBrowser() {
  const candidates = [process.env.CHROME_PATH, process.env.CHROME_BIN].filter(Boolean);
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    candidates.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge');
  }
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

function render(browser, htmlPath, profileDir, outPath) {
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profileDir}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--virtual-time-budget=1500',
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

const browser = findBrowser();
if (!browser) {
  process.stderr.write('No Chrome/Edge found.\n');
  process.exit(1);
}

const work = mkdtempSync(resolve(tmpdir(), 'pepcalc-og-'));
const htmlPath = resolve(work, 'card.html');
const profileDir = resolve(work, 'profile');
writeFileSync(htmlPath, CARD_HTML, 'utf8');

try {
  render(browser, htmlPath, profileDir, OUT_PUBLIC);
  copyFileSync(OUT_PUBLIC, OUT_DIST);
  process.stdout.write(`Successfully generated ${WIDTH}x${HEIGHT} card to public/ and dist/og-image.png\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

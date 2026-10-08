// Bir playground sahnesini headless Chromium'da render edip PNG kaydeder.
// Kullanim:  node shot.mjs <scene.js yolu> [cikti.png] [bekleme ms] [genislik] [yukseklik]
// Ornek:     node shot.mjs ../beyblade-aura-scene.js aura.png 6000
// Tarayici:  npx playwright install chromium   (bir kez)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const [scenePath = '../beyblade-aura-scene.js', out = 'shot.png', wait = '6000', w = '1280', h = '720'] = process.argv.slice(2);
const sceneFile = path.resolve(process.cwd(), scenePath);

const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/scene.js' ? sceneFile : path.join(here, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error('SAYFA HATASI:', e.message));
page.on('console', (m) => m.type() === 'error' || m.type() === 'warning' ? console.log(m.type() + ':', m.text()) : null);
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log('kaydedildi:', out);
await browser.close();
server.close();

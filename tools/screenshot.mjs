#!/usr/bin/env node
// 用本机 Chrome 以手机尺寸截取 Expo web 页面，用于 UI 自查。
// 前置：cd mobile && npx expo start --web --port 8081
// 用法：node tools/screenshot.mjs [/:sleep,/daily:daily,...]   FULL=1 截整页
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'docs', 'screenshots');
const pages = (process.argv[2] ?? '/:sleep,/daily:daily,/sport:sport,/ability:ability').split(',');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: '/tmp/nowornever-chrome',
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('console', (m) => ['error', 'warn'].includes(m.type()) && console.log(`[${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

for (const p of pages) {
  const [route, name] = p.split(':');
  await page.goto(`http://localhost:8081${route}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: process.env.FULL === '1' });
  console.log('saved', name);
}
await browser.close();

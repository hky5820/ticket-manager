/* design/icons-2026-08/icon.svg 를 홈 화면용 PNG 로 굽는다.
     node tools/build-icons.mjs
   iOS 는 apple-touch-icon PNG 만 본다(매니페스트·SVG 무시).
   maskable 은 원형 마스크 안전영역(중심 80%) 안에 들도록 글리프만 0.86 으로 줄인다. */
import { createRequire } from 'module';
import fs from 'fs/promises';
const require = createRequire('C:/Users/Hong/Desktop/ticket-bots/node_modules/');
const { chromium } = require('playwright-core');
const ROOT='C:/Users/Hong/Desktop/TicketManager/';
const svg=await fs.readFile(ROOT+'design/icons-2026-08/icon.svg','utf8');
const maskable=svg.replace('<g id="glyph" transform="translate(266 262) scale(.9)">','<g id="glyph" transform="translate(262 262) scale(.78)">');
const OUT=[[512,'icon-512.png',svg],[512,'icon-maskable-512.png',maskable],[192,'icon-192.png',svg],[180,'icon-180.png',svg]];
const b=await chromium.launch();
try{
  for(const [size,file,src] of OUT){
    const p=await b.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    await p.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${src}`,{waitUntil:'load'});
    await p.screenshot({path:ROOT+file}); await p.close();
    console.log(`[ICON] ${file} ${size}x${size} · ${(await fs.stat(ROOT+file)).size}B`);
  }
}finally{ await b.close(); }

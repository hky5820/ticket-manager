/* design/icons-2026-08/icon.svg → 안드로이드 래퍼 앱 아이콘.
     node tools/build-android-icons.mjs
   adaptive foreground(432px, 글리프를 안전영역 66% 안에), legacy ic_launcher(192px). */
import { createRequire } from 'module';
import fs from 'fs/promises';
const require = createRequire('C:/Users/Hong/Desktop/ticket-bots/node_modules/');
const { chromium } = require('playwright-core');
const ROOT='C:/Users/Hong/Desktop/TicketManager/';
const RES=ROOT+'android/app/src/main/res/';
const svg=await fs.readFile(ROOT+'design/icons-2026-08/icon.svg','utf8');
const fg=svg.replace(/<rect width="512" height="512" fill="url\(#bgW\)"\/>\s*<rect width="512" height="512" fill="url\(#glowW\)"\/>/,'')
            .replace('<g id="glyph" transform="translate(262 262) scale(.92)">','<g id="glyph" transform="translate(256 256) scale(.64)">');
const b=await chromium.launch();
try{
  for(const [size,file,src,bg] of [[432,'mipmap-xxxhdpi/ic_launcher_foreground.png',fg,'transparent'],[192,'mipmap-xxxhdpi/ic_launcher.png',svg,'#fff']]){
    await fs.mkdir(RES+file.split('/')[0],{recursive:true});
    const p=await b.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    await p.setContent(`<style>html,body{margin:0;padding:0;background:${bg}}svg{display:block;width:${size}px;height:${size}px}</style>${src}`,{waitUntil:'load'});
    await p.screenshot({path:RES+file,omitBackground:bg==='transparent'}); await p.close();
    console.log(`[ICON] ${file} ${size}px · ${(await fs.stat(RES+file)).size}B`);
  }
}finally{ await b.close(); }

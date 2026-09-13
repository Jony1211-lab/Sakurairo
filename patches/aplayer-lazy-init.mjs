/**
 * 播放器半懒初始化补丁
 *
 * 主题自带的 app.js 在页面就绪/pjax 回调里立刻初始化 APlayer（加载 6004/1383 chunk
 * 并请求 Meting 歌单 API），与首屏渲染抢资源。本补丁把初始化推迟到浏览器空闲时
 * （requestIdleCallback，降级 setTimeout 3 秒），点击播放行为不受影响。
 *
 * 用法：  node patches/aplayer-lazy-init.mjs
 * 场景：主题自动更新覆盖 js/app.js 后重跑一次即可；重复执行自动跳过。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, 'js', 'app.js');

// 与 app.js 中的原文严格一致（以压缩产物为准，主题更新后若失效需重新比对）
const OLD = '_iro.float_player_on&&((0,m.F)()||Promise.all([n.e(6004),n.e(1383)]).then(n.bind(n,6004)).then((({aplayerInit:e})=>e())))';
const NEW = '_iro.float_player_on&&((window.requestIdleCallback||function(e){return setTimeout(e,3e3)})(function(){(0,m.F)()||Promise.all([n.e(6004),n.e(1383)]).then(n.bind(n,6004)).then((({aplayerInit:e})=>e()))}))';

const MARKER = 'window.requestIdleCallback||function(e){return setTimeout(e,3e3)}';
let src = readFileSync(file, 'utf8');

if (src.includes(MARKER)) {
    console.log('已打过补丁，跳过。');
    process.exit(0);
}

const count = src.split(OLD).length - 1;
if (count !== 1) {
    console.error(`补丁点匹配异常：找到 ${count} 处（预期 1 处）。app.js 可能已更新，请人工比对后修改本脚本的 OLD 字符串。`);
    process.exit(1);
}

src = src.replace(OLD, NEW);
writeFileSync(file, src);
console.log('补丁完成：播放器初始化已推迟到浏览器空闲时执行。');

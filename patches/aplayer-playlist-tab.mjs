/**
 * 播放器控制栏歌单按钮补丁（直接改 APlayer 编译产物 js/6004.js）
 *
 * 在控制栏「歌曲列表」按钮后面插入一个「歌单列表」按钮，图标使用主题已加载的
 * FontAwesome（fa-compact-disc），点击后弹出多歌单切换菜单。菜单的构建与切换逻辑
 * 仍在 js/aplayer-playlist-switcher.js 中，本补丁只负责把按钮焊进播放器模板。
 *
 * 改动点（与压缩产物严格比对，主题更新覆盖后需重跑本脚本）：
 *   1. 模板：`aplayer-icon-menu"> ',e+=n.menu,e+=' </button> <button ...`
 *      → 在 menu 按钮后插入 `<button class="aplayer-icon aplayer-playlist-icon">`
 *   2. 绑定：`.menu.addEventListener("click",(()=>{this.player.list.toggle()}))`
 *      → 之后追加对 .aplayer-playlist-icon 的委托绑定（点击 → window 事件）
 *
 * 用法：  node patches/aplayer-playlist-tab.mjs
 * 场景：主题自动更新覆盖 js/6004.js 后重跑一次即可；重复执行自动跳过。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, 'js', '6004.js');

const MARKER = 'aplayer-playlist-icon';

// 1) 模板锚点：menu 按钮结束后、lrc 按钮开始前插入我们的按钮
const TPL_OLD = 'aplayer-icon-menu"> \',e+=n.menu,e+=\' </button> <button type="button" class="aplayer-icon aplayer-icon-lrc"> ';
const TPL_NEW = 'aplayer-icon-menu"> \',e+=n.menu,e+=\' </button> <button type="button" class="aplayer-icon aplayer-playlist-icon" title="歌单列表" aria-label="切换歌单"><i class="fa-solid fa-compact-disc"></i></button> <button type="button" class="aplayer-icon aplayer-icon-lrc"> ';

// 2) 绑定锚点：menu 点击绑定之后追加 playlist 按钮绑定（容器级委托，重建成后依然有效）
const BIND_OLD = '.menu.addEventListener("click",(()=>{this.player.list.toggle()}))';
const BIND_NEW = '.menu.addEventListener("click",(()=>{this.player.list.toggle()})),this.container.addEventListener("click",(e=>{e.target.closest&&e.target.closest(".aplayer-playlist-icon")&&window.dispatchEvent(new CustomEvent("aplayer:playlist-menu"))}))';

let src = readFileSync(file, 'utf8');

if (src.includes(MARKER)) {
    console.log('已打过补丁，跳过。');
    process.exit(0);
}

const tCount = src.split(TPL_OLD).length - 1;
const bCount = src.split(BIND_OLD).length - 1;
if (tCount !== 2 || bCount !== 1) {
    console.error(`锚点匹配异常：模板锚点 ${tCount} 处（应 2 处，模板编译产物两份）、绑定锚点 ${bCount} 处（应 1 处）。产物可能已更新，请重新比对。`);
    process.exit(1);
}

src = src.replaceAll(TPL_OLD, TPL_NEW);
src = src.replace(BIND_OLD, BIND_NEW);

writeFileSync(file, src, 'utf8');
console.log('补丁完成：js/6004.js 已插入歌单列表按钮（模板 + 事件绑定）。');

/**
 * Sakurairo DIY: 页脚悬浮播放器多歌单切换（切换按钮集成在播放器侧边）
 *
 * 依赖主题打包脚本(app.js)初始化播放器后在 window._sakurairo 上注册的全局工具函数：
 *   destroyAllAplayer() / loadAPlayer(audioArray) / getAPlayers()
 * 切换原理：拉取目标歌单的音频列表 → 销毁当前实例 → loadAPlayer 重建（重建会自动重新绑定歌词、悬停展开等行为）
 * 数据源沿用主题约定：_iro.meting_api_url（或全局 meting_api），按歌单替换 server / id 参数
 *
 * 按钮注入 .aplayer-body 内、miniswitcher 右侧；播放器 DOM 在每次切换/pjax 后都会重建，
 * 因此用 MutationObserver 保证按钮常驻。歌单菜单挂在 body 上，不随播放器重建消失。
 */
(function () {
  'use strict';

  var PLAYLISTS = window._iro && window._iro.aplayer_playlists;
  if (!Array.isArray(PLAYLISTS) || PLAYLISTS.length < 2) return;

  var STORE_KEY = 'sakurairo_aplayer_playlist';
  var state = { current: 0, switching: false };
  var globals = function () { return window._sakurairo || window; };

  function metingBase() {
    if (typeof window.meting_api === 'string') return new URL(window.meting_api);
    var url = new URL(window._iro.meting_api_url);
    if (url.origin === window.location.origin && window._iro.nonce) {
      url.searchParams.set('_wpnonce', window._iro.nonce);
    }
    return url;
  }

  function playlistUrl(item) {
    var url = metingBase();
    url.searchParams.set('server', item.server);
    url.searchParams.set('type', 'playlist');
    url.searchParams.set('id', item.id);
    return url.toString();
  }

  function markActive() {
    var menu = document.getElementById('aplayer-playlist-menu');
    if (!menu) return;
    Array.prototype.forEach.call(menu.children, function (node, index) {
      node.classList.toggle('active', index === state.current);
    });
  }

  function switchTo(index) {
    if (state.switching) return;
    var item = PLAYLISTS[index];
    var g = globals();
    if (!item || typeof g.destroyAllAplayer !== 'function' || typeof g.loadAPlayer !== 'function') return;
    state.switching = true;
    var players = typeof g.getAPlayers === 'function' ? g.getAPlayers() : [];
    var wasPlaying = players.some(function (ap) { return ap && !ap.paused; });
    fetch(playlistUrl(item))
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        return resp.json();
      })
      .then(function (audio) {
        if (!Array.isArray(audio) || !audio.length) throw new Error('歌单数据为空');
        g.destroyAllAplayer();
        var el = document.getElementById('aplayer-float');
        if (el) {
          el.dataset.id = item.id;
          el.dataset.server = item.server;
        }
        g.loadAPlayer(audio);
        state.current = index;
        try { localStorage.setItem(STORE_KEY, String(index)); } catch (e) { /* 隐私模式等场景忽略 */ }
        markActive();
        if (wasPlaying) {
          var fresh = typeof g.getAPlayers === 'function' ? g.getAPlayers() : [];
          fresh.forEach(function (ap) {
            try { ap.play(); } catch (e) { /* 浏览器可能拦截自动播放，忽略 */ }
          });
        }
      })
      .catch(function (err) {
        console.warn('(PlaylistSwitcher) 切换歌单失败:', err);
      })
      .finally(function () { state.switching = false; });
  }

  function buildMenu() {
    if (document.getElementById('aplayer-playlist-menu')) return;
    var menu = document.createElement('div');
    menu.id = 'aplayer-playlist-menu';
    PLAYLISTS.forEach(function (item, index) {
      var option = document.createElement('div');
      option.className = 'aplayer-playlist-item';
      option.textContent = item.name;
      option.addEventListener('click', function () {
        menu.classList.remove('open');
        if (index !== state.current) switchTo(index);
      });
      menu.appendChild(option);
    });
    document.addEventListener('click', function (e) {
      var onTab = e.target.closest && e.target.closest('.aplayer-playlist-tab');
      if (!menu.contains(e.target) && !onTab) menu.classList.remove('open');
    });
    document.body.appendChild(menu);
    markActive();
  }

  // 按钮来自自建 APlayer fork（Jony1211-lab/APlayer）的控制栏模板，
  // 点击时播放器会派发 window 事件 aplayer:playlist-menu，这里响应并弹出菜单
  function listenTab() {
    if (listenTab.done) return;
    listenTab.done = true;
    window.addEventListener('aplayer:playlist-menu', function (e) {
      var menu = document.getElementById('aplayer-playlist-menu');
      if (!menu) return;
      var btn = e.detail && e.detail.button;
      if (btn && btn.getBoundingClientRect) {
        var r = btn.getBoundingClientRect();
        menu.style.left = Math.max(6, Math.round(r.x)) + 'px';
        menu.style.bottom = (window.innerHeight - r.y + 8) + 'px';
      }
      menu.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('aplayer-playlist-menu');
      if (!menu) return;
      var onTab = e.target.closest && e.target.closest('.aplayer-playlist-icon');
      if (!menu.contains(e.target) && !onTab) menu.classList.remove('open');
    });
  }

  function poll(fn, retries, interval) {
    return new Promise(function (resolve, reject) {
      var result = fn();
      if (result) return resolve(result);
      if (retries <= 0) return reject(new Error('timeout'));
      setTimeout(function () {
        poll(fn, retries - 1, interval).then(resolve, reject);
      }, interval);
    });
  }

  function init() {
    buildMenu();
    listenTab();
    // footer.php 中播放器容器在脚本之后才输出，先等容器出现再等播放器实例就绪
    poll(function () { return document.getElementById('aplayer-float'); }, 75, 200)
      .then(function () {
        return poll(function () {
          var g = globals();
          var players = typeof g.getAPlayers === 'function' ? g.getAPlayers() : null;
          return players && players.length ? true : null;
        }, 25, 400);
      })
      .then(function () {
        var saved = parseInt(localStorage.getItem(STORE_KEY), 10);
        if (isNaN(saved) || saved < 0 || saved >= PLAYLISTS.length) saved = 0;
        if (saved > 0) {
          switchTo(saved);
        } else {
          state.current = 0;
          markActive();
        }
      })
      .catch(function (err) {
        console.warn('(PlaylistSwitcher) 播放器未就绪，歌单切换不可用:', err);
      });
  }

  init();
})();

/**
 * Sakurairo DIY: 页脚悬浮播放器多歌单切换（切换按钮集成在播放器侧边）
 *
 * 依赖主题打包脚本(app.js)初始化播放器后在 window._sakurairo 上注册的 getAPlayers()。
 * 切换原理：拉取目标歌单的音频列表 → 原位替换现有实例的音频列表，保留播放器 DOM 与交互状态。
 * 数据源沿用主题约定：_iro.meting_api_url（或全局 meting_api），按歌单替换 server / id 参数
 *
 * 切换按钮由自建 APlayer fork 输出；歌单菜单挂在 body 上，避免被播放器容器裁切。
 */
(function () {
  'use strict';

  var PLAYLISTS = window._iro && window._iro.aplayer_playlists;
  if (!Array.isArray(PLAYLISTS) || PLAYLISTS.length < 2) return;

  var STORE_KEY = 'sakurairo_aplayer_playlist';
  var state = { current: 0, switching: false, trigger: null };
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
      var active = index === state.current;
      node.classList.toggle('active', active);
      node.setAttribute('aria-checked', String(active));
    });
  }

  function getPlayers() {
    var g = globals();
    return typeof g.getAPlayers === 'function' ? g.getAPlayers() : [];
  }

  function closeTrackLists() {
    getPlayers().forEach(function (ap) {
      if (ap && ap.list && ap.list.showing) ap.list.hide();
    });
  }

  function setMenuOpen(open, trigger) {
    var menu = document.getElementById('aplayer-playlist-menu');
    if (!menu) return;
    if (trigger) state.trigger = trigger;
    if (open) closeTrackLists();
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', String(!open));
    Array.prototype.forEach.call(document.querySelectorAll('.aplayer-playlist-icon'), function (button) {
      button.setAttribute('aria-expanded', String(open));
    });
    if (open) {
      window.requestAnimationFrame(function () {
        var active = menu.querySelector('.aplayer-playlist-item.active') || menu.firstElementChild;
        if (active) active.focus({ preventScroll: true });
      });
    }
  }

  function setSwitching(switching) {
    state.switching = switching;
    var menu = document.getElementById('aplayer-playlist-menu');
    if (!menu) return;
    menu.setAttribute('aria-busy', String(switching));
    Array.prototype.forEach.call(menu.children, function (button) {
      button.disabled = switching;
    });
  }

  function replacePlaylist(players, audio) {
    players.forEach(function (ap) {
      if (!ap || !ap.list || typeof ap.list.clear !== 'function' || typeof ap.list.add !== 'function') {
        throw new Error('当前 APlayer 实例不支持原位切换歌单');
      }
      var wasPlaying = !ap.paused;
      var wasShowing = ap.list.showing;
      ap.list.clear();
      ap.list.add(audio.map(function (item) { return Object.assign({}, item); }));
      ap.options.audio = ap.list.audios;
      if (wasShowing) ap.list.show();
      if (wasPlaying) ap.play();
    });
  }

  function switchTo(index) {
    if (state.switching) return;
    var item = PLAYLISTS[index];
    var players = getPlayers();
    if (!item || !players.length) return;
    setSwitching(true);
    fetch(playlistUrl(item))
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        return resp.json();
      })
      .then(function (audio) {
        if (!Array.isArray(audio) || !audio.length) throw new Error('歌单数据为空');
        replacePlaylist(players, audio);
        var el = document.getElementById('aplayer-float');
        if (el) {
          el.dataset.id = item.id;
          el.dataset.server = item.server;
        }
        state.current = index;
        try { localStorage.setItem(STORE_KEY, String(index)); } catch (e) { /* 隐私模式等场景忽略 */ }
        markActive();
      })
      .catch(function (err) {
        console.warn('(PlaylistSwitcher) 切换歌单失败:', err);
      })
      .finally(function () { setSwitching(false); });
  }

  function buildMenu() {
    if (document.getElementById('aplayer-playlist-menu')) return;
    var menu = document.createElement('div');
    menu.id = 'aplayer-playlist-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '歌单列表');
    menu.setAttribute('aria-hidden', 'true');
    PLAYLISTS.forEach(function (item, index) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'aplayer-playlist-item';
      option.setAttribute('role', 'menuitemradio');
      option.textContent = item.name;
      option.addEventListener('click', function () {
        setMenuOpen(false);
        if (index !== state.current) switchTo(index);
      });
      menu.appendChild(option);
    });
    document.addEventListener('click', function (e) {
      var onTab = e.target.closest && e.target.closest('.aplayer-playlist-icon');
      if (!menu.contains(e.target) && !onTab) setMenuOpen(false);
    });
    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('.aplayer-playlist-item:not(:disabled)'));
      if (!items.length) return;
      var index = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        var trigger = state.trigger;
        setMenuOpen(false);
        if (trigger) trigger.focus({ preventScroll: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var step = e.key === 'ArrowDown' ? 1 : -1;
        items[(index + step + items.length) % items.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : items.length - 1].focus();
      }
    });
    document.body.appendChild(menu);
    setMenuOpen(false);
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
      if (btn) positionMenu(btn);
      setMenuOpen(!menu.classList.contains('open'), btn);
    });
    window.addEventListener('resize', repositionMenu);
    window.addEventListener('scroll', repositionMenu, { passive: true, capture: true });
  }

  function positionMenu(button) {
    var menu = document.getElementById('aplayer-playlist-menu');
    if (!menu || !button || !button.getBoundingClientRect) return;
    var r = button.getBoundingClientRect();
    var maxLeft = Math.max(8, window.innerWidth - menu.offsetWidth - 8);
    menu.style.left = Math.min(Math.max(8, Math.round(r.left)), maxLeft) + 'px';
    menu.style.bottom = Math.max(8, Math.round(window.innerHeight - r.top + 8)) + 'px';
  }

  function repositionMenu() {
    var menu = document.getElementById('aplayer-playlist-menu');
    if (menu && menu.classList.contains('open')) positionMenu(state.trigger);
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
          var players = getPlayers();
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

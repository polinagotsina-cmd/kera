// ---------- Mobile menu ----------
// Opens with the menu icon; closes on any tap (links still navigate) or Escape.
(function () {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  if (!nav || !toggle) return;

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', function (event) {
    event.stopPropagation();
    setOpen(!nav.classList.contains('is-open'));
  });

  document.addEventListener('click', function () {
    if (nav.classList.contains('is-open')) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
})();

// ---------- Menu bar clock ----------
// Visitor's local date and time in the mockup format: "Sat Jan 25" and "14:14".
(function () {
  const dateEl = document.querySelector('[data-clock="date"]');
  const timeEl = document.querySelector('[data-clock="time"]');
  if (!dateEl || !timeEl) return;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function update() {
    const now = new Date();
    dateEl.textContent = DAYS[now.getDay()] + ' ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
    timeEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());

    // Re-run exactly when the next minute starts
    setTimeout(update, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50);
  }

  update();
})();

// ---------- Folder window ----------
// Opens from the folder (or any [data-open-window="tab"] element) with a grow
// animation. Mac dots: red closes, yellow minimizes into the folder, green
// toggles full screen. Desktop: drag by the top bar. Esc / click outside close.
(function () {
  const layer = document.querySelector('[data-win-layer]');
  const win = layer && layer.querySelector('[data-win]');
  if (!win) return;

  const root = document.documentElement;
  const folder = document.querySelector('[data-folder]');
  const folderIcon = folder && folder.querySelector('.folder__icon');
  const bar = win.querySelector('[data-win-drag]');
  const scroller = win.querySelector('[data-win-scroll]');
  const current = win.querySelector('[data-win-current]');
  const maxBtn = win.querySelector('[data-win-max]');
  const tabList = win.querySelector('[role="tablist"]');
  const tabs = Array.from(win.querySelectorAll('[data-tab]'));
  const panels = Array.from(win.querySelectorAll('[data-panel]'));
  const faqs = Array.from(win.querySelectorAll('.faq'));
  const phone = window.matchMedia('(max-width: 767.98px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let state = 'closed';   // 'open' | 'minimized' | 'closed'
  let opener = null;      // element the window grows from and returns focus to
  let pos = null;         // desktop position {x, y}
  let busy = false;       // an open/close animation is running
  let dragged = false;

  // --- Helpers ---
  function ms(duration) {
    return reduceMotion.matches ? 0 : duration;
  }

  function play(el, keyframes, duration, easing) {
    if (!el.animate || !ms(duration)) return Promise.resolve(null);
    const animation = el.animate(keyframes, { duration: ms(duration), easing: easing, fill: 'forwards' });
    return animation.finished.then(function () { return animation; }, function () { return null; });
  }

  // Transform that makes the (untransformed) window cover the given rect
  function coverRect(target) {
    const r = win.getBoundingClientRect();
    return 'translate(' + (target.left - r.left) + 'px, ' + (target.top - r.top) + 'px) ' +
           'scale(' + (target.width / r.width) + ', ' + (target.height / r.height) + ')';
  }

  function originRect() {
    const el = opener === folder ? folderIcon : opener;
    return (el || win).getBoundingClientRect();
  }

  // --- Position (desktop) ---
  function place(x, y) {
    const w = win.offsetWidth;
    const h = win.offsetHeight;
    const vw = layer.clientWidth;
    const vh = layer.clientHeight;
    // keep the top bar reachable
    x = Math.min(Math.max(x, 80 - w), vw - 80);
    y = Math.min(Math.max(y, 0), vh - 45);
    pos = { x: x, y: y };
    win.style.setProperty('--win-x', x + 'px');
    win.style.setProperty('--win-y', y + 'px');
  }

  function center() {
    place((layer.clientWidth - win.offsetWidth) / 2, (layer.clientHeight - win.offsetHeight) / 2);
  }

  // --- Page scroll lock ---
  function lockPage(lock) {
    if (lock) {
      root.style.setProperty('--scrollbar-w', (window.innerWidth - root.clientWidth) + 'px');
    }
    root.classList.toggle('is-locked', lock);
  }

  // --- Tabs ---
  function selectTab(name, focus) {
    tabs.forEach(function (tab) {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (!on) return;
      current.textContent = tab.textContent;
      if (focus) tab.focus();
      // Phone pills: scroll only if the active pill is cut off
      if (phone.matches) {
        const left = tab.offsetLeft - 20;
        const right = tab.offsetLeft + tab.offsetWidth + 20 - tabList.clientWidth;
        const target = Math.min(Math.max(tabList.scrollLeft, right), left);
        if (target !== tabList.scrollLeft) {
          tabList.scrollTo({ left: target, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        }
      }
    });
    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== name;
    });
    scroller.scrollTop = 0;
    closeViewer(false);
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      selectTab(tab.dataset.tab);
    });
    tab.addEventListener('keydown', function (event) {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      let next = null;
      if (keys[event.key]) next = (i + keys[event.key] + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      selectTab(tabs[next].dataset.tab, true);
    });
  });

  // Fresh state for a newly opened window
  function reset() {
    selectTab('address');
    faqs.forEach(function (faq) {
      faq.open = faq.hasAttribute('data-faq-first');
    });
    setMax(false, false);
    pos = null;
  }

  // --- Open / minimize / close ---
  function open(tab, source) {
    if (busy) return;
    if (state === 'open') {
      if (tab) selectTab(tab);
      return;
    }

    const restoring = state === 'minimized';
    if (!restoring) reset();
    if (tab) selectTab(tab);
    opener = source || folder;

    lockPage(true);
    layer.hidden = false;
    if (!restoring || !pos || phone.matches) center();
    else place(pos.x, pos.y);
    state = 'open';

    busy = true;
    play(win, [
      { transform: coverRect(originRect()), opacity: 0.3, borderRadius: '40px' },
      { transform: 'none', opacity: 1 }
    ], 460, 'cubic-bezier(0.2, 0.85, 0.25, 1)').then(function (animation) {
      if (animation) animation.cancel();
      busy = false;
      win.focus({ preventScroll: true });
    });
  }

  function hide(nextState) {
    layer.hidden = true;
    state = nextState;
    lockPage(false);
  }

  function minimize() {
    if (busy || state !== 'open') return;
    opener = folder;
    busy = true;
    closeViewer(false);
    play(win, [
      { transform: 'none', opacity: 1 },
      { transform: coverRect(originRect()), opacity: 0.2, borderRadius: '40px' }
    ], 420, 'cubic-bezier(0.55, 0, 0.8, 0.3)').then(function (animation) {
      hide('minimized');
      if (animation) animation.cancel();
      busy = false;
      if (folderIcon) {
        folderIcon.classList.remove('is-receiving');
        void folderIcon.offsetWidth; // restart the bounce
        folderIcon.classList.add('is-receiving');
      }
      if (folder) folder.focus({ preventScroll: true });
    });
  }

  function close() {
    if (busy || state !== 'open') return;
    busy = true;
    const r = win.getBoundingClientRect();
    play(win, [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(' + r.width * 0.02 + 'px, ' + r.height * 0.02 + 'px) scale(0.96)', opacity: 0 }
    ], 180, 'ease-in').then(function (animation) {
      hide('closed');
      if (animation) animation.cancel();
      busy = false;
      if (opener) opener.focus({ preventScroll: true });
    });
  }

  // --- Full screen (green dot) ---
  // Content scale in full screen = bigger window / normal window size
  const probe = win.querySelector('[data-win-probe]');
  function updateScale() {
    const scale = Math.min(layer.clientWidth / probe.offsetWidth, layer.clientHeight / probe.offsetHeight);
    win.style.setProperty('--win-scale', String(Math.max(1, scale)));
  }

  function setMax(on, animate) {
    if (phone.matches) on = false;
    const from = win.getBoundingClientRect();
    updateScale();
    win.classList.toggle('is-max', on);
    maxBtn.setAttribute('aria-pressed', String(on));
    maxBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    fitPhoto();
    // Grow / shrink from the previous size
    if (animate && from.width) {
      play(win, [
        { transform: coverRect(from) },
        { transform: 'none' }
      ], 350, 'cubic-bezier(0.2, 0.85, 0.25, 1)').then(function (animation) {
        if (animation) animation.cancel();
      });
    }
  }

  function toggleMax() {
    setMax(!win.classList.contains('is-max'), true);
  }

  // --- Dragging by the top bar (desktop) ---
  bar.addEventListener('pointerdown', function (event) {
    if (phone.matches || win.classList.contains('is-max') || event.button !== 0 || event.target.closest('button')) return;
    const offsetX = event.clientX - pos.x;
    const offsetY = event.clientY - pos.y;
    dragged = false;
    bar.setPointerCapture(event.pointerId);
    win.classList.add('is-dragging');

    function move(e) {
      dragged = true;
      place(e.clientX - offsetX, e.clientY - offsetY);
    }
    function up() {
      win.classList.remove('is-dragging');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    }
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });

  // Double-click the top bar to toggle full screen, like on a Mac
  bar.addEventListener('dblclick', function (event) {
    if (!phone.matches && !event.target.closest('button')) toggleMax();
  });

  // --- Buttons, outside click, keyboard ---
  win.querySelectorAll('[data-win-close]').forEach(function (btn) {
    btn.addEventListener('click', close);
  });
  win.querySelector('[data-win-min]').addEventListener('click', minimize);
  maxBtn.addEventListener('click', toggleMax);

  layer.addEventListener('click', function (event) {
    if (event.target === layer && !dragged) close();
    dragged = false;
  });

  if (folder) {
    folder.addEventListener('click', function () {
      open(null, folder);
    });
  }

  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-open-window]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger.dataset.openWindow, trigger);
  });

  document.addEventListener('keydown', function (event) {
    if (state !== 'open') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (!viewer.hidden) closeViewer(true);
      else close();
      return;
    }

    if (!viewer.hidden && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      showPhoto(photoIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      return;
    }

    // Keep keyboard focus inside the window
    if (event.key === 'Tab') {
      const scope = viewer.hidden ? win : viewer;
      const items = Array.from(scope.querySelectorAll('button, a[href], summary, [tabindex="0"]'))
        .filter(function (el) { return el.offsetParent !== null && !el.closest('[hidden]'); });
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === win)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('resize', function () {
    if (state !== 'open') return;
    if (phone.matches || !pos) center();
    else place(pos.x, pos.y);
    updateScale();
    fitPhoto();
  });

  phone.addEventListener('change', function () {
    if (phone.matches) setMax(false, false);
  });

  // --- Photo viewer ---
  const viewer = win.querySelector('[data-viewer]');
  const viewerCard = viewer.querySelector('.viewer__card');
  const viewerImg = viewer.querySelector('[data-viewer-img]');
  const viewerName = viewer.querySelector('[data-viewer-name]');
  const viewerDownload = viewer.querySelector('[data-viewer-download]');
  const thumbs = Array.from(win.querySelectorAll('[data-photo]'));
  const photos = thumbs.map(function (thumb) {
    return {
      name: thumb.querySelector('.thumb__name').textContent,
      src: thumb.querySelector('img').getAttribute('src').replace('-thumb', ''),
      alt: thumb.dataset.alt || '',
      // proportions from the thumbnail's width/height (same crop as the full photo)
      ratio: thumb.querySelector('img').getAttribute('width') / thumb.querySelector('img').getAttribute('height')
    };
  });
  let photoIndex = 0;

  // Size the photo (and so the viewer card) to the photo's proportions,
  // within the mockup's max size and the space inside the window
  function fitPhoto() {
    if (viewer.hidden) return;
    const ratio = photos[photoIndex].ratio;
    viewer.classList.toggle('is-portrait', ratio < 1);
    const style = getComputedStyle(viewerImg);
    const pad = parseFloat(getComputedStyle(viewer).paddingLeft) * 2;
    const card = getComputedStyle(viewerCard);
    const cardX = parseFloat(card.paddingLeft) + parseFloat(card.paddingRight);
    const barH = viewerCard.querySelector('.file__bar').offsetHeight + parseFloat(card.paddingBottom);
    const maxW = Math.min(parseFloat(style.maxWidth), viewer.clientWidth - pad - cardX);
    const maxH = Math.min(parseFloat(style.maxHeight), viewer.clientHeight - pad - barH);
    const width = Math.floor(Math.min(maxW, maxH * ratio));
    viewerImg.style.width = width + 'px';
    viewerImg.style.height = Math.floor(width / ratio) + 'px';
  }


  function showPhoto(index) {
    photoIndex = (index + photos.length) % photos.length;
    const photo = photos[photoIndex];
    viewerImg.src = photo.src;
    viewerImg.alt = photo.alt;
    fitPhoto();
    viewerName.textContent = photo.name;
    viewerDownload.href = photo.src;
    viewerDownload.setAttribute('download', photo.name);
    // preload the neighbours so prev/next feel instant
    [photoIndex - 1, photoIndex + 1].forEach(function (i) {
      new Image().src = photos[(i + photos.length) % photos.length].src;
    });
  }

  function openViewer(index) {
    showPhoto(index);
    viewer.hidden = false;
    fitPhoto();
    const from = thumbs[photoIndex].querySelector('img').getBoundingClientRect();
    const to = viewerCard.getBoundingClientRect();
    if (to.width) {
      play(viewerCard, [
        { transform: 'translate(' + (from.left - to.left) + 'px, ' + (from.top - to.top) + 'px) scale(' + from.width / to.width + ')', opacity: 0.4 },
        { transform: 'none', opacity: 1 }
      ], 300, 'cubic-bezier(0.2, 0.85, 0.25, 1)').then(function (animation) {
        if (animation) animation.cancel();
      });
    }
    viewer.querySelector('[data-viewer-close]').focus({ preventScroll: true });
  }

  function closeViewer(restoreFocus) {
    if (viewer.hidden) return;
    viewer.hidden = true;
    if (restoreFocus && thumbs[photoIndex]) thumbs[photoIndex].focus({ preventScroll: true });
  }

  thumbs.forEach(function (thumb, i) {
    thumb.addEventListener('click', function () {
      openViewer(i);
    });
  });

  viewer.querySelector('[data-viewer-prev]').addEventListener('click', function () { showPhoto(photoIndex - 1); });
  viewer.querySelector('[data-viewer-next]').addEventListener('click', function () { showPhoto(photoIndex + 1); });
  viewer.querySelector('[data-viewer-close]').addEventListener('click', function () { closeViewer(true); });

  // Click around the photo card closes the photo
  viewer.addEventListener('click', function (event) {
    if (event.target === viewer) closeViewer(true);
  });

  // Swipe left / right on the photo
  let swipeX = null;
  viewerImg.addEventListener('pointerdown', function (event) {
    swipeX = event.clientX;
  });
  viewerImg.addEventListener('pointerup', function (event) {
    if (swipeX === null) return;
    const dx = event.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 40) showPhoto(photoIndex + (dx < 0 ? 1 : -1));
  });
  viewerImg.addEventListener('pointercancel', function () {
    swipeX = null;
  });
})();

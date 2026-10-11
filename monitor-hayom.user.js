// ==UserScript==
// @name         המוניטור + היום
// @version      1.0
// @description  מוסיף עמודת "ישראל היום" למוניטור של הפושייה, בעיצוב של שאר העמודות
// @match        https://pushiya.com/he/monitor*
// @grant        GM_xmlhttpRequest
// @connect      www.israelhayom.co.il
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== הגדרות =====
  const TEMPLATE = 'walla';          // העמודה שמשכפלים כתבנית (walla = עמודה סטטית עם כותרת ראשית ו-4 משניות)
  const LOGO_URL = 'https://pushiya.com/img/avatar/hayom.svg';
  const MAX_ITEMS = 6;
  const REFRESH_MS = 2 * 60 * 1000;  // רענון כל 2 דקות
  const POSITION = 'middle';         // middle = מיד אחרי עמודת התבנית (באמצע) | first | last
  const DEBUG = false;

  const BASE = 'https://www.israelhayom.co.il';
  let data = null;
  let node = null;

  const log = (...a) => DEBUG && console.log('[hayom]', ...a);

  const get = (url) => new Promise((resolve, reject) =>
    GM_xmlhttpRequest({ method: 'GET', url, onload: (r) => resolve(r.responseText), onerror: reject })
  );

  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  async function load() {
    const doc = parse(await get(BASE + '/'));
    const seen = new Set();
    const items = [];
    doc.querySelectorAll('a[href*="/article/"]').forEach((a) => {
      if (!a.closest('h1,h2,h3')) return;             // רק כותרות
      const href = new URL(a.getAttribute('href'), BASE).href;
      const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (title.length < 12 || seen.has(href)) return;
      seen.add(href);
      items.push({ href, title });
    });
    let img = '';
    if (items[0]) {
      try {
        const art = parse(await get(items[0].href));
        const m = art.querySelector('meta[property="og:image"]');
        img = m ? m.content : '';
      } catch (e) { log('no hero image', e); }
    }
    data = { items: items.slice(0, MAX_ITEMS), img };
    log('loaded', data);
  }

  function findColumn() {
    const logo = document.querySelector('img[src*="' + TEMPLATE + '-logo-wide"]');
    if (!logo) return null;
    let col = logo;
    while (col.parentElement) {
      const p = col.parentElement;
      const withLogo = [...p.children].filter((c) => c.querySelector('img[src*="-logo-wide"]'));
      if (withLogo.length >= 2) return col;           // col = אחת העמודות
      col = p;
    }
    return null;
  }

  function build() {
    if (!data || !data.items.length) return null;
    const col = findColumn();
    if (!col) { log('template column not found yet'); return null; }

    const el = col.cloneNode(true);
    el.setAttribute('data-hayom', '1');

    // לוגו
    const logo = el.querySelector('img[src*="-logo-wide"]');
    logo.removeAttribute('srcset');
    logo.src = LOGO_URL;
    logo.alt = 'ישראל היום';
    logo.style.objectFit = 'contain';

    // תמונות: הראשונה = תמונת הכותרת הראשית, השאר מוסתרות
    const imgs = [...el.querySelectorAll('img')].filter((i) => i !== logo);
    if (imgs[0] && data.img) { imgs[0].removeAttribute('srcset'); imgs[0].src = data.img; }
    imgs.slice(1).forEach((i) => (i.style.display = 'none'));

    // קישורים: כל קבוצה עם אותו href = כתבה אחת
    const groups = new Map();
    [...el.querySelectorAll('a')]
      .filter((a) => a.textContent.trim())
      .forEach((a) => {
        if (!groups.has(a.href)) groups.set(a.href, []);
        groups.get(a.href).push(a);
      });

    [...groups.values()].forEach((g, i) => {
      const it = data.items[i];
      if (!it) { g.forEach((a) => (a.style.display = 'none')); return; }
      const title = g.find((a) => a.closest('h1,h2,h3')) || g[g.length - 1];
      g.forEach((a) => {
        a.href = it.href;
        a.target = '_blank';
        if (a !== title) a.style.display = 'none';    // תתי-כותרות/כיתובים מהתבנית
      });
      title.textContent = it.title;
    });

    const parent = col.parentElement;
    if (POSITION === 'first') parent.insertBefore(el, parent.firstChild);
    else if (POSITION === 'middle') parent.insertBefore(el, col.nextSibling);
    else parent.appendChild(el);

    // אם הפריסה היא grid עם מספר עמודות קבוע, מרחיבים אותה
    if (getComputedStyle(parent).display === 'grid') {
      parent.style.gridTemplateColumns = 'repeat(' + parent.children.length + ', minmax(0, 1fr))';
    }
    return el;
  }

  async function refresh() {
    try { await load(); } catch (e) { console.warn('[hayom] load failed', e); return; }
    if (node) node.remove();
    node = build();
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
  // אם האתר רנדר מחדש והעמודה נעלמה, מחזירים אותה
  setInterval(() => { if (data && (!node || !document.contains(node))) node = build(); }, 3000);
})();

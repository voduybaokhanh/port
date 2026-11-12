// Behaviour only: hero graph, run-log ticker, tabs, scroll reveal. Content lives in index.html.
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Language (EN source in HTML, VI from assets/vi.js) ---------- */
  const VI = window.I18N_VI;
  const TEXT_SEL = 'h2,h3,p,dt,dd,.skip,.tab__name,.tab__meta,.flow li,.tags li,.rows span,.repolist span,.role,time,.btn,.nav__links a,.facts p,.contact__links span,.foot a,.stackgrid dd,.repos__more a';
  const i18nText = [];   // [element, englishHTML, vietnameseHTML]
  const i18nAria = [];   // [element, englishLabel, vietnameseLabel]
  const missing = [];
  if (VI) {
    document.querySelectorAll(TEXT_SEL).forEach((el) => {
      if (el.closest('#runlog')) return;
      // skip containers: only translate elements that hold text, not block children
      if ([...el.children].some((c) => /^(DIV|P|UL|OL|H\d|DL|ARTICLE|SECTION)$/.test(c.tagName))) return;
      const en = el.innerHTML.trim();
      if (VI.text[en]) i18nText.push([el, en, VI.text[en]]);
      else if (/[a-z]{4}/.test(en) && el.matches('p,h2,h3,dd,dt,time,.facts p,.btn,.skip')) missing.push(en);
    });
    document.querySelectorAll('[aria-label]').forEach((el) => {
      const en = el.getAttribute('aria-label');
      if (VI.aria[en]) i18nAria.push([el, en, VI.aria[en]]);
    });
    if (missing.length) console.warn('i18n: no Vietnamese entry for', missing);
  }
  const metaDesc = document.querySelector('meta[name="description"]');
  const enMeta = { title: document.title, description: metaDesc && metaDesc.content };
  const setLang = (lang) => {
    const vi = lang === 'vi' && VI;
    document.documentElement.lang = vi ? 'vi' : 'en';
    i18nText.forEach(([el, en, v]) => { el.innerHTML = vi ? v : en; });
    i18nAria.forEach(([el, en, v]) => el.setAttribute('aria-label', vi ? v : en));
    document.title = vi ? VI.meta.title : enMeta.title;
    if (metaDesc) metaDesc.content = vi ? VI.meta.description : enMeta.description;
    try { localStorage.setItem('lang', vi ? 'vi' : 'en'); } catch (e) { /* private mode: language just won't persist */ }
  };
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) { /* ignore */ }
  setLang(saved || ((navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en'));
  document.getElementById('lang')?.addEventListener('click', () => setLang(document.documentElement.lang === 'vi' ? 'en' : 'vi'));

  /* ---------- Hero graph ---------- */
  // Nodes sit in a unit square; layout() maps it to the right half on desktop, the top band on phones.
  const NODES = {
    sapo:   { x: 0.04, y: 0.08, label: 'Sapo ERP' },
    zalo:   { x: 0.00, y: 0.50, label: 'Zalo OA' },
    shopee: { x: 0.06, y: 0.90, label: 'Shopee' },
    tiktok: { x: 0.34, y: 1.00, label: 'TikTok Shop' },
    n8n:    { x: 0.40, y: 0.50, label: 'n8n', hub: true },
    pg:     { x: 0.50, y: 0.08, label: 'PostgreSQL' },
    gemini: { x: 0.80, y: 0.30, label: 'Gemini' },
    lark:   { x: 1.00, y: 0.66, label: 'Lark' },
    sheets: { x: 0.72, y: 0.98, label: 'Google Sheets' },
  };
  const EDGES = [
    ['sapo', 'n8n'], ['zalo', 'n8n'], ['shopee', 'n8n'], ['tiktok', 'n8n'],
    ['n8n', 'pg'], ['pg', 'n8n'], ['n8n', 'gemini'], ['gemini', 'n8n'],
    ['n8n', 'lark'], ['n8n', 'sheets'], ['sheets', 'pg'],
  ];

  const canvas = document.getElementById('graph');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const C = {
      signal: css.getPropertyValue('--signal').trim(),
      bone: css.getPropertyValue('--bone').trim(),
      line: css.getPropertyValue('--line').trim(),
      ink: css.getPropertyValue('--ink-2').trim(),
      mute: css.getPropertyValue('--mute').trim(),
      mono: css.getPropertyValue('--font-mono').trim(),
    };
    let w = 0, h = 0, dpr = 1, running = false, raf = 0;
    const pos = {};
    const pulses = [];
    const rings = [];

    const layout = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const phone = w < 760;
      const box = phone
        ? { x: w * 0.1, y: 96, w: w * 0.78, h: Math.min(w * 0.55, 230) }
        : { x: w * 0.46, y: h * 0.16, w: w * 0.46, h: h * 0.56 };
      for (const [k, n] of Object.entries(NODES)) {
        pos[k] = { x: box.x + n.x * box.w, y: box.y + n.y * box.h };
      }
    };

    const spawn = () => {
      const [a, b] = EDGES[(Math.random() * EDGES.length) | 0];
      pulses.push({ a, b, t: 0, speed: 0.004 + Math.random() * 0.004 });
    };

    const drawNode = (k, n) => {
      const p = pos[k], r = n.hub ? 9 : 5.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832);
      ctx.fillStyle = n.hub ? C.signal : C.ink; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = n.hub ? C.signal : C.bone; ctx.stroke();
      ctx.font = `500 ${n.hub ? 14 : 12}px ${C.mono}`;
      ctx.fillStyle = n.hub ? C.bone : C.mute;
      ctx.textAlign = p.x > w * 0.9 ? 'right' : 'left';
      const dx = p.x > w * 0.9 ? -(r + 8) : r + 8;
      ctx.fillText(n.label, p.x + dx, p.y + 4);
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.strokeStyle = C.line;
      for (const [a, b] of EDGES) {
        ctx.beginPath(); ctx.moveTo(pos[a].x, pos[a].y); ctx.lineTo(pos[b].x, pos[b].y); ctx.stroke();
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += p.speed;
        if (p.t >= 1) { rings.push({ k: p.b, t: 0 }); pulses.splice(i, 1); continue; }
        const A = pos[p.a], B = pos[p.b];
        const x = A.x + (B.x - A.x) * p.t, y = A.y + (B.y - A.y) * p.t;
        // comet tail: three fading dots behind the head
        for (let j = 3; j >= 0; j--) {
          const tt = Math.max(0, p.t - j * 0.03);
          ctx.beginPath(); ctx.arc(A.x + (B.x - A.x) * tt, A.y + (B.y - A.y) * tt, 3.2 - j * 0.6, 0, 6.2832);
          ctx.fillStyle = C.signal; ctx.globalAlpha = 1 - j * 0.28; ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i]; g.t += 0.03;
        if (g.t >= 1) { rings.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(pos[g.k].x, pos[g.k].y, 8 + g.t * 16, 0, 6.2832);
        ctx.strokeStyle = C.signal; ctx.globalAlpha = 1 - g.t; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const [k, n] of Object.entries(NODES)) drawNode(k, n);
      if (Math.random() < 0.05 && pulses.length < 9) spawn();
      if (running) raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!running && !reduceMotion) { running = true; raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    layout(); frame();                      // one static frame always paints (reduced-motion users get it too)
    for (let i = 0; i < 3; i++) spawn();
    addEventListener('resize', () => { layout(); if (!running) frame(); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(canvas);
  }

  /* ---------- Run-log ticker ---------- */
  // Illustrative lines, labelled as such in the page; they describe behaviour documented in the case studies.
  const LOG = [
    ['zalo.webhook', '3 msgs merged', '→ 1 LLM call'],
    ['etl.sheets→pg', '8 catalogs', 'swapped, 0 s downtime'],
    ['order.alert', 'duplicate webhook', 'ignored (ON CONFLICT)'],
    ['webhook.audit', 'missing hook', 're-registered on Sapo'],
    ['zalo.token', 'refresh_token rotated', 'saved to PostgreSQL'],
    ['chain.daily', 'Sapo → Sheets → Zalo → Shopee', 'exit 0'],
    ['order.card', 'normal → express', 'edited in place'],
    ['catchup', 'missed 11:00 run', 'triggered'],
    ['zalo.takeover', 'staff replied', 'bot muted'],
  ];
  const logEl = document.getElementById('runlog');
  if (logEl && !reduceMotion) {
    let i = 0;
    setInterval(() => {
      const [src, mid, tail] = LOG[i++ % LOG.length];
      const li = document.createElement('li');
      const ok = document.createElement('span'); ok.className = 'ok'; ok.textContent = '✓';
      const b = document.createElement('b'); b.textContent = mid;
      li.append(ok, ` ${src} `, b, ` ${tail}`);
      logEl.append(li);
      while (logEl.children.length > 3) logEl.firstElementChild.remove();
    }, 2200);
  }

  /* ---------- Tabs (WAI-ARIA, arrow keys) ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (step) { e.preventDefault(); select(tabs[(i + step + tabs.length) % tabs.length], true); }
      if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
    });
  });

  /* ---------- Scroll reveal ---------- */
  const targets = document.querySelectorAll('.section-head, .facts p, .rows li, .repolist li, .timeline li, .stackgrid > div, .systems__body, .contact .wrap');
  targets.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  targets.forEach((el) => io.observe(el));
})();

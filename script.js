/* =====================================================================
   CAFÉ AROMA – ADVANCED INTERACTIVE ENGINE  v2
   Modules: Store · Storage · Toasts · Theme · Reveal · Cart · Nav · Forms
   ===================================================================== */
(() => {
  'use strict';

  /* -------------------------------------------------------------------
     0. UTILITIES
     ------------------------------------------------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  /** Element factory: h('button', { class: 'x', onclick }, 'text', child) */
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter((k) => k != null));
    return el;
  };

  /* -------------------------------------------------------------------
     1. SAFE STORAGE (works even when localStorage is blocked)
     ------------------------------------------------------------------- */
  const Storage = (() => {
    const mem = new Map();
    const ok = (() => {
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
      catch { return false; }
    })();
    return {
      get(key, fallback) {
        try {
          const raw = ok ? localStorage.getItem(key) : mem.get(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch { return fallback; }
      },
      set(key, value) {
        const raw = JSON.stringify(value);
        try { ok ? localStorage.setItem(key, raw) : mem.set(key, raw); } catch { /* quota */ }
      },
    };
  })();

  /* -------------------------------------------------------------------
     2. TINY REACTIVE STORE (pub/sub + undo history)
     ------------------------------------------------------------------- */
  function createStore(initial, reducer) {
    let state = initial;
    const subs = new Set();
    const past = [];
    return {
      get: () => state,
      dispatch(action) {
        if (action.type !== 'UNDO') past.push(state);
        if (past.length > 20) past.shift();
        state = action.type === 'UNDO' ? (past.pop() ?? state) : reducer(state, action);
        subs.forEach((fn) => fn(state, action));
      },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      canUndo: () => past.length > 0,
    };
  }

  /* -------------------------------------------------------------------
     3. TOASTS (live region, announced to screen readers)
     ------------------------------------------------------------------- */
  const Toast = (() => {
    let host;
    const ensure = () => host ??= document.body.appendChild(
      h('div', {
        role: 'status', 'aria-live': 'polite',
        style: { position: 'fixed', top: '16px', right: '16px', zIndex: 2000, display: 'grid', gap: '8px' },
      })
    );
    return {
      show(message, { action, onAction, ms = 4000 } = {}) {
        const t = h('div', {
          style: {
            background: 'var(--color-bg-surface, #faf7f0)', color: 'var(--color-text-main, #2b1d12)',
            border: '1px solid var(--color-border, #d9cbb8)', borderRadius: '10px',
            padding: '.7rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            display: 'flex', gap: '.8rem', alignItems: 'center',
          },
        }, h('span', {}, message),
           action && h('button', {
             style: { background: 'none', border: 0, font: 'inherit', fontWeight: 700, cursor: 'pointer', color: 'var(--color-brand-primary, #7a4f2e)' },
             onclick: () => { onAction?.(); t.remove(); },
           }, action));
        ensure().append(t);
        setTimeout(() => t.remove(), ms);
      },
    };
  })();

  /* -------------------------------------------------------------------
     4. THEME ENGINE (system preference + persistence + cross-tab sync)
     ------------------------------------------------------------------- */
  const THEMES = {
    dark: {
      '--color-bg-primary': '#1a1412', '--color-bg-surface': '#261e1a', '--color-bg-alt': '#332722',
      '--color-text-main': '#f4ebd0', '--color-text-muted': '#c2b29f', '--color-border': '#45352c',
    },
    light: {},
  };

  function initTheme() {
    const root = document.documentElement;
    const saved = Storage.get('aroma:theme', null);
    let mode = saved ?? (prefersDark.matches ? 'dark' : 'light');

    const btn = h('button', { type: 'button', 'aria-pressed': 'false' });
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000,
      background: 'var(--color-brand-primary, #7a4f2e)', color: '#fefae0', border: 0,
      padding: '.75rem 1.2rem', borderRadius: '50px', cursor: 'pointer', fontWeight: 600,
      boxShadow: '0 4px 15px rgba(0,0,0,.2)', transition: 'transform .25s ease',
    });
    btn.addEventListener('pointerenter', () => !prefersReducedMotion.matches && (btn.style.transform = 'translateY(-3px)'));
    btn.addEventListener('pointerleave', () => (btn.style.transform = ''));

    const apply = (next, { persist = true, animate = true } = {}) => {
      mode = next;
      if (animate && !prefersReducedMotion.matches) {
        root.style.transition = 'background-color .5s ease, color .5s ease';
        setTimeout(() => (root.style.transition = ''), 600);
      }
      for (const key of Object.keys(THEMES.dark)) {
        mode === 'dark' ? root.style.setProperty(key, THEMES.dark[key]) : root.style.removeProperty(key);
      }
      root.dataset.theme = mode;
      btn.textContent = mode === 'dark' ? '☀️ Warm Morning Mode' : '🌙 Cozy Night Mode';
      btn.setAttribute('aria-pressed', String(mode === 'dark'));
      btn.setAttribute('aria-label', `Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`);
      if (persist) Storage.set('aroma:theme', mode);
    };

    btn.addEventListener('click', () => apply(mode === 'dark' ? 'light' : 'dark'));
    // Follow the OS only until the visitor makes an explicit choice.
    prefersDark.addEventListener('change', (e) => {
      if (Storage.get('aroma:theme', null) === null) apply(e.matches ? 'dark' : 'light', { persist: false });
    });
    // Sync across tabs.
    addEventListener('storage', (e) => {
      if (e.key === 'aroma:theme' && e.newValue) apply(JSON.parse(e.newValue), { persist: false });
    });

    document.body.append(btn);
    apply(mode, { persist: false, animate: false });
  }

  /* -------------------------------------------------------------------
     5. SCROLL REVEAL (progressive enhancement, no flash, motion-safe)
     ------------------------------------------------------------------- */
  function initScrollReveal() {
    const targets = $$('section, article, aside');
    if (!targets.length || prefersReducedMotion.matches || !('IntersectionObserver' in window)) return;

    document.head.append(h('style', {}, `
      .js-reveal { opacity: 0; transform: translateY(30px);
        transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1); }
      .js-reveal.revealed { opacity: 1; transform: none; }
    `));

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });

    targets.forEach((el, i) => {
      // Anything already on screen is left alone, so the first paint never blanks.
      if (el.getBoundingClientRect().top < innerHeight * 0.9) return;
      el.classList.add('js-reveal');
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`;
      io.observe(el);
    });
  }

  /* -------------------------------------------------------------------
     6. ORDER ESTIMATOR (store + reducer, qty, undo, persistence, a11y)
     ------------------------------------------------------------------- */
  function initOrderEstimator() {
    const table = $('table');
    if (!table) return;

    const cartReducer = (state, { type, item, id }) => {
      const items = { ...state.items };
      switch (type) {
        case 'ADD':    items[item.id] = { ...item, qty: (items[item.id]?.qty ?? 0) + 1 }; break;
        case 'INC':    if (items[id]) items[id] = { ...items[id], qty: items[id].qty + 1 }; break;
        case 'DEC':    if (items[id]) items[id].qty > 1 ? (items[id] = { ...items[id], qty: items[id].qty - 1 }) : delete items[id]; break;
        case 'REMOVE': delete items[id]; break;
        case 'CLEAR':  return { items: {} };
        default: return state;
      }
      return { items };
    };

    const store = createStore({ items: Storage.get('aroma:cart', {}) }, cartReducer);
    const totals = (s) => {
      const list = Object.values(s.items);
      return { list, count: list.reduce((n, i) => n + i.qty, 0), total: list.reduce((n, i) => n + i.qty * i.price, 0) };
    };

    /* ---- Drawer ---- */
    const drawer = h('aside', {
      role: 'region', 'aria-label': 'Order summary', hidden: true,
      style: {
        position: 'fixed', bottom: '20px', left: '20px', zIndex: 1000, maxWidth: '320px', width: 'calc(100% - 40px)',
        background: 'var(--color-bg-surface, #faf7f0)', color: 'var(--color-text-main, #2b1d12)',
        border: '2px solid var(--color-brand-primary, #7a4f2e)', padding: '1rem 1.25rem',
        borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,.15)',
      },
    });
    drawer.classList.add('no-reveal');
    document.body.append(drawer);

    const btnStyle = {
      border: '1px solid var(--color-border, #d9cbb8)', background: 'transparent', color: 'inherit',
      borderRadius: '6px', width: '1.7rem', height: '1.7rem', cursor: 'pointer', font: 'inherit',
    };

    const render = (state) => {
      const { list, count, total } = totals(state);
      drawer.hidden = count === 0;
      if (!count) return;

      drawer.replaceChildren(
        h('strong', {}, `☕ Your order (${count} ${count === 1 ? 'item' : 'items'})`),
        h('ul', { style: { listStyle: 'none', margin: '.6rem 0', padding: 0, display: 'grid', gap: '.4rem', fontSize: '.9rem' } },
          list.map((i) => h('li', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } },
            h('span', { style: { flex: 1 } }, i.name),
            h('button', { style: btnStyle, 'aria-label': `Remove one ${i.name}`, dataset: { act: 'DEC', id: i.id } }, '−'),
            h('span', { 'aria-label': `Quantity ${i.qty}` }, String(i.qty)),
            h('button', { style: btnStyle, 'aria-label': `Add one ${i.name}`, dataset: { act: 'INC', id: i.id } }, '+'),
            h('span', { style: { minWidth: '4.2rem', textAlign: 'right' } }, money.format(i.price * i.qty)),
          ))),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--color-border, #d9cbb8)', paddingTop: '.5rem' } },
          h('span', {}, 'Total'), h('span', {}, money.format(total))),
        h('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.7rem' } },
          h('button', { style: { ...btnStyle, width: 'auto', padding: '0 .7rem' }, dataset: { act: 'CLEAR' } }, 'Clear'),
          h('button', { style: { ...btnStyle, width: 'auto', padding: '0 .7rem' }, dataset: { act: 'COPY' } }, 'Copy order'),
        ),
      );
    };

    // One delegated listener for every button in the drawer.
    drawer.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const { act, id } = btn.dataset;
      if (act === 'COPY') {
        const { list, total } = totals(store.get());
        const text = list.map((i) => `${i.qty} × ${i.name} – ${money.format(i.qty * i.price)}`).join('\n') + `\nTotal: ${money.format(total)}`;
        try { await navigator.clipboard.writeText(text); Toast.show('Order copied to clipboard.'); }
        catch { Toast.show('Could not copy. Select the text manually.'); }
        return;
      }
      if (act === 'CLEAR') {
        store.dispatch({ type: 'CLEAR' });
        Toast.show('Order cleared.', { action: 'Undo', onAction: () => store.dispatch({ type: 'UNDO' }) });
        return;
      }
      store.dispatch({ type: act, id });
    });

    store.subscribe((s) => { render(s); Storage.set('aroma:cart', s.items); });

    /* ---- Table enhancement ---- */
    const headerRow = $('thead tr:last-child', table);
    headerRow?.append(h('th', { scope: 'col' }, 'Quick add'));

    $$('tbody tr', table).forEach((row, index) => {
      const cells = $$('td', row);
      if (cells.length < 2) return;
      const nameCell = cells[1] ?? cells[0];
      const priceCell = cells.at(-1);
      const name = nameCell.textContent.trim();
      // Keep decimals (e.g. 120.50) instead of stripping everything non-numeric.
      const price = parseFloat(priceCell.textContent.replace(/[^0-9.]/g, '')) || 0;
      const id = `${index}:${name.toLowerCase().replace(/\s+/g, '-')}`;

      row.append(h('td', {},
        h('button', {
          type: 'button',
          'aria-label': `Add ${name} to order`,
          style: {
            background: 'var(--color-brand-primary, #7a4f2e)', color: '#fff', border: 0,
            padding: '.3rem .7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
          },
          onclick: () => {
            store.dispatch({ type: 'ADD', item: { id, name, price } });
            if (navigator.vibrate) navigator.vibrate(15);
          },
        }, '+ Add')));
    });

    // Live menu filter, only if a search field exists on the page.
    const search = $('#menu-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        const q = search.value.trim().toLowerCase();
        $$('tbody tr', table).forEach((r) => (r.hidden = q && !r.textContent.toLowerCase().includes(q)));
      }));
    }

    // Keyboard: Ctrl/Cmd+Z undoes the last cart change.
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && store.canUndo() && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault();
        store.dispatch({ type: 'UNDO' });
      }
    });

    render(store.get());
  }

  /* -------------------------------------------------------------------
     7. RESPONSIVE NAVIGATION (matchMedia, aria-expanded, Esc, outside click)
     ------------------------------------------------------------------- */
  function initMobileNav() {
    const nav = $('nav');
    const list = $('nav ul');
    if (!nav || !list) return;

    list.id ||= 'primary-nav-list';
    const btn = h('button', {
      type: 'button', 'aria-controls': list.id, 'aria-expanded': 'false',
      style: {
        background: 'var(--color-brand-primary, #7a4f2e)', color: '#fefae0', border: 0,
        padding: '.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, margin: '.5rem auto',
      },
    }, '☰ Menu');
    nav.insertBefore(btn, list);

    const mq = matchMedia('(max-width: 768px)');
    const setOpen = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      Object.assign(list.style, { display: open ? 'flex' : 'none', flexDirection: 'column', gap: '.5rem' });
    };
    const sync = () => {
      btn.style.display = mq.matches ? 'block' : 'none';
      if (mq.matches) setOpen(false);
      else Object.assign(list.style, { display: 'flex', flexDirection: '', gap: '' });
    };

    mq.addEventListener('change', sync);
    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && mq.matches) { setOpen(false); btn.focus(); } });
    document.addEventListener('click', (e) => { if (mq.matches && !nav.contains(e.target)) setOpen(false); });
    list.addEventListener('click', (e) => { if (mq.matches && e.target.closest('a')) setOpen(false); });
    sync();

    // Highlight the current page / section automatically.
    $$('a[href]', list).forEach((a) => {
      if (new URL(a.href, location.href).pathname === location.pathname) a.setAttribute('aria-current', 'page');
    });
  }

  /* -------------------------------------------------------------------
     8. FORM VALIDATION (Constraint Validation API, inline errors, draft save)
     ------------------------------------------------------------------- */
  function initForms() {
    $$('form').forEach((form, fi) => {
      form.noValidate = true; // we render our own messages
      const draftKey = `aroma:draft:${location.pathname}:${fi}`;
      const fields = $$('input, textarea, select', form).filter((f) => f.name || f.id);

      const MESSAGES = {
        valueMissing: (f) => `${labelOf(f)} is required.`,
        typeMismatch: (f) => `Enter a valid ${f.type}.`,
        tooShort: (f) => `${labelOf(f)} needs at least ${f.minLength} characters.`,
        patternMismatch: (f) => f.title || `${labelOf(f)} has an invalid format.`,
      };
      const labelOf = (f) => ($(`label[for="${f.id}"]`)?.textContent ?? f.name ?? 'This field').replace(/[*:]/g, '').trim();

      const showError = (f, msg) => {
        let out = $(`#${f.id}-error`);
        if (msg && !out) {
          out = h('small', { id: `${f.id}-error`, role: 'alert', style: { color: '#b3261e', display: 'block' } });
          f.insertAdjacentElement('afterend', out);
        }
        if (out) out.textContent = msg || '';
        f.setAttribute('aria-invalid', String(!!msg));
        msg ? f.setAttribute('aria-describedby', `${f.id}-error`) : f.removeAttribute('aria-describedby');
      };

      const validate = (f) => {
        if (f.type === 'text' && f.required && !f.value.trim()) f.setCustomValidity('empty');
        else f.setCustomValidity('');
        if (f.checkValidity()) { showError(f, ''); return true; }
        const key = Object.keys(MESSAGES).find((k) => f.validity[k]);
        showError(f, key ? MESSAGES[key](f) : 'Please check this field.');
        return false;
      };

      fields.forEach((f) => {
        if (!f.id) f.id = `f-${fi}-${f.name}`;
        f.addEventListener('blur', () => f.value && validate(f));
        f.addEventListener('input', () => f.getAttribute('aria-invalid') === 'true' && validate(f));
      });

      // Restore and auto-save drafts (never for passwords).
      const draft = Storage.get(draftKey, null);
      if (draft) fields.forEach((f) => draft[f.name] && f.type !== 'password' && (f.value = draft[f.name]));
      form.addEventListener('input', debounce(() => {
        Storage.set(draftKey, Object.fromEntries(fields.filter((f) => f.type !== 'password').map((f) => [f.name, f.value])));
      }, 400));

      form.addEventListener('submit', (e) => {
        const bad = fields.filter((f) => !validate(f));
        if (bad.length) {
          e.preventDefault();
          bad[0].focus();
          Toast.show(`Fix ${bad.length} ${bad.length === 1 ? 'field' : 'fields'} to continue.`);
          return;
        }
        Storage.set(draftKey, null);
      });
    });
  }

  /* -------------------------------------------------------------------
     9. BOOT – each module is isolated so one failure can't break the rest
     ------------------------------------------------------------------- */
  const modules = { initTheme, initScrollReveal, initOrderEstimator, initMobileNav, initForms };
  const boot = () => {
    for (const [name, fn] of Object.entries(modules)) {
      try { fn(); } catch (err) { console.error(`[Café Aroma] ${name} failed:`, err); }
    }
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
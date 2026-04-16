/* === Stello — App Logic === */

(function () {
  'use strict';

  // --- Icons (Phosphor regular, 16x16) ---
  const ICONS = {
    'gear': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z"/></svg>',
    'plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>',
    'funnel': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M230.6,49.53A15.81,15.81,0,0,0,216,40H40A16,16,0,0,0,28.19,66.76l.08.09L96,139.17V216a16,16,0,0,0,24.87,13.32l32-21.34A16,16,0,0,0,160,194.66V139.17l67.74-72.32.08-.09A15.8,15.8,0,0,0,230.6,49.53ZM40,56h0Zm106.18,74.58A8,8,0,0,0,144,136v58.66L112,216V136a8,8,0,0,0-2.16-5.47L40,56H216Z"/></svg>',
    'x': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>',
    'frame-corners': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M200,80v32a8,8,0,0,1-16,0V88H160a8,8,0,0,1,0-16h32A8,8,0,0,1,200,80ZM96,168H72V144a8,8,0,0,0-16,0v32a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"/></svg>',
    'arrow-up-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/></svg>',
    'magnifying-glass': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>',
    'caret-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>',
    'caret-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z"/></svg>',
    'shuffle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M237.66,178.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L212.69,192H200.94a72.12,72.12,0,0,1-58.59-30.15l-41.72-58.4A56.1,56.1,0,0,0,55.06,80H32a8,8,0,0,1,0-16H55.06a72.12,72.12,0,0,1,58.59,30.15l41.72,58.4A56.1,56.1,0,0,0,200.94,176h11.75l-10.35-10.34a8,8,0,0,1,11.32-11.32ZM143,107a8,8,0,0,0,11.16-1.86l1.2-1.67A56.1,56.1,0,0,1,200.94,80h11.75L202.34,90.34a8,8,0,0,0,11.32,11.32l24-24a8,8,0,0,0,0-11.32l-24-24a8,8,0,0,0-11.32,11.32L212.69,64H200.94a72.12,72.12,0,0,0-58.59,30.15l-1.2,1.67A8,8,0,0,0,143,107Zm-30,42a8,8,0,0,0-11.16,1.86l-1.2,1.67A56.1,56.1,0,0,1,55.06,176H32a8,8,0,0,0,0,16H55.06a72.12,72.12,0,0,0,58.59-30.15l1.2-1.67A8,8,0,0,0,113,149Z"/></svg>',
  };
  function icon(name) { return ICONS[name] || ''; }

  // --- State ---
  let allItems = [];
  let itemsBySlug = {};      // slug -> item lookup
  let activeTags = [];      // [{tag, category}]
  let searchQuery = '';
  let relatedIndex = {};     // slug -> Set of related slugs
  let loadedWeeks = new Set(); // track which weeks have been rendered

  // --- Category colors (for pills) ---
  const CAT_CLASS = {
    format: 'tag-format',
    domain: 'tag-domain',
    style: 'tag-style',
    subject: 'tag-subject',
    tool: 'tag-tool',
    location: 'tag-location',
    mood: 'tag-mood',
    color: 'tag-color',
  };

  // Warm earthy hues for placeholders
  const PLACEHOLDER_HUES = [18, 80, 38, 140, 25, 45, 12, 100];

  // Color name → CSS color for tag swatches
  const COLOR_MAP = {
    // Reds / pinks
    red: '#c0392b', crimson: '#dc143c', burgundy: '#800020', maroon: '#800000',
    scarlet: '#ff2400', ruby: '#e0115f', cherry: '#de3163', rose: '#ff007f',
    blush: '#de5d83', coral: '#ff7f50', salmon: '#fa8072', pink: '#e8909c',
    magenta: '#c20078', fuchsia: '#c154c1', mauve: '#e0b0ff', dusty_rose: '#dcae96',
    'dusty-rose': '#dcae96', raspberry: '#e30b5c', wine: '#722f37', terracotta: '#e2725b',
    // Oranges
    orange: '#e67e22', tangerine: '#ff9966', peach: '#ffcba4', apricot: '#fbceb1',
    amber: '#ffbf00', rust: '#b7410e', copper: '#b87333', burnt_orange: '#cc5500',
    'burnt-orange': '#cc5500', sienna: '#a0522d',
    // Yellows
    yellow: '#f1c40f', gold: '#ffd700', golden: '#daa520', mustard: '#e1ad01',
    lemon: '#fff44f', cream: '#fffdd0', butter: '#ffff99', saffron: '#f4c430',
    honey: '#eb9605', wheat: '#f5deb3', sand: '#c2b280',
    // Greens
    green: '#27ae60', emerald: '#50c878', lime: '#32cd32', olive: '#808000',
    sage: '#bcb88a', mint: '#98ff98', teal: '#008080', forest: '#228b22',
    'forest-green': '#228b22', jade: '#00a86b', chartreuse: '#7fff00',
    moss: '#8a9a5b', avocado: '#568203', pistachio: '#93c572', seafoam: '#93e9be',
    // Blues
    blue: '#2980b9', navy: '#001f3f', cobalt: '#0047ab', royal: '#4169e1',
    'royal-blue': '#4169e1', sky: '#87ceeb', 'sky-blue': '#87ceeb',
    azure: '#007fff', cerulean: '#007ba7', turquoise: '#40e0d0', aqua: '#00ffff',
    indigo: '#4b0082', periwinkle: '#ccccff', slate: '#708090', 'slate-blue': '#6a5acd',
    steel: '#4682b4', 'steel-blue': '#4682b4', powder: '#b0e0e6', 'powder-blue': '#b0e0e6',
    // Purples
    purple: '#8e44ad', violet: '#7f00ff', lavender: '#b57edc', plum: '#8e4585',
    lilac: '#c8a2c8', amethyst: '#9966cc', orchid: '#da70d6', grape: '#6f2da8',
    eggplant: '#614051', mulberry: '#c54b8c',
    // Browns
    brown: '#795548', chocolate: '#7b3f00', coffee: '#6f4e37', mocha: '#967969',
    tan: '#d2b48c', taupe: '#483c32', caramel: '#ffd59a', cinnamon: '#d2691e',
    walnut: '#773f1a', chestnut: '#954535', espresso: '#3c1414', umber: '#635147',
    // Neutrals
    black: '#1a1a1a', charcoal: '#36454f', 'dark-gray': '#555555',
    gray: '#888888', grey: '#888888', silver: '#c0c0c0', 'light-gray': '#d3d3d3',
    white: '#f5f5f5', ivory: '#fffff0', bone: '#e3dac9', pearl: '#eae0c8',
    beige: '#f5f5dc', off_white: '#faf0e6', 'off-white': '#faf0e6',
  };

  // Returns the hex color of an item's highest-weighted `color` tag, or '#ffffff'.
  function dominantColor(item) {
    if (!item || !item.tags) return '#ffffff';
    const colorTags = item.tags.filter(t => t.category === 'color');
    if (!colorTags.length) return '#ffffff';
    const top = colorTags.reduce((a, b) => (b.weight > a.weight ? b : a));
    const key = top.tag;
    return COLOR_MAP[key] || COLOR_MAP[key.replace(/[-_\s]/g, '_')] || '#ffffff';
  }

  function hexToRgba(hex, a) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // --- Theme Manager ---
  const ThemeManager = {
    STORAGE_KEY: 'stello.theme',
    defaults: { mode: 'dark', accent: 'amber' },

    load() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
      } catch { return { ...this.defaults }; }
    },

    apply(prefs) {
      document.documentElement.setAttribute('data-theme', prefs.mode);
      document.documentElement.setAttribute('data-accent', prefs.accent);
    },

    save(prefs) {
      try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(prefs)); } catch {}
    },

    setMode(mode) {
      const prefs = this.load();
      prefs.mode = mode;
      this.save(prefs);
      this.apply(prefs);
    },

    setAccent(accent) {
      const prefs = this.load();
      prefs.accent = accent;
      this.save(prefs);
      this.apply(prefs);
    },

    init() {
      const prefs = this.load();
      this.apply(prefs);
    }
  };

  // --- Auth-aware fetch wrapper ---
  function apiFetch(url, opts = {}) {
    if (window.Stello) return Stello.apiFetch(url, opts);
    return fetch(url, opts); // local dev fallback
  }

  // --- Login arrival fallback (GSAP) ---
  // When the inline <head> gate in index.html detects a browser without
  // cross-document view-transition support, it adds .arriving-from-login
  // to <html>. This helper measures the natural compact state, then tweens
  // the header's hero footprint back to compact — mimicking the native
  // @view-transition morph (see ::view-transition-* rules in style.css).
  function runLoginArrivalFallback() {
    const html = document.documentElement;
    if (!html.classList.contains('arriving-from-login')) return;

    const header = document.querySelector('.header');
    if (!header) { html.classList.remove('arriving-from-login'); return; }

    // Reduced motion — or GSAP failed to load: snap straight to the
    // compact state, skip the tween.
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof window.gsap === 'undefined') {
      html.classList.remove('arriving-from-login');
      return;
    }

    // Measure the natural compact state by briefly removing the hero class.
    // Same tick, no paint between — offsetHeight forces layout only.
    html.classList.remove('arriving-from-login');
    const naturalHeight = header.offsetHeight;
    const naturalPad = parseFloat(getComputedStyle(header).paddingTop) + 'px';
    html.classList.add('arriving-from-login');

    // Parallel tween matching ::view-transition-old/new durations in
    // style.css: header 275ms, root (body opacity) 225ms, same ease.
    const ease = 'cubic-bezier(0.2, 0, 0, 1)';
    const tl = window.gsap.timeline({
      onComplete: () => {
        window.gsap.set([header, document.body], { clearProps: 'all' });
        html.classList.remove('arriving-from-login');
      }
    });
    tl.to(header, { height: naturalHeight, padding: naturalPad, duration: 0.275, ease }, 0);
    tl.to(document.body, { opacity: 1, duration: 0.225, ease }, 0);
  }

  // --- DOM refs ---
  const $grid = document.getElementById('masonry-grid');
  const $search = document.getElementById('search-input');
  const $activeFilters = document.getElementById('active-filters');
  const $headerCount = document.getElementById('header-count');
  // Filter UI elements live inside the tool panel when open; looked up dynamically.
  const $drawer = () => document.getElementById('filter-tag-drawer');

  // --- Version ---
  const APP_VERSION = '2026.001';

  // --- Boot ---
  async function init() {
    ThemeManager.init();

    // One-shot "just logged in" flag from ?welcome=1. Drives the post-login
    // stagger reveal defined in style.css. Stripped from the URL so a reload
    // doesn't replay the animation.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('welcome')) {
        // If the inline <head> gate in index.html flagged this browser as
        // lacking cross-document view-transition support, drive the header
        // morph with GSAP instead. Runs before .just-logged-in so the hero
        // footprint is in place while the stagger timers tick.
        runLoginArrivalFallback();
        document.body.classList.add('just-logged-in');
        params.delete('welcome');
        const qs = params.toString();
        const clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState(null, '', clean);
        // Remove the flag after the longest animation finishes so it doesn't
        // linger on future grid re-renders.
        setTimeout(() => document.body.classList.remove('just-logged-in'), 900);
      }
    } catch (e) { /* ignore — animation is nice-to-have */ }

    // Auth guard — Stello client is required for multi-tenant data
    if (!window.Stello) {
      console.error('Stello auth module failed to load');
      return;
    }
    const session = await Stello.requireAuth();
    if (!session) return; // redirecting to login
    Stello.initAuthListener();

    // Load items from Supabase, paging through results (default limit is 1000)
    const client = Stello.getClient();
    const userId = Stello.getUserId();
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('items')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('Failed to load items from Supabase:', error.message);
        break;
      }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
    }
    allItems = all.map(normalizeItem);

    // Sort by date descending (most recent first)
    allItems.sort((a, b) => {
      const da = a.added_at ? new Date(a.added_at).getTime() : 0;
      const db = b.added_at ? new Date(b.added_at).getTime() : 0;
      return db - da;
    });

    itemsBySlug = {};
    allItems.forEach(item => { itemsBySlug[item.slug] = item; });

    buildRelatedIndex();
    renderStats();
    renderGrid();
    injectHeaderIcons();
    bindEvents();
    PanelManager.init();
  }

  /** Normalize a Supabase item row to match the frontend shape */
  function normalizeItem(row) {
    const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []);
    return {
      ...row,
      tags,
      has_image: !!row.og_image_path,
      image_path: row.og_image_path || null,
    };
  }

  function injectHeaderIcons() {
    document.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      if (name && ICONS[name]) el.innerHTML = icon(name);
    });
  }

  // --- Relatedness Index ---
  function buildRelatedIndex() {
    const tagToSlugs = {};
    allItems.forEach(item => {
      item.tags.forEach(t => {
        if (t.category === 'format' || t.weight < 0.5) return;
        const key = t.category + ':' + t.tag;
        if (!tagToSlugs[key]) tagToSlugs[key] = [];
        tagToSlugs[key].push(item.slug);
      });
    });

    relatedIndex = {};
    allItems.forEach(item => {
      const candidates = {};
      item.tags.forEach(t => {
        if (t.category === 'format' || t.weight < 0.5) return;
        const key = t.category + ':' + t.tag;
        const siblings = tagToSlugs[key] || [];
        siblings.forEach(slug => {
          if (slug !== item.slug) {
            candidates[slug] = (candidates[slug] || 0) + 1;
          }
        });
      });
      const related = new Set();
      for (const [slug, count] of Object.entries(candidates)) {
        if (count >= 2) related.add(slug);
      }
      relatedIndex[item.slug] = related;
    });
  }

  // --- Stats (inline count) ---
  function renderStats() {
    $headerCount.textContent = allItems.length.toLocaleString();
  }


  // --- Tag Drawer ---
  function collectTags() {
    const map = {};
    allItems.forEach(i => {
      i.tags.forEach(t => {
        if (!map[t.category]) map[t.category] = {};
        map[t.category][t.tag] = (map[t.category][t.tag] || 0) + 1;
      });
    });
    return map;
  }

  // Default: only the first category (domain) is expanded; everything else collapsed.
  let expandedCategories = new Set(['domain']);
  let tagSearchQuery = '';

  const CATEGORY_LABELS = {
    domain: 'Domains', subject: 'Subjects', format: 'Formats',
    tool: 'Tools', style: 'Styles', mood: 'Moods',
    location: 'Locations', color: 'Colors',
  };

  function renderTagDrawer() {
    const el = $drawer();
    if (!el) return;
    const map = collectTags();
    const order = ['domain', 'subject', 'format', 'tool', 'style', 'mood', 'location', 'color'];
    const categories = order.filter(c => map[c]);
    Object.keys(map).forEach(c => { if (!categories.includes(c)) categories.push(c); });

    const q = tagSearchQuery.trim().toLowerCase();

    el.innerHTML = categories.map(cat => {
      const entries = Object.entries(map[cat]).sort((a, b) => b[1] - a[1]);
      const filtered = q ? entries.filter(([tag]) => tag.toLowerCase().includes(q)) : entries;
      if (q && filtered.length === 0) return ''; // hide empty sections during search

      // When searching, auto-expand any matching section; otherwise respect toggle state
      const isExpanded = q ? true : expandedCategories.has(cat);
      const label = CATEGORY_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
      const caret = isExpanded ? icon('caret-up') : icon('caret-down');
      const count = filtered.length;

      const chipsHtml = filtered.map(([tag, count]) => {
        const cls = CAT_CLASS[cat] || 'tag-format';
        const isActive = activeTags.some(a => a.tag === tag && a.category === cat);
        const dot = cat === 'color' ? `<span class="color-dot" style="background:${COLOR_MAP[tag] || COLOR_MAP[tag.replace(/[-_\s]/g, '_')] || '#888'}"></span>` : '';
        return `<span class="tag-chip ${cls}${isActive ? ' active' : ''}" data-tag="${tag}" data-cat="${cat}">${dot}${tag} <span class="chip-count">${count}</span></span>`;
      }).join('');

      return `<div class="tag-category-group${isExpanded ? ' is-expanded' : ''}" data-cat="${cat}">
        <button type="button" class="tag-category-header" data-cat="${cat}" aria-expanded="${isExpanded}">
          <span class="tag-category-label">${label}</span>
          <span class="tag-category-count">${count}</span>
          <span class="tag-category-caret">${caret}</span>
        </button>
        <div class="tag-chips">${chipsHtml}</div>
      </div>`;
    }).join('');
  }

  // --- Grid ---
  function getFilteredItems() {
    return allItems.filter(item => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title.toLowerCase().includes(q);
        const inSummary = (item.summary || '').toLowerCase().includes(q);
        const inTags = item.tags.some(t => t.tag.toLowerCase().includes(q));
        if (!inTitle && !inSummary && !inTags) return false;
      }
      if (activeTags.length > 0) {
        return activeTags.every(at =>
          item.tags.some(t => t.tag === at.tag && t.category === at.category)
        );
      }
      return true;
    });
  }

  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function formatWeekLabel(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const week = getISOWeek(d);
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    return `Week ${week} — ${month}`;
  }

  function getWeekKey(dateStr) {
    if (!dateStr) return 'undated';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'undated';
    const week = getISOWeek(d);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function groupByWeek(items) {
    const weeks = [];
    let currentWeekKey = null;
    let currentWeek = null;

    items.forEach((item, idx) => {
      const weekKey = getWeekKey(item.added_at);
      if (weekKey !== currentWeekKey) {
        currentWeekKey = weekKey;
        currentWeek = {
          key: weekKey,
          label: formatWeekLabel(item.added_at) || 'Undated',
          items: [],
        };
        weeks.push(currentWeek);
      }
      currentWeek.items.push({ item, idx });
    });
    return weeks;
  }

  function renderWeekCards(weekKey) {
    const container = $grid.querySelector(`.masonry-section[data-week="${weekKey}"]`);
    const header = $grid.querySelector(`.date-section-header[data-week="${weekKey}"]`);
    const toggleLink = header?.querySelector('.week-show-link');
    if (!container) return;

    const items = getFilteredItems();
    const weekItems = items.filter(i => getWeekKey(i.added_at) === weekKey);

    container.innerHTML = weekItems.map((item, idx) => renderCard(item, idx)).join('');
    container.style.display = '';
    loadedWeeks.add(weekKey);
    header?.classList.add('is-expanded');
    if (header) {
      header.setAttribute('aria-expanded', 'true');
      header.setAttribute('aria-label', 'Collapse week');
    }
    if (toggleLink) toggleLink.innerHTML = icon('caret-up');
    PanelManager.refreshAfterGridRender();
  }

  function collapseWeek(weekKey) {
    const container = $grid.querySelector(`.masonry-section[data-week="${weekKey}"]`);
    const header = $grid.querySelector(`.date-section-header[data-week="${weekKey}"]`);
    const toggleLink = header?.querySelector('.week-show-link');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'none';
    loadedWeeks.delete(weekKey);
    header?.classList.remove('is-expanded');
    if (header) {
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-label', 'Expand week');
    }
    if (toggleLink) toggleLink.innerHTML = icon('caret-down');
    PanelManager.refreshAfterGridRender();
  }

  const isSearchActive = () => searchQuery || activeTags.length > 0;

  function renderGrid() {
    const items = getFilteredItems();

    if (items.length === 0) {
      $grid.innerHTML = '<div class="no-results">No items match your filters.</div>';
      return;
    }

    const weeks = groupByWeek(items);
    const searching = isSearchActive();

    // When searching/filtering, reset lazy state and show all results
    if (searching) {
      loadedWeeks = new Set(weeks.map(w => w.key));
    } else {
      // Default: only first week is loaded
      loadedWeeks = new Set();
      if (weeks.length > 0) loadedWeeks.add(weeks[0].key);
    }

    let html = '';
    weeks.forEach((week, wi) => {
      const isLoaded = loadedWeeks.has(week.key);
      const caret = isLoaded ? icon('caret-up') : icon('caret-down');
      const aria = isLoaded ? 'Collapse week' : 'Expand week';
      const headerClass = 'date-section-header' + (isLoaded ? ' is-expanded' : '');
      html += `<div class="${headerClass}" data-week="${week.key}" role="button" tabindex="0" aria-expanded="${isLoaded}" aria-label="${aria}" style="grid-column: 1 / -1"><span>${week.label}</span><span class="week-show-link" aria-hidden="true">${caret}</span></div>`;
      html += `<div class="masonry-section" data-week="${week.key}" style="${isLoaded ? '' : 'display:none'}">`;
      if (isLoaded) {
        html += week.items.map(e => renderCard(e.item, e.idx)).join('');
      }
      html += '</div>';
    });

    $grid.innerHTML = html;

    // Tag each direct child with a --idx so the post-login stagger reveal
    // (style.css) can cascade in. Cheap enough to run on every render.
    const children = $grid.children;
    for (let i = 0; i < children.length; i++) {
      children[i].style.setProperty('--idx', i);
      // Cards inside each week section also stagger independently so the first
      // row appears without waiting for the whole list.
      const cards = children[i].querySelectorAll(':scope > .card');
      for (let j = 0; j < cards.length; j++) {
        cards[j].style.setProperty('--idx', j);
      }
    }

    PanelManager.refreshAfterGridRender();
  }

  function cleanSummary(text) {
    if (!text) return text;
    // Strip leading/trailing quotes and whitespace first
    let cleaned = text.replace(/^[''""\s]+/, '').replace(/[''""\s]+$/, '');
    // Strip Instagram pattern: "14K likes, 35 comments - username on Date: 'actual content"
    cleaned = cleaned.replace(/^\d[\d,.KkMm]*\s*likes?,\s*\d[\d,.KkMm]*\s*comments?\s*-\s*\S+\s+on\s+\w+\s+\d{1,2},?\s+\d{4}[\s\u200E:]*[''""]?\s*/i, '');
    // Strip "Saved from domain:" prefix
    cleaned = cleaned.replace(/^Saved from \S+:\s*/i, '');
    // Strip any remaining leading quotes/whitespace
    cleaned = cleaned.replace(/^[''""\s]+/, '');
    return cleaned.trim();
  }

  function truncateWords(text, maxWords) {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + '...';
  }

  function cssSlug(slug) {
    return slug.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  function renderCard(item, idx) {
    let thumbHtml;
    const hasImage = item.has_image && item.image_path;
    const vtName = `card-${cssSlug(item.slug)}`;

    const hasTextContent = !hasImage && item.summary
      && item.summary.length > 30
      && !item.summary.startsWith('Saved from');

    if (hasImage) {
      thumbHtml = `<img class="card-thumb" src="${item.image_path}" alt="" loading="lazy" style="view-transition-name:${vtName}" onerror="this.parentElement.classList.add('img-error')">`;
    } else if (hasTextContent) {
      const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
      const truncated = escHtml(truncateWords(cleanSummary(item.summary), 200));
      const light = ThemeManager.load().mode === 'light';
      thumbHtml = `<div class="card-text-content" style="view-transition-name:${vtName};background:hsl(${hue},${light ? '12%,92%' : '15%,13%'})">${truncated}</div>`;
    } else {
      const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
      const letter = (item.title || '?')[0].toUpperCase();
      const light = ThemeManager.load().mode === 'light';
      thumbHtml = `<div class="card-placeholder" style="view-transition-name:${vtName};background:hsl(${hue},${light ? '10%,93%' : '20%,16%'})">${letter}</div>`;
    }

    // URL pill — bottom-right. Default: 20% color bg + white text.
    // Hover: fully opaque bg + color-tinted text (or dark if no color tag).
    const pillColor = dominantColor(item);
    const hasColorTag = pillColor !== '#ffffff';
    const pillBg = hasColorTag ? hexToRgba(pillColor, 0.2) : 'rgba(255, 255, 255, 0.2)';
    const pillBgHover = '#ffffff';
    const pillColorHover = hasColorTag ? pillColor : '#1a1a17';
    const urlPill = item.domain
      ? `<a class="card-url-pill"${item.source_url ? ` href="${escHtml(item.source_url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener"` : ''} style="--pill-bg:${pillBg};--pill-bg-hover:${pillBgHover};--pill-color-hover:${pillColorHover}" onclick="event.stopPropagation()">${escHtml(item.domain)}</a>`
      : '';

    const cardClass = hasImage ? ' card-visual' : (hasTextContent ? ' card-text' : '');

    return `<div class="card${cardClass}" data-slug="${item.slug}" tabindex="-1">
      <div class="card-visual-area">
        ${thumbHtml}
        <div class="card-overlay"></div>
        <div class="card-title-badge">${escHtml(item.title || '')}</div>
        ${urlPill}
      </div>
    </div>`;
  }

  // Format date as "16 Jun 2026"
  function formatHumanDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Format week as "W16 2026" (ISO week)
  function formatWeekTag(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `W${String(getISOWeek(d)).padStart(2, '0')} ${d.getFullYear()}`;
  }

  // Builds the expanded-body HTML used inside a side panel.
  // `sharedTagSet`: optional Set<string> of "category:tag" keys to highlight with .tag-shared.
  function buildPanelBodyHTML(item, sharedTagSet) {
    const panelImage = (item.has_image && item.image_path)
      ? `<div class="panel-image"><img src="${escHtml(item.image_path).replace(/"/g, '&quot;')}" alt=""></div>`
      : '';

    return `${panelImage}<div class="card-expanded-body">
      ${item.summary ? `<div class="card-expanded-summary">${escHtml(cleanSummary(item.summary))}</div>` : ''}
      <div class="card-expanded-md" data-slug="${item.slug}"></div>
    </div>`;
  }

  // Builds the sticky footer with tags (left) + date/week (right)
  function buildPanelFooterHTML(item, sharedTagSet) {
    const tagPills = item.tags
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 16)
      .map(t => {
        const shared = sharedTagSet && sharedTagSet.has(t.category + ':' + t.tag);
        return renderTagPill(t.tag, t.category, shared);
      }).join('');

    const date = formatHumanDate(item.added_at);
    const week = formatWeekTag(item.added_at);

    return `<div class="panel-footer-tags">${tagPills}</div>
      <div class="panel-footer-date">
        ${date ? `<div class="panel-footer-date-main">${date}</div>` : ''}
        ${week ? `<div class="panel-footer-date-week">${week}</div>` : ''}
      </div>`;
  }

  // Loads and renders the markdown body into a panel's .card-expanded-md element.
  function loadMarkdownInto(container) {
    if (!container || container.dataset.loaded) return;
    container.dataset.loaded = 'true';
    const slug = container.dataset.slug;
    const item = itemsBySlug[slug];
    if (!item || !item.body_markdown) return;
    const body = stripSections(item.body_markdown, ['Summary', 'Key Details', 'Visual Assets']);
    if (body) container.innerHTML = renderMarkdown(body);
  }

  // --- Active filter pills ---
  function renderActiveFilters() {
    if (activeTags.length === 0) {
      $activeFilters.innerHTML = '';
      return;
    }
    $activeFilters.innerHTML = activeTags.map((at, i) =>
      `<span class="active-filter-pill" data-idx="${i}">${at.tag} <span class="x">&times;</span></span>`
    ).join('') + `<button class="clear-filters-btn" id="clear-filters">Clear all</button>`;
  }

  // --- Related card highlighting ---
  let hoverTimeout = null;

  function highlightRelated(slugs) {
    if (!Array.isArray(slugs)) slugs = [slugs];
    const related = new Set();
    slugs.forEach(s => {
      related.add(s);
      (relatedIndex[s] || new Set()).forEach(r => related.add(r));
    });
    $grid.querySelectorAll('.card').forEach(card => {
      card.classList.toggle('card-focused', related.has(card.dataset.slug));
    });
  }

  function clearHighlight() {
    $grid.querySelectorAll('.card-focused').forEach(c => c.classList.remove('card-focused'));
  }

  // Re-highlight based on open panels (called after panel open/close)
  function syncHighlightsToOpenPanels(panelSlugs) {
    if (panelSlugs && panelSlugs.length > 0) {
      highlightRelated(panelSlugs);
    } else {
      clearHighlight();
    }
  }

  // --- Markdown helpers ---
  function stripSections(md, names) {
    const pattern = new RegExp('^##\\s+(' + names.join('|') + ')\\s*$', 'i');
    const lines = md.split('\n');
    const result = [];
    let skipping = false;
    for (const line of lines) {
      if (/^##\s/.test(line)) {
        skipping = pattern.test(line);
      }
      if (!skipping) result.push(line);
    }
    return result.join('\n').trim();
  }

  function renderMarkdown(md) {
    let html = md;
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.split('\n\n').map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<')) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    return html;
  }

  // --- Events ---
  function bindEvents() {
    $search.addEventListener('input', function () {
      searchQuery = this.value.trim();
      renderGrid();
    });

    // Tool panel toggles (Filters, Import, Settings)
    document.getElementById('filter-panel-btn')?.addEventListener('click', () => PanelManager.openTool('filters'));
    document.getElementById('import-btn')?.addEventListener('click', () => PanelManager.openTool('import'));
    document.getElementById('settings-btn')?.addEventListener('click', () => PanelManager.openTool('settings'));

    // Render tool bodies when the tool panel opens
    document.addEventListener('toolpanel:rendered', (e) => {
      const { type } = e.detail;
      if (type === 'filters') {
        renderTagDrawer();
        bindFilterPanelBody();
      } else if (type === 'settings') {
        loadSettingsIntoPanel();
      } else if (type === 'import') {
        bindImportPanelBody();
      }
    });

    // Delegated clicks for tag chips + category headers (tool panel bodies re-render)
    document.addEventListener('click', (e) => {
      const header = e.target.closest('.tag-category-header');
      if (header) {
        const cat = header.dataset.cat;
        if (expandedCategories.has(cat)) expandedCategories.delete(cat);
        else expandedCategories.add(cat);
        renderTagDrawer();
        return;
      }
      const chipInDrawer = e.target.closest('#filter-tag-drawer .tag-chip');
      if (!chipInDrawer) return;
      const tag = chipInDrawer.dataset.tag;
      const cat = chipInDrawer.dataset.cat;
      const idx = activeTags.findIndex(a => a.tag === tag && a.category === cat);
      if (idx >= 0) activeTags.splice(idx, 1);
      else activeTags.push({ tag, category: cat });
      renderTagDrawer();
      renderActiveFilters();
      renderGrid();
    });

    $activeFilters.addEventListener('click', function (e) {
      if (e.target.id === 'clear-filters' || e.target.closest('#clear-filters')) {
        activeTags = [];
        renderTagDrawer();
        renderActiveFilters();
        renderGrid();
        return;
      }
      const pill = e.target.closest('.active-filter-pill');
      if (!pill) return;
      const idx = parseInt(pill.dataset.idx, 10);
      activeTags.splice(idx, 1);
      renderTagDrawer();
      renderActiveFilters();
      renderGrid();
    });

    // Week Expand/Collapse toggle — entire bar is clickable (and keyboard-activatable)
    $grid.addEventListener('click', function (e) {
      const bar = e.target.closest('.date-section-header');
      if (!bar) return;
      e.stopPropagation();
      const key = bar.dataset.week;
      if (loadedWeeks.has(key)) collapseWeek(key);
      else renderWeekCards(key);
    });
    $grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const bar = e.target.closest('.date-section-header');
      if (!bar) return;
      e.preventDefault();
      const key = bar.dataset.week;
      if (loadedWeeks.has(key)) collapseWeek(key);
      else renderWeekCards(key);
    });

    // Card hover -> highlight related (falls back to panel highlights on leave)
    $grid.addEventListener('mouseenter', function (e) {
      const card = e.target.closest('.card');
      if (!card) return;
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        highlightRelated(card.dataset.slug);
      }, 2000);
    }, true);

    $grid.addEventListener('mouseleave', function (e) {
      const card = e.target.closest('.card');
      if (!card) return;
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        if (!$grid.querySelector('.card:hover')) {
          syncHighlightsToOpenPanels(PanelManager.getOpenSlugs());
        }
      }, 100);
    }, true);

    // Card click -> open item in a side panel
    $grid.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      const card = e.target.closest('.card');
      if (!card || !card.dataset.slug) return;
      const secondary = e.metaKey || e.ctrlKey;
      PanelManager.open(card.dataset.slug, { secondary, originCard: card });
    });
  }

  // --- Utility ---
  function renderTagPill(tag, category, shared) {
    const cls = CAT_CLASS[category] || 'tag-format';
    const sharedCls = shared ? ' tag-shared' : '';
    if (category === 'color') {
      const hex = COLOR_MAP[tag] || COLOR_MAP[tag.replace(/[-_\s]/g, '_')] || '#888';
      return `<span class="card-tag ${cls}${sharedCls}"><span class="color-dot" style="background:${hex}"></span>${tag}</span>`;
    }
    return `<span class="card-tag ${cls}${sharedCls}">${tag}</span>`;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Capture: Paste handler ---
  function bindPasteHandler() {
    document.addEventListener('paste', (e) => {
      // Skip if any input or textarea is focused (search, settings, import modal)
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      // Skip if any tool panel is open (user might be interacting with it)
      if (document.querySelector('.panel-tool')) return;

      const text = e.clipboardData.getData('text/plain');
      const files = e.clipboardData.files;

      const urls = text ? text.match(/https?:\/\/[^\s<>"']+/g) : null;

      if (files && files.length > 0) {
        for (const file of files) {
          if (file.type.startsWith('image/')) captureImage(file);
        }
        e.preventDefault();
      } else if (urls && urls.length > 0) {
        e.preventDefault();
        if (urls.length === 1) captureURL(urls[0]);
        else captureBulkURLs(urls);
      } else if (text && text.trim() && text.trim().length > 5) {
        e.preventDefault();
        captureText(text.trim());
      }
    });
  }

  function insertPlaceholder(id) {
    const firstSection = $grid.querySelector('.masonry-section');
    if (!firstSection) return;
    const ph = document.createElement('div');
    ph.className = 'card card-adding';
    ph.dataset.placeholderId = id;
    ph.innerHTML = `<div class="card-visual-area"><div class="card-placeholder adding-pulse"><span>Adding\u2026</span></div></div>`;
    firstSection.prepend(ph);
  }

  function replacePlaceholder(id, item) {
    const ph = $grid.querySelector(`[data-placeholder-id="${id}"]`);
    if (ph) {
      ph.outerHTML = renderCard(item, 0);
    } else {
      // Fallback: prepend to first section
      const firstSection = $grid.querySelector('.masonry-section');
      if (firstSection) firstSection.insertAdjacentHTML('afterbegin', renderCard(item, 0));
    }
    // Add to allItems for search/filter consistency
    allItems.unshift(item);
    renderStats();
  }

  async function captureURL(urlStr) {
    const id = 'ph-' + Date.now();
    insertPlaceholder(id);
    try {
      const res = await apiFetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', content: urlStr }),
      });
      const item = await res.json();
      if (res.status === 409) {
        removePlaceholder(id);
        showToast('Item already exists: ' + (item.existing?.title || urlStr));
        return;
      }
      if (!res.ok) {
        removePlaceholder(id);
        showToast('Capture failed');
        return;
      }
      replacePlaceholder(id, item);
      showToast('Added: ' + item.title);
      // Poll for analysis completion
      pollForReview(item.slug);
    } catch (err) {
      removePlaceholder(id);
      showToast('Error: ' + err.message);
    }
  }

  async function captureImage(file) {
    const id = 'ph-' + Date.now() + Math.random();
    insertPlaceholder(id);
    try {
      const buf = await file.arrayBuffer();
      const res = await apiFetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: buf,
      });
      const item = await res.json();
      if (!res.ok) { removePlaceholder(id); showToast('Image capture failed'); return; }
      replacePlaceholder(id, item);
      showToast('Added image');
      pollForReview(item.slug);
    } catch (err) {
      removePlaceholder(id);
      showToast('Error: ' + err.message);
    }
  }

  async function captureText(text) {
    const id = 'ph-' + Date.now();
    insertPlaceholder(id);
    try {
      const res = await apiFetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', content: text }),
      });
      const item = await res.json();
      if (!res.ok) { removePlaceholder(id); showToast('Text capture failed'); return; }
      replacePlaceholder(id, item);
      showToast('Added note: ' + item.title);
    } catch (err) {
      removePlaceholder(id);
      showToast('Error: ' + err.message);
    }
  }

  function removePlaceholder(id) {
    const ph = $grid.querySelector(`[data-placeholder-id="${id}"]`);
    if (ph) ph.remove();
  }

  // --- Bulk capture (polling-based for serverless) ---
  async function captureBulkURLs(urls) {
    const ids = urls.map((_, i) => 'bulk-' + Date.now() + '-' + i);
    ids.forEach(id => insertPlaceholder(id));
    showToast(`Adding ${urls.length} items...`);

    try {
      const res = await apiFetch('/api/capture-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const { batchId, completed: initialCompleted, status: initialStatus } = await res.json();

      // Handle results from inline processing
      if (initialCompleted > 0) {
        const statusRes = await apiFetch(`/api/batch-status?id=${batchId}`);
        const statusData = await statusRes.json();
        processResults(statusData.results, ids);
      }

      // If all done inline, no need to poll
      if (initialStatus === 'completed') {
        showToast(`Done! Added ${urls.length} items.`);
        return;
      }

      // Poll for remaining items
      const processed = new Set();
      const poll = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`/api/batch-status?id=${batchId}`);
          const data = await statusRes.json();
          processResults(data.results, ids, processed);

          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(poll);
            showToast(`Done! Added ${data.completed} items.`);
            // Clean any remaining placeholders
            ids.forEach(id => removePlaceholder(id));
          }
        } catch {
          clearInterval(poll);
          ids.forEach(id => removePlaceholder(id));
        }
      }, 3000);
    } catch (err) {
      ids.forEach(id => removePlaceholder(id));
      showToast('Bulk capture failed');
    }
  }

  function processResults(results, ids, processed) {
    if (!results) return;
    const seen = processed || new Set();
    for (const r of results) {
      if (seen.has(r.index)) continue;
      seen.add(r.index);
      const phId = ids[r.index];
      if (r.item && !r.item.is_duplicate && !r.error) {
        const item = r.item.og_image_path ? normalizeItem(r.item) : r.item;
        replacePlaceholder(phId, item);
        pollForReview(item.slug);
      } else {
        removePlaceholder(phId);
      }
    }
  }

  // --- Question card (in-grid) ---
  let pendingReviews = [];

  function pollForReview(slug) {
    setTimeout(async () => {
      try {
        const client = Stello.getClient();
        const { data } = await client
          .from('items')
          .select('*')
          .eq('slug', slug)
          .eq('user_id', Stello.getUserId())
          .single();
        const item = data ? normalizeItem(data) : null;

        if (item && item.needs_review) {
          pendingReviews.push(item);
          insertQuestionCard(item);
        }
        if (item) {
          const idx = allItems.findIndex(i => i.slug === slug);
          if (idx >= 0) allItems[idx] = item;
          const cardEl = $grid.querySelector(`.card[data-slug="${slug}"]:not(.card-question)`);
          if (cardEl) cardEl.outerHTML = renderCard(item, 0);
        }
      } catch { /* silent */ }
    }, 15000);
  }

  function renderQuestionCardHtml(item) {
    const imgHtml = item.has_image && item.image_path
      ? `<img class="card-thumb" src="${item.image_path}" alt="" loading="lazy">`
      : `<div class="card-placeholder" style="min-height:80px">${(item.title || '?')[0].toUpperCase()}</div>`;

    return `<div class="card card-question card-expanded" data-slug="${item.slug}" data-question="true">
      <div class="card-visual-area">${imgHtml}</div>
      <div class="card-expanded-body" style="display:block">
        <div class="card-expanded-title">${escHtml(item.title)}</div>
        <div class="card-expanded-meta">
          ${item.domain ? `<span>${escHtml(item.domain)}</span>` : ''}
          ${item.added_at ? `<span>${new Date(item.added_at).toLocaleDateString()}</span>` : ''}
        </div>
        ${item.summary ? `<div class="card-expanded-summary">${escHtml(cleanSummary(item.summary))}</div>` : ''}
        <div class="question-form">
          <p class="question-label">Why did you save this?</p>
          <div class="question-options">
            <button class="q-toggle" data-value="visual-inspiration">Visual inspiration</button>
            <button class="q-toggle" data-value="useful-tool">Useful tool</button>
            <button class="q-toggle" data-value="knowledge-reference">Knowledge reference</button>
            <button class="q-toggle" data-value="style-catalog">Style catalog</button>
            <button class="q-toggle" data-value="conceptual-reference">Conceptual reference</button>
            <button class="q-toggle" data-value="practical-benchmark">Practical benchmark</button>
            <input class="q-custom-reason" type="text" placeholder="Other reason\u2026">
          </div>
          <p class="question-label">What makes it work?</p>
          <textarea class="question-text" placeholder="Optional \u2014 what caught your eye?"></textarea>
          <div class="question-actions">
            <button class="q-save">Save</button>
            <button class="q-skip">Skip</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function insertQuestionCard(item) {
    // Find the item's card in the grid and insert question card right after it
    const itemCard = $grid.querySelector(`.card[data-slug="${item.slug}"]:not(.card-question)`);
    const target = itemCard ? itemCard : $grid.querySelector('.masonry-section');
    if (!target) return;

    const temp = document.createElement('div');
    temp.innerHTML = renderQuestionCardHtml(item);
    const qCard = temp.firstElementChild;

    if (itemCard) {
      itemCard.after(qCard);
    } else {
      target.prepend(qCard);
    }

    bindQuestionCard(qCard, item);
  }

  function bindQuestionCard(qCard, item) {
    // Toggle buttons
    qCard.querySelectorAll('.q-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); btn.classList.toggle('active'); });
    });

    // Prevent card click from toggling expansion
    qCard.addEventListener('click', (e) => e.stopPropagation());

    // Save
    qCard.querySelector('.q-save').addEventListener('click', async (e) => {
      e.stopPropagation();
      const selected = [...qCard.querySelectorAll('.q-toggle.active')].map(b => b.dataset.value);
      const customReason = qCard.querySelector('.q-custom-reason').value.trim();
      if (customReason) selected.push(customReason.toLowerCase().replace(/\s+/g, '-'));
      const text = qCard.querySelector('.question-text').value;
      await apiFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, why_saved: selected, what_works: text }),
      });
      dismissQuestionCard(qCard, item);
    });

    // Skip
    qCard.querySelector('.q-skip').addEventListener('click', async (e) => {
      e.stopPropagation();
      await apiFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, why_saved: [], what_works: '' }),
      });
      dismissQuestionCard(qCard, item);
    });
  }

  function dismissQuestionCard(qCard, item) {
    qCard.remove();
    pendingReviews = pendingReviews.filter(r => r.slug !== item.slug);
  }

  // --- Toast notifications ---
  function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('toast-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('toast-visible'), 3000);
  }

  // --- Import tool panel body (wired when the panel opens) ---
  // --- Filters tool panel body (wire the search input when the panel opens) ---
  function bindFilterPanelBody() {
    const $search = document.getElementById('filter-search');
    if (!$search) return;
    $search.value = tagSearchQuery;
    $search.addEventListener('input', () => {
      tagSearchQuery = $search.value;
      renderTagDrawer();
    });
  }

  function bindImportPanelBody() {
    const $importSubmit = document.querySelector('.panel-tool[data-tool="import"] .import-submit');
    const $importText = document.querySelector('.panel-tool[data-tool="import"] .import-textarea');
    if ($importSubmit && $importText) {
      $importSubmit.addEventListener('click', () => {
        const text = $importText.value;
        const urls = text.match(/https?:\/\/[^\s<>"']+/g);
        if (urls && urls.length > 0) {
          captureBulkURLs(urls);
          $importText.value = '';
          PanelManager.closeTool();
        } else {
          showToast('No URLs found');
        }
      });
    }

    const $fileInput = document.querySelector('.panel-tool[data-tool="import"] .import-file');
    if ($fileInput) {
      $fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result;
          const urls = text.match(/https?:\/\/[^\s<>"')]+/g);
          if (urls && urls.length > 0) {
            const unique = [...new Set(urls)];
            captureBulkURLs(unique);
            PanelManager.closeTool();
            showToast(`Importing ${unique.length} URLs from file...`);
          } else {
            showToast('No URLs found in file');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    const $dropZone = document.querySelector('.panel-tool[data-tool="import"] .import-drop-zone');
    if ($dropZone) {
      $dropZone.addEventListener('dragover', (e) => { e.preventDefault(); $dropZone.classList.add('drag-over'); });
      $dropZone.addEventListener('dragleave', () => $dropZone.classList.remove('drag-over'));
      $dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        $dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const urls = reader.result.match(/https?:\/\/[^\s<>"')]+/g);
            if (urls) {
              const unique = [...new Set(urls)];
              captureBulkURLs(unique);
              PanelManager.closeTool();
            }
          };
          reader.readAsText(file);
        }
      });
    }
  }

  // --- Settings tool panel body (wired when the panel opens) ---
  async function loadSettingsIntoPanel() {
    const $panel = document.querySelector('.panel-tool[data-tool="settings"]');
    if (!$panel) return;
    const $keyInput = $panel.querySelector('.settings-key');
    const $profileInput = $panel.querySelector('.settings-profile');
    const $status = $panel.querySelector('.settings-status');

    try {
      const res = await apiFetch('/api/config');
      const config = await res.json();
      if (config.active_profile && config.profiles[config.active_profile]) {
        const p = config.profiles[config.active_profile];
        $keyInput.placeholder = p.has_key ? `Key: ${p.key_preview}` : 'Enter API key...';
        $profileInput.value = config.active_profile;
      }
      $status.textContent = config.active_profile ? `Active: ${config.active_profile}` : 'No API key configured';
    } catch { /* silent */ }

    const $save = $panel.querySelector('.settings-save');
    if ($save) {
      $save.addEventListener('click', async () => {
        const key = $keyInput.value;
        const profile = $profileInput.value || 'default';
        if (!key) { showToast('Enter an API key'); return; }
        try {
          await apiFetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, key }),
          });
          $keyInput.value = '';
          $status.textContent = `Saved! Active: ${profile}`;
          showToast('API key saved');
        } catch {
          showToast('Failed to save key');
        }
      });
    }

    // --- Theme controls ---
    const prefs = ThemeManager.load();

    // Mode toggle
    const $modeToggle = $panel.querySelector('#theme-mode-toggle');
    if ($modeToggle) {
      $modeToggle.querySelectorAll('.theme-toggle-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === prefs.mode);
      });
      $modeToggle.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-mode]');
        if (!opt) return;
        ThemeManager.setMode(opt.dataset.mode);
        $modeToggle.querySelectorAll('.theme-toggle-option').forEach(o =>
          o.classList.toggle('active', o.dataset.mode === opt.dataset.mode)
        );
      });
    }

    // Accent swatches
    $panel.querySelectorAll('.accent-swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.accent === prefs.accent);
      swatch.addEventListener('click', () => {
        ThemeManager.setAccent(swatch.dataset.accent);
        $panel.querySelectorAll('.accent-swatch').forEach(s =>
          s.classList.toggle('active', s.dataset.accent === swatch.dataset.accent)
        );
      });
    });

    // Logout — signs out of Supabase and redirects to the login page
    const $logout = $panel.querySelector('.settings-logout');
    if ($logout) {
      $logout.addEventListener('click', () => {
        if (window.Stello && Stello.signOut) Stello.signOut();
      });
    }

    // Version check
    if (window.Stello && Stello.checkForUpdate) {
      const update = await Stello.checkForUpdate(APP_VERSION);
      if (update && update.available) {
        const banner = document.createElement('div');
        banner.className = 'settings-update-banner';
        banner.innerHTML = `
          <div class="update-title">Update available: ${escHtml(update.latest)}</div>
          <div class="update-changelog">${escHtml(update.changelog || '')}</div>
          ${update.migration ? '<div class="update-migration">Migration required — see changelog</div>' : '<div class="update-migration">No migration needed</div>'}
          <div class="update-instructions"><code>git pull upstream main && git push</code></div>
          <div class="update-versions">Current: ${escHtml(update.current)} &middot; Latest: ${escHtml(update.latest)}</div>
        `;
        $panel.prepend(banner);

        // Show badge on settings button
        const $settingsBtn = document.getElementById('settings-btn');
        if ($settingsBtn && !$settingsBtn.querySelector('.update-badge')) {
          const badge = document.createElement('span');
          badge.className = 'update-badge';
          $settingsBtn.appendChild(badge);
        }
      }
    }
  }

  // =========================================================================
  // === PanelManager — owns up to 2 side panels, grid reflow, state sync ====
  // =========================================================================
  const PanelManager = (function () {
    const DEFAULT_WIDTH = 480;
    const MIN_WIDTH = 320;
    const STORAGE_KEY = 'stello.panels';

    const state = {
      slugs: [],   // ordered [oldest, newest]; length 0–2
      widths: [DEFAULT_WIDTH, DEFAULT_WIDTH],
      originSlugs: [null, null], // which card slug triggered each panel (for focus return)
      tool: null,   // 'filters' | 'settings' | 'import' | null
      toolWidth: DEFAULT_WIDTH,
      userResized: {},  // { 'item:0', 'item:1', 'tool' } → true once user drags that handle
    };

    let $container, $announcer;
    const reducedMotion = () =>
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function maxPanels() { return window.innerWidth <= 1200 ? 1 : 2; }

    function gridCols() {
      const total = state.slugs.length + (state.tool ? 1 : 0);
      return Math.max(2, 5 - total);
    }

    // ---- State <-> URL ----
    function syncFromURL() {
      const params = new URLSearchParams(window.location.search);
      const s1 = params.get('panel1');
      const s2 = params.get('panel2');
      const slugs = [];
      if (s1 && itemsBySlug[s1]) slugs.push(s1);
      if (s2 && itemsBySlug[s2]) slugs.push(s2);
      if (slugs.length > 0) { state.slugs = slugs; return true; }
      return false;
    }
    function syncToURL(push) {
      const params = new URLSearchParams(window.location.search);
      params.delete('panel1'); params.delete('panel2');
      state.slugs.forEach((slug, i) => params.set('panel' + (i + 1), slug));
      const query = params.toString();
      const newURL = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
      const method = push ? 'pushState' : 'replaceState';
      history[method]({ panels: state.slugs.slice() }, '', newURL);
    }

    // ---- State <-> localStorage ----
    function syncFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (Array.isArray(data.slugs)) {
          state.slugs = data.slugs.filter(s => itemsBySlug[s]).slice(0, maxPanels());
        }
        if (Array.isArray(data.widths)) {
          state.widths = data.widths.map(w => clampWidth(w));
          while (state.widths.length < 2) state.widths.push(DEFAULT_WIDTH);
        }
        if (typeof data.toolWidth === 'number') state.toolWidth = clampWidth(data.toolWidth);
        // Tool panel is ephemeral per-session; don't auto-restore on page load
        return state.slugs.length > 0;
      } catch { return false; }
    }
    function syncToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          slugs: state.slugs.slice(),
          widths: state.widths.slice(),
          toolWidth: state.toolWidth,
        }));
      } catch { /* silent */ }
    }

    function clampWidth(px) {
      const max = Math.floor(window.innerWidth * 0.5);
      return Math.max(MIN_WIDTH, Math.min(max, px | 0));
    }

    // ---- Shared tags ----
    function sharedTagSet() {
      if (state.slugs.length < 2) return null;
      const [a, b] = state.slugs.map(s => itemsBySlug[s]);
      if (!a || !b) return null;
      const setA = new Set(a.tags.map(t => t.category + ':' + t.tag));
      const shared = new Set();
      b.tags.forEach(t => {
        const key = t.category + ':' + t.tag;
        if (setA.has(key)) shared.add(key);
      });
      return shared.size ? shared : null;
    }

    // ---- Active card color line ----
    function updateActiveCards() {
      const active = new Set(state.slugs);
      document.querySelectorAll('.card').forEach(card => {
        const slug = card.dataset.slug;
        if (!slug) return;
        const isActive = active.has(slug);
        card.classList.toggle('card-active', isActive);
        if (isActive) {
          const color = dominantColor(itemsBySlug[slug]);
          card.style.setProperty('--card-active-color', color);
        } else {
          card.style.removeProperty('--card-active-color');
        }
      });
    }

    // ---- Grid column reflow ----
    // Column-count layout reads --grid-cols from :root; just update the var.
    function updateGridCols() {
      document.documentElement.style.setProperty('--grid-cols', gridCols());
    }

    // ---- Render panels ----
    function render() {
      if (!$container) return;
      const shared = sharedTagSet();

      // Remove everything
      const existing = Array.from($container.children);
      existing.forEach(el => el.remove());

      // Tool panel renders first (leftmost)
      if (state.tool) {
        const toolHandle = document.createElement('div');
        toolHandle.className = 'resize-handle';
        toolHandle.setAttribute('role', 'separator');
        toolHandle.setAttribute('aria-label', 'Resize tool panel');
        toolHandle.setAttribute('tabindex', '0');
        toolHandle.dataset.toolHandle = '1';
        bindToolResizeHandle(toolHandle);
        $container.appendChild(toolHandle);

        const toolPanel = renderToolPanel(state.tool);
        if (toolPanel) $container.appendChild(toolPanel);
      }

      // Item panels
      state.slugs.forEach((slug, i) => {
        const item = itemsBySlug[slug];
        if (!item) return;

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-label', `Resize panel ${i + 1}`);
        handle.setAttribute('tabindex', '0');
        handle.dataset.panelIndex = String(i);
        bindResizeHandle(handle, i);
        $container.appendChild(handle);

        const panel = document.createElement('aside');
        panel.className = 'panel';
        panel.dataset.index = String(i);
        panel.dataset.slug = slug;
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', `Item detail ${i + 1}: ${item.title || slug}`);
        panel.setAttribute('tabindex', '-1');
        panel.style.setProperty('--panel-width', state.widths[i] + 'px');

        // Header: title + source on left, icons on right (arrow-up-right, expand, close)
        const header = document.createElement('header');
        header.className = 'panel-header';

        const info = document.createElement('div');
        info.className = 'panel-header-info';
        const titleEl = document.createElement('div');
        titleEl.className = 'panel-header-title';
        titleEl.textContent = item.title || '';
        info.appendChild(titleEl);
        if (item.domain) {
          const sourceEl = document.createElement('div');
          sourceEl.className = 'panel-header-source';
          sourceEl.textContent = item.domain;
          info.appendChild(sourceEl);
        }
        header.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'panel-header-actions';

        const shuffleBtn = document.createElement('button');
        shuffleBtn.className = 'panel-shuffle';
        shuffleBtn.type = 'button';
        shuffleBtn.setAttribute('aria-label', 'Shuffle to related item');
        shuffleBtn.title = 'Shuffle to related item';
        shuffleBtn.innerHTML = icon('shuffle');
        shuffleBtn.addEventListener('click', () => shuffle(i));
        actions.appendChild(shuffleBtn);

        if (item.source_url) {
          const openBtn = document.createElement('button');
          openBtn.className = 'panel-open-source';
          openBtn.type = 'button';
          openBtn.setAttribute('aria-label', 'Open source in new tab');
          openBtn.title = 'Open source';
          openBtn.innerHTML = icon('arrow-up-right');
          openBtn.addEventListener('click', () => {
            window.open(item.source_url, '_blank', 'noopener');
          });
          actions.appendChild(openBtn);
        }

        const expandBtn = document.createElement('button');
        expandBtn.className = 'panel-expand';
        expandBtn.type = 'button';
        expandBtn.setAttribute('aria-label', 'Open full page');
        expandBtn.title = 'Full page';
        expandBtn.innerHTML = icon('frame-corners');
        expandBtn.addEventListener('click', () => {
          syncToStorage();
          window.location.href = 'detail.html?slug=' + encodeURIComponent(slug);
        });
        actions.appendChild(expandBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close panel');
        closeBtn.title = 'Close';
        closeBtn.innerHTML = icon('x');
        closeBtn.addEventListener('click', () => close(i));
        actions.appendChild(closeBtn);

        header.appendChild(actions);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'panel-body';
        body.innerHTML = buildPanelBodyHTML(item, shared);
        panel.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'panel-footer';
        footer.innerHTML = buildPanelFooterHTML(item, shared);
        panel.appendChild(footer);

        $container.appendChild(panel);

        // Lazy-load markdown for this panel
        const mdEl = body.querySelector('.card-expanded-md');
        loadMarkdownInto(mdEl);
      });

      // Sync related-card highlights to open panels
      syncHighlightsToOpenPanels(state.slugs);
    }

    // ---- Tool panel rendering ----
    const TOOL_TITLES = { filters: 'Filters', settings: 'Settings', import: 'Import URLs' };
    const TOOL_TEMPLATES = { filters: 'tpl-filters', settings: 'tpl-settings', import: 'tpl-import' };

    function renderToolPanel(type) {
      const tpl = document.getElementById(TOOL_TEMPLATES[type]);
      if (!tpl) return null;

      const panel = document.createElement('aside');
      panel.className = 'panel panel-tool';
      panel.dataset.tool = type;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', TOOL_TITLES[type]);
      panel.setAttribute('tabindex', '-1');
      panel.style.setProperty('--panel-width', (state.toolWidth || DEFAULT_WIDTH) + 'px');

      const header = document.createElement('header');
      header.className = 'panel-header';
      const title = document.createElement('div');
      title.className = 'panel-tool-title';
      title.textContent = TOOL_TITLES[type];
      header.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'panel-header-actions';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'panel-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close panel');
      closeBtn.innerHTML = icon('x');
      closeBtn.addEventListener('click', closeTool);
      actions.appendChild(closeBtn);
      header.appendChild(actions);
      panel.appendChild(header);

      const body = document.createElement('div');
      body.className = 'panel-body';
      body.appendChild(tpl.content.cloneNode(true));
      panel.appendChild(body);

      // Notify listeners the tool body was freshly rendered
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('toolpanel:rendered', { detail: { type, body } }));
      });

      return panel;
    }

    function openTool(type) {
      if (state.tool === type) { closeTool(); return; }
      state.tool = type;
      applyDefaultWidths();
      syncToStorage();
      render();
      updateGridCols();
      updateActiveCards();
      updateToolButtons();
      announce(`${TOOL_TITLES[type]} opened`);
    }

    function closeTool() {
      if (!state.tool) return;
      state.tool = null;
      if (state.userResized) delete state.userResized['tool'];
      applyDefaultWidths();
      syncToStorage();
      render();
      updateGridCols();
      updateToolButtons();
      announce('Tool panel closed');
    }

    function updateToolButtons() {
      ['filter-panel-btn', 'import-btn', 'settings-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('is-active');
      });
      const activeId = state.tool === 'filters' ? 'filter-panel-btn' : state.tool === 'import' ? 'import-btn' : state.tool === 'settings' ? 'settings-btn' : null;
      if (activeId) document.getElementById(activeId)?.classList.add('is-active');
    }

    function bindToolResizeHandle(handle) {
      let startX = 0, startW = 0, dragging = false, raf = null;
      handle.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startW = state.toolWidth || DEFAULT_WIDTH;
        dragging = true;
        document.body.classList.add('resizing');
        handle.classList.add('active');
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const delta = startX - e.clientX; // dragging left = bigger
          const w = clampWidth(startW + delta);
          state.toolWidth = w;
          const p = $container.querySelector('.panel.panel-tool');
          if (p) p.style.setProperty('--panel-width', w + 'px');
        });
      });
      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('resizing');
        handle.classList.remove('active');
        state.userResized = state.userResized || {};
        state.userResized['tool'] = true;
        syncToStorage();
      });
    }

    // ---- Default widths based on total panel count ----
    // When 3 panels (tool + 2 items) are open, default each panel to
    // viewport/4 so the main grid and every panel are equal columns.
    // User resizes override this (tracked via state.userResized).
    function applyDefaultWidths() {
      const total = state.slugs.length + (state.tool ? 1 : 0);
      const equal = Math.floor(window.innerWidth / 4);
      const target = total >= 3 ? clampWidth(equal) : DEFAULT_WIDTH;
      const ur = state.userResized || {};
      state.widths = state.widths.map((w, i) =>
        ur['item:' + i] ? w : target
      );
      if (!ur['tool']) state.toolWidth = target;
    }

    // ---- Announce ----
    function announce(msg) {
      if (!$announcer) return;
      $announcer.textContent = '';
      // Force re-read
      requestAnimationFrame(() => { $announcer.textContent = msg; });
    }

    // ---- Open / close / replace ----
    function open(slug, opts) {
      opts = opts || {};
      if (!itemsBySlug[slug]) return;

      const idx = state.slugs.indexOf(slug);
      if (idx >= 0) {
        // Already open — flash card line + focus panel
        const card = document.querySelector(`.card[data-slug="${cssSelectorEscape(slug)}"]`);
        if (card) {
          card.classList.add('card-flash');
          setTimeout(() => card.classList.remove('card-flash'), 400);
        }
        focus(idx);
        return;
      }

      const max = maxPanels();
      if (state.slugs.length < max && !opts.secondary) {
        state.slugs.push(slug);
        state.originSlugs[state.slugs.length - 1] = opts.originCard ? opts.originCard.dataset.slug : null;
      } else if (opts.secondary && state.slugs.length < max) {
        state.slugs.push(slug);
        state.originSlugs[state.slugs.length - 1] = opts.originCard ? opts.originCard.dataset.slug : null;
      } else {
        // Full — FIFO replace oldest
        state.slugs.shift();
        state.slugs.push(slug);
        state.originSlugs.shift();
        state.originSlugs.push(opts.originCard ? opts.originCard.dataset.slug : null);
        state.originSlugs.length = 2;
      }

      applyDefaultWidths();
      syncToURL(true);
      syncToStorage();
      render();
      updateGridCols();
      updateActiveCards();
      announce(`Panel opened: ${itemsBySlug[slug].title || slug}`);
      focus(state.slugs.length - 1);
    }

    function close(index) {
      if (index < 0 || index >= state.slugs.length) return;
      const originSlug = state.originSlugs[index];
      state.slugs.splice(index, 1);
      state.originSlugs.splice(index, 1);
      state.originSlugs.push(null);
      // The closed panel's manual-resize flag no longer applies
      if (state.userResized) delete state.userResized['item:' + index];
      // Shift flag for the panel that moves into this slot, if any
      if (state.userResized && state.userResized['item:1'] && index === 0) {
        state.userResized['item:0'] = true;
        delete state.userResized['item:1'];
      }

      applyDefaultWidths();
      syncToURL(true);
      syncToStorage();
      render();
      updateGridCols();
      updateActiveCards();
      announce('Panel closed');

      if (originSlug) {
        const card = document.querySelector(`.card[data-slug="${cssSelectorEscape(originSlug)}"]`);
        if (card) card.focus({ preventScroll: false });
      }
    }

    function closeFocused() {
      // If a tool panel is open, close it first (simplest UX)
      if (state.tool) { closeTool(); return; }
      const el = document.activeElement;
      if (!el) return;
      const panel = el.closest && el.closest('.panel');
      if (!panel) return;
      const i = parseInt(panel.dataset.index, 10);
      if (!isNaN(i)) close(i);
    }

    // Replace the item in panel `index` with `newSlug` (used by Shuffle)
    function replace(index, newSlug) {
      if (index < 0 || index >= state.slugs.length) return;
      if (!itemsBySlug[newSlug]) return;
      state.slugs[index] = newSlug;
      syncToURL(false);
      syncToStorage();
      render();
      updateActiveCards();
      announce(`Panel shuffled to: ${itemsBySlug[newSlug].title || newSlug}`);
    }

    // Find a random related slug (shares ≥1 tag). Excludes current item
    // in this panel AND items open in sibling panels.
    function randomRelatedSlug(currentSlug) {
      const item = itemsBySlug[currentSlug];
      if (!item) return null;
      const exclude = new Set(state.slugs); // all open panels (including current)
      const tagKeys = new Set(item.tags.map(t => t.category + ':' + t.tag));
      const candidates = [];
      for (const other of allItems) {
        if (exclude.has(other.slug)) continue;
        for (const t of other.tags) {
          if (tagKeys.has(t.category + ':' + t.tag)) { candidates.push(other.slug); break; }
        }
      }
      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    function shuffle(index) {
      const currentSlug = state.slugs[index];
      if (!currentSlug) return;
      const next = randomRelatedSlug(currentSlug);
      if (!next) { announce('No related items available to shuffle to'); return; }
      replace(index, next);
    }

    function focus(index) {
      const panel = $container && $container.querySelector(`.panel[data-index="${index}"]`);
      if (panel) panel.focus({ preventScroll: false });
    }

    function setWidth(index, px) {
      state.widths[index] = clampWidth(px);
      state.userResized = state.userResized || {};
      state.userResized['item:' + index] = true;
      const panel = $container && $container.querySelector(`.panel[data-index="${index}"]`);
      if (panel) panel.style.setProperty('--panel-width', state.widths[index] + 'px');
      syncToStorage();
    }

    // ---- Resize handles ----
    function bindResizeHandle(handle, index) {
      let startX = 0, startWidth = 0, rafPending = false, nextWidth = 0;

      function onMove(e) {
        const dx = startX - e.clientX; // drag left => grows panel
        nextWidth = clampWidth(startWidth + dx);
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(() => {
            rafPending = false;
            const panel = $container.querySelector(`.panel[data-index="${index}"]`);
            if (panel) panel.style.setProperty('--panel-width', nextWidth + 'px');
          });
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('resizing');
        handle.classList.remove('active');
        setWidth(index, nextWidth || startWidth);
      }
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = state.widths[index];
        nextWidth = startWidth;
        document.body.classList.add('resizing');
        handle.classList.add('active');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      handle.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { setWidth(index, state.widths[index] + 20); e.preventDefault(); }
        if (e.key === 'ArrowRight') { setWidth(index, state.widths[index] - 20); e.preventDefault(); }
      });
    }

    // ---- Keyboard shortcuts ----
    function bindKeys() {
      document.addEventListener('keydown', (e) => {
        if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
        if (e.key === 'Escape') { closeFocused(); return; }
        if (e.key === '1') { focus(0); }
        if (e.key === '2') { focus(1); }
        if (e.key === '0') {
          const first = document.querySelector('.card');
          if (first) first.focus();
        }
      });
    }

    // ---- Window resize ----
    let resizeTimeout = null;
    function onWindowResize() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const max = maxPanels();
        let dirty = false;
        while (state.slugs.length > max) {
          state.slugs.shift();
          state.originSlugs.shift();
          state.originSlugs.push(null);
          dirty = true;
        }
        // Clamp widths
        state.widths = state.widths.map(w => clampWidth(w));
        if (dirty) {
          syncToURL(false);
          syncToStorage();
          render();
          updateGridCols();
          updateActiveCards();
        }
      }, 120);
    }

    // ---- Init ----
    function init() {
      $container = document.getElementById('panels-container');
      $announcer = document.getElementById('panel-announcer');
      if (!$container) return;

      // Load precedence: URL first, else localStorage.
      if (!syncFromURL()) syncFromStorage();

      // Clamp to current maxPanels
      state.slugs = state.slugs.slice(0, maxPanels());

      render();
      updateGridCols();
      updateActiveCards();

      window.addEventListener('popstate', () => {
        syncFromURL() || (state.slugs = []);
        render();
        updateGridCols();
        updateActiveCards();
      });
      window.addEventListener('resize', onWindowResize);
      bindKeys();
    }

    function cssSelectorEscape(s) {
      if (window.CSS && CSS.escape) return CSS.escape(s);
      return String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    }

    function refreshAfterGridRender() {
      updateGridCols();
      updateActiveCards();
    }

    function getOpenSlugs() { return [...state.slugs]; }

    return {
      init, open, close, focus, shuffle,
      openTool, closeTool,
      gridCols, getOpenSlugs,
      refreshAfterGridRender,
      state, // expose for debugging
    };
  })();

  // --- Start ---
  document.addEventListener('DOMContentLoaded', () => {
    init();
    bindPasteHandler();
  });
})();

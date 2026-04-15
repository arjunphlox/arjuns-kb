/* === Stello — App Logic === */

(function () {
  'use strict';

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

  // Brick/offset pattern: uniform cards, alternating row positions.
  // Cards are 1 col wide; gaps are 1 col wide. Row 0 occupies odd cols, row 1 evens.
  // cols ∈ {8, 6, 4} depending on how many panels are open.
  const CARD_SPAN = 1;

  function brickPosition(idx, cols) {
    const c = cols || 8;
    const slotsPerRow = Math.max(1, Math.floor(c / 2));
    const cycle = idx % (slotsPerRow * 2);
    const row = Math.floor(cycle / slotsPerRow); // 0 = even row, 1 = odd
    const idxInRow = cycle % slotsPerRow;
    const col = row === 0 ? 1 + 2 * idxInRow : 2 + 2 * idxInRow;
    return { col, span: CARD_SPAN };
  }

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

  // --- DOM refs ---
  const $grid = document.getElementById('masonry-grid');
  const $search = document.getElementById('search-input');
  const $activeFilters = document.getElementById('active-filters');
  const $itemsCount = document.getElementById('items-count');
  const $headerCount = document.getElementById('header-count');
  const $filterPanel = document.getElementById('filter-panel');
  const $colorBar = document.getElementById('filter-color-tags');
  const $drawer = document.getElementById('filter-tag-drawer');

  // --- Boot ---
  async function init() {
    const res = await fetch('index.json?v=' + Date.now());
    const data = await res.json();
    allItems = data.items;

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
    renderColorBar();
    renderTagDrawer();
    renderGrid();
    bindEvents();
    PanelManager.init();
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
    $headerCount.textContent = `\u00b7 ${allItems.length.toLocaleString()}`;
  }

  // --- Color Tags Bar ---
  const COLOR_BAR_LIMIT = 20;
  let colorBarExpanded = false;

  function renderColorBar() {
    const colorCounts = {};
    allItems.forEach(i => i.tags.forEach(t => {
      if (t.category === 'color') colorCounts[t.tag] = (colorCounts[t.tag] || 0) + 1;
    }));
    const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) { $colorBar.style.display = 'none'; return; }

    const visible = colorBarExpanded ? sorted : sorted.slice(0, COLOR_BAR_LIMIT);
    const chips = visible.map(([tag, count]) => {
      const hex = COLOR_MAP[tag] || COLOR_MAP[tag.replace(/[-_\s]/g, '_')] || '#888';
      const isActive = activeTags.some(a => a.tag === tag && a.category === 'color');
      return `<span class="tag-chip tag-color${isActive ? ' active' : ''}" data-tag="${tag}" data-cat="color"><span class="color-dot" style="background:${hex}"></span>${tag} <span class="chip-count">${count}</span></span>`;
    }).join('');

    const toggle = sorted.length > COLOR_BAR_LIMIT
      ? `<span class="color-bar-toggle">${colorBarExpanded ? 'Less' : `+${sorted.length - COLOR_BAR_LIMIT} more`}</span>`
      : '';

    $colorBar.innerHTML = chips + toggle;
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

  function renderTagDrawer() {
    const map = collectTags();
    const order = ['domain', 'subject', 'format', 'tool', 'style', 'mood', 'location', 'color'];
    const categories = order.filter(c => map[c]);
    Object.keys(map).forEach(c => { if (!categories.includes(c)) categories.push(c); });

    $drawer.innerHTML = categories.map(cat => {
      const tags = Object.entries(map[cat]).sort((a, b) => b[1] - a[1]);
      return `<div class="tag-category-group">
        <div class="tag-category-label">${cat}</div>
        <div class="tag-chips">
          ${tags.map(([tag, count]) => {
            const cls = CAT_CLASS[cat] || 'tag-format';
            const isActive = activeTags.some(a => a.tag === tag && a.category === cat);
            const dot = cat === 'color' ? `<span class="color-dot" style="background:${COLOR_MAP[tag] || COLOR_MAP[tag.replace(/[-_\s]/g, '_')] || '#888'}"></span>` : '';
            return `<span class="tag-chip ${cls}${isActive ? ' active' : ''}" data-tag="${tag}" data-cat="${cat}">${dot}${tag} <span class="chip-count">${count}</span></span>`;
          }).join('')}
        </div>
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
    const showLink = $grid.querySelector(`.week-show-link[data-week="${weekKey}"]`);
    if (!container) return;

    const items = getFilteredItems();
    const weekItems = items.filter(i => getWeekKey(i.added_at) === weekKey);

    container.innerHTML = weekItems.map((item, idx) => renderCard(item, idx)).join('');
    container.style.display = '';
    loadedWeeks.add(weekKey);

    if (showLink) showLink.remove();
    PanelManager.refreshAfterGridRender();
  }

  const isSearchActive = () => searchQuery || activeTags.length > 0;

  function renderGrid() {
    const items = getFilteredItems();
    $itemsCount.innerHTML = `Showing <span>${items.length}</span> of ${allItems.length} items`;

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
      const showLink = !isLoaded
        ? `<span class="week-show-link" data-week="${week.key}">Show</span>`
        : '';
      html += `<div class="date-section-header" style="grid-column: 1 / -1"><span>${week.label}</span>${showLink}</div>`;
      html += `<div class="masonry-section" data-week="${week.key}" style="${isLoaded ? '' : 'display:none'}">`;
      if (isLoaded) {
        html += week.items.map(e => renderCard(e.item, e.idx)).join('');
      }
      html += '</div>';
    });

    $grid.innerHTML = html;
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
      thumbHtml = `<div class="card-text-content" style="view-transition-name:${vtName};background:hsl(${hue},15%,13%)">${truncated}</div>`;
    } else {
      const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
      const letter = (item.title || '?')[0].toUpperCase();
      thumbHtml = `<div class="card-placeholder" style="view-transition-name:${vtName};background:hsl(${hue},20%,16%)">${letter}</div>`;
    }

    // Card footer — minimal metadata
    const cardFooter = `<div class="card-footer">
      <div class="card-footer-title">${escHtml(item.title)}</div>
      ${item.domain ? `<div class="card-footer-domain">${escHtml(item.domain)}</div>` : ''}
    </div>`;

    const cardClass = hasImage ? ' card-visual' : (hasTextContent ? ' card-text' : '');
    const cols = PanelManager.gridCols();
    const pos = brickPosition(idx, cols);

    return `<div class="card${cardClass}" data-slug="${item.slug}" tabindex="-1" style="grid-column: ${pos.col} / span ${pos.span}">
      <div class="card-visual-area">
        ${thumbHtml}
      </div>
      ${cardFooter}
    </div>`;
  }

  // Builds the expanded-body HTML used inside a side panel.
  // `sharedTagSet`: optional Set<string> of "category:tag" keys to highlight with .tag-shared.
  function buildPanelBodyHTML(item, sharedTagSet) {
    const tagPills = item.tags
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 16)
      .map(t => {
        const shared = sharedTagSet && sharedTagSet.has(t.category + ':' + t.tag);
        return renderTagPill(t.tag, t.category, shared);
      }).join('');

    return `<div class="card-expanded-body">
      <div class="card-expanded-title">${escHtml(item.title)}</div>
      <div class="card-expanded-meta">
        ${item.domain ? `<span>${escHtml(item.domain)}</span>` : ''}
        ${item.added_at ? `<span>${new Date(item.added_at).toLocaleDateString()}</span>` : ''}
      </div>
      ${item.summary ? `<div class="card-expanded-summary">${escHtml(cleanSummary(item.summary))}</div>` : ''}
      <div class="card-expanded-tags">${tagPills}</div>
      ${item.source_url ? `<a class="card-expanded-source" href="${item.source_url}" target="_blank" rel="noopener">Visit source &rarr;</a>` : ''}
      <div class="card-expanded-md" data-slug="${item.slug}"></div>
    </div>`;
  }

  // Loads and renders the markdown body into a panel's .card-expanded-md element.
  async function loadMarkdownInto(container) {
    if (!container || container.dataset.loaded) return;
    container.dataset.loaded = 'true';
    const slug = container.dataset.slug;
    try {
      const mdRes = await fetch(`_items/${slug}/item.md`);
      if (!mdRes.ok) return;
      const raw = await mdRes.text();
      let body = extractMarkdownBody(raw);
      if (!body) return;
      body = stripSections(body, ['Summary', 'Key Details', 'Visual Assets']);
      if (body) container.innerHTML = renderMarkdown(body);
    } catch { /* silent */ }
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

  function highlightRelated(slug) {
    const related = relatedIndex[slug] || new Set();
    $grid.classList.add('has-hover-focus');
    const cards = $grid.querySelectorAll('.card');
    cards.forEach(card => {
      const cardSlug = card.dataset.slug;
      if (cardSlug === slug || related.has(cardSlug)) {
        card.classList.add('card-focused');
      } else {
        card.classList.remove('card-focused');
      }
    });
  }

  function clearHighlight() {
    $grid.classList.remove('has-hover-focus');
    $grid.querySelectorAll('.card-focused').forEach(c => c.classList.remove('card-focused'));
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

  function extractMarkdownBody(raw) {
    const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : raw.trim();
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

    // Filter panel toggle
    document.getElementById('filter-panel-btn').addEventListener('click', function () {
      $filterPanel.classList.toggle('open');
    });
    document.getElementById('filter-panel-close').addEventListener('click', function () {
      $filterPanel.classList.remove('open');
    });

    $drawer.addEventListener('click', function (e) {
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      const cat = chip.dataset.cat;
      const idx = activeTags.findIndex(a => a.tag === tag && a.category === cat);
      if (idx >= 0) {
        activeTags.splice(idx, 1);
      } else {
        activeTags.push({ tag, category: cat });
      }
      renderColorBar();
      renderTagDrawer();
      renderActiveFilters();
      renderGrid();
    });

    $activeFilters.addEventListener('click', function (e) {
      if (e.target.id === 'clear-filters' || e.target.closest('#clear-filters')) {
        activeTags = [];
        renderColorBar();
        renderTagDrawer();
        renderActiveFilters();
        renderGrid();
        return;
      }
      const pill = e.target.closest('.active-filter-pill');
      if (!pill) return;
      const idx = parseInt(pill.dataset.idx, 10);
      activeTags.splice(idx, 1);
      renderColorBar();
      renderTagDrawer();
      renderActiveFilters();
      renderGrid();
    });

    // Color bar clicks -> filter by color tag or toggle more/less
    $colorBar.addEventListener('click', function (e) {
      if (e.target.closest('.color-bar-toggle')) {
        colorBarExpanded = !colorBarExpanded;
        renderColorBar();
        return;
      }
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      const cat = chip.dataset.cat;
      const idx = activeTags.findIndex(a => a.tag === tag && a.category === cat);
      if (idx >= 0) {
        activeTags.splice(idx, 1);
      } else {
        activeTags.push({ tag, category: cat });
      }
      renderColorBar();
      renderTagDrawer();
      renderActiveFilters();
      renderGrid();
    });

    // Week "Show" links -> lazy load that week
    $grid.addEventListener('click', function (e) {
      const showLink = e.target.closest('.week-show-link');
      if (!showLink) return;
      e.stopPropagation();
      renderWeekCards(showLink.dataset.week);
    });

    // Card hover -> highlight related
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
          clearHighlight();
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
      // Skip if settings panel or import modal is open
      if (document.getElementById('settings-panel').classList.contains('open')) return;
      if (document.getElementById('import-modal').classList.contains('open')) return;

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
    renderColorBar();
  }

  async function captureURL(urlStr) {
    const id = 'ph-' + Date.now();
    insertPlaceholder(id);
    try {
      const res = await fetch('/api/capture', {
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
      const res = await fetch('/api/upload-image', {
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
      const res = await fetch('/api/capture', {
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

  // --- Bulk capture ---
  async function captureBulkURLs(urls) {
    // Insert placeholders for all
    const ids = urls.map((_, i) => 'bulk-' + Date.now() + '-' + i);
    ids.forEach(id => insertPlaceholder(id));
    showToast(`Adding ${urls.length} items...`);

    try {
      const res = await fetch('/api/capture-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const { batchId } = await res.json();

      // Listen to SSE stream
      const evtSource = new EventSource(`/api/capture-stream?batch=${batchId}`);
      let completed = 0;

      evtSource.addEventListener('item-added', (e) => {
        const data = JSON.parse(e.data);
        const phId = ids[data.index];
        if (data.item && !data.item.is_duplicate && !data.error) {
          replacePlaceholder(phId, data.item);
          pollForReview(data.item.slug);
        } else {
          removePlaceholder(phId);
        }
        completed++;
      });

      evtSource.addEventListener('batch-done', () => {
        evtSource.close();
        showToast(`Done! Added ${completed} items.`);
      });

      evtSource.onerror = () => {
        evtSource.close();
        // Clean remaining placeholders
        ids.forEach(id => removePlaceholder(id));
      };
    } catch (err) {
      ids.forEach(id => removePlaceholder(id));
      showToast('Bulk capture failed');
    }
  }

  // --- Question card (in-grid) ---
  let pendingReviews = [];

  function pollForReview(slug) {
    setTimeout(async () => {
      try {
        const res = await fetch('index.json?v=' + Date.now());
        const data = await res.json();
        const item = data.items.find(i => i.slug === slug);
        if (item && item.needs_review) {
          pendingReviews.push(item);
          // Insert question card into grid next to the item's card
          insertQuestionCard(item);
        }
        // Update local item data + refresh card
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
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, why_saved: selected, what_works: text }),
      });
      dismissQuestionCard(qCard, item);
    });

    // Skip
    qCard.querySelector('.q-skip').addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/review', {
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

  // --- Import modal ---
  function bindImportModal() {
    const $importBtn = document.getElementById('import-btn');
    const $importModal = document.getElementById('import-modal');
    if (!$importBtn || !$importModal) return;

    $importBtn.addEventListener('click', () => {
      $importModal.classList.toggle('open');
    });

    // Close on backdrop click
    $importModal.addEventListener('click', (e) => {
      if (e.target === $importModal) $importModal.classList.remove('open');
    });

    // Textarea import
    const $importSubmit = $importModal.querySelector('.import-submit');
    const $importText = $importModal.querySelector('.import-textarea');
    if ($importSubmit && $importText) {
      $importSubmit.addEventListener('click', () => {
        const text = $importText.value;
        const urls = text.match(/https?:\/\/[^\s<>"']+/g);
        if (urls && urls.length > 0) {
          captureBulkURLs(urls);
          $importText.value = '';
          $importModal.classList.remove('open');
        } else {
          showToast('No URLs found');
        }
      });
    }

    // File upload (CSV / Markdown)
    const $fileInput = $importModal.querySelector('.import-file');
    if ($fileInput) {
      $fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result;
          const urls = text.match(/https?:\/\/[^\s<>"')]+/g);
          if (urls && urls.length > 0) {
            // Dedupe
            const unique = [...new Set(urls)];
            captureBulkURLs(unique);
            $importModal.classList.remove('open');
            showToast(`Importing ${unique.length} URLs from file...`);
          } else {
            showToast('No URLs found in file');
          }
        };
        reader.readAsText(file);
        e.target.value = ''; // reset
      });
    }

    // Drag and drop
    const $dropZone = $importModal.querySelector('.import-drop-zone');
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
              $importModal.classList.remove('open');
            }
          };
          reader.readAsText(file);
        }
      });
    }
  }

  // --- Settings panel ---
  function bindSettingsPanel() {
    const $settingsBtn = document.getElementById('settings-btn');
    const $settingsPanel = document.getElementById('settings-panel');
    if (!$settingsBtn || !$settingsPanel) return;

    $settingsBtn.addEventListener('click', async () => {
      const isOpen = $settingsPanel.classList.toggle('open');
      if (isOpen) {
        // Load current config
        try {
          const res = await fetch('/api/config');
          const config = await res.json();
          const $keyInput = $settingsPanel.querySelector('.settings-key');
          const $profileInput = $settingsPanel.querySelector('.settings-profile');
          const $status = $settingsPanel.querySelector('.settings-status');
          if (config.active_profile && config.profiles[config.active_profile]) {
            const p = config.profiles[config.active_profile];
            $keyInput.placeholder = p.has_key ? `Key: ${p.key_preview}` : 'Enter API key...';
            $profileInput.value = config.active_profile;
          }
          $status.textContent = config.active_profile ? `Active: ${config.active_profile}` : 'No API key configured';
        } catch { /* silent */ }
      }
    });

    const $saveKey = $settingsPanel.querySelector('.settings-save');
    if ($saveKey) {
      $saveKey.addEventListener('click', async () => {
        const key = $settingsPanel.querySelector('.settings-key').value;
        const profile = $settingsPanel.querySelector('.settings-profile').value || 'default';
        if (!key) { showToast('Enter an API key'); return; }
        try {
          await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, key }),
          });
          $settingsPanel.querySelector('.settings-key').value = '';
          $settingsPanel.querySelector('.settings-status').textContent = `Saved! Active: ${profile}`;
          showToast('API key saved');
        } catch {
          showToast('Failed to save key');
        }
      });
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
    };

    let $container, $announcer;
    const reducedMotion = () =>
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function maxPanels() { return window.innerWidth <= 1200 ? 1 : 2; }

    function gridCols() {
      const n = state.slugs.length;
      if (n === 0) return 8;
      if (n === 1) return 6;
      return 4;
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
        return state.slugs.length > 0;
      } catch { return false; }
    }
    function syncToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          slugs: state.slugs.slice(),
          widths: state.widths.slice(),
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
    function dominantColor(item) {
      if (!item || !item.tags) return '#ffffff';
      const colorTags = item.tags.filter(t => t.category === 'color');
      if (!colorTags.length) return '#ffffff';
      const top = colorTags.reduce((a, b) => (b.weight > a.weight ? b : a));
      const key = top.tag;
      return COLOR_MAP[key] || COLOR_MAP[key.replace(/[-_\s]/g, '_')] || '#ffffff';
    }

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
    function updateGridCols() {
      document.documentElement.style.setProperty('--grid-cols', gridCols());
      // Re-position existing cards for new column count
      const cols = gridCols();
      document.querySelectorAll('.masonry-section').forEach(section => {
        const cards = section.querySelectorAll('.card');
        cards.forEach((card, idx) => {
          const pos = brickPosition(idx, cols);
          card.style.gridColumn = `${pos.col} / span ${pos.span}`;
        });
        section.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      });
    }

    // ---- Render panels ----
    function render() {
      if (!$container) return;
      const shared = sharedTagSet();

      // Remove panels/handles that no longer correspond to state
      const existing = Array.from($container.children);
      existing.forEach(el => el.remove());

      // Render in order: handle, panel, handle, panel ...
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

        const header = document.createElement('header');
        header.className = 'panel-header';
        const expandBtn = document.createElement('button');
        expandBtn.className = 'panel-expand';
        expandBtn.type = 'button';
        expandBtn.setAttribute('aria-label', 'Open full page');
        expandBtn.innerHTML = '&#10530;'; // ⤢
        expandBtn.addEventListener('click', () => {
          syncToStorage();
          window.location.href = 'detail.html?slug=' + encodeURIComponent(slug);
        });
        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close panel');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => close(i));
        header.appendChild(expandBtn);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'panel-body';
        body.innerHTML = buildPanelBodyHTML(item, shared);
        panel.appendChild(body);

        $container.appendChild(panel);

        // Lazy-load markdown for this panel
        const mdEl = body.querySelector('.card-expanded-md');
        loadMarkdownInto(mdEl);
      });
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
      const el = document.activeElement;
      if (!el) return;
      const panel = el.closest && el.closest('.panel');
      if (!panel) return;
      const i = parseInt(panel.dataset.index, 10);
      if (!isNaN(i)) close(i);
    }

    function focus(index) {
      const panel = $container && $container.querySelector(`.panel[data-index="${index}"]`);
      if (panel) panel.focus({ preventScroll: false });
    }

    function setWidth(index, px) {
      state.widths[index] = clampWidth(px);
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

    return {
      init, open, close, focus,
      gridCols,
      refreshAfterGridRender,
      state, // expose for debugging
    };
  })();

  // --- Start ---
  document.addEventListener('DOMContentLoaded', () => {
    init();
    bindPasteHandler();
    bindImportModal();
    bindSettingsPanel();
  });
})();

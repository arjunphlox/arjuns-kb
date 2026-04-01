/* === Arjun's Knowledge Base — App Logic === */

(function () {
  'use strict';

  // --- State ---
  let allItems = [];
  let activeTags = [];      // [{tag, category}]
  let searchQuery = '';
  let tagDrawerOpen = false;
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

  // --- DOM refs ---
  const $grid = document.getElementById('masonry-grid');
  const $search = document.getElementById('search-input');
  const $activeFilters = document.getElementById('active-filters');
  const $drawerToggle = document.getElementById('tag-drawer-toggle');
  const $drawer = document.getElementById('tag-drawer');
  const $statsBar = document.getElementById('stats-bar');
  const $itemsCount = document.getElementById('items-count');
  const $colorBar = document.getElementById('color-tags-bar');

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

    buildRelatedIndex();
    renderStats();
    renderColorBar();
    renderTagDrawer();
    renderGrid();
    bindEvents();
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

  // --- Stats ---
  function renderStats() {
    const withImg = allItems.filter(i => i.has_image).length;
    const cats = {};
    allItems.forEach(i => i.tags.forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + 1;
    }));
    let catHtml = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `<span class="stat"><span class="stat-value">${n}</span> ${c}</span>`)
      .join('');
    $statsBar.innerHTML =
      `<span class="stat"><span class="stat-value">${allItems.length}</span> items</span>` +
      `<span class="stat"><span class="stat-value">${withImg}</span> with images</span>` +
      catHtml;
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
      html += `<div class="date-section-header"><span>${week.label}</span>${showLink}</div>`;
      html += `<div class="masonry-section" data-week="${week.key}" style="${isLoaded ? '' : 'display:none'}">`;
      if (isLoaded) {
        html += week.items.map(e => renderCard(e.item, e.idx)).join('');
      }
      html += '</div>';
    });

    $grid.innerHTML = html;
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

  function renderCard(item, idx) {
    let thumbHtml;
    const hasImage = item.has_image && item.image_path;

    const hasTextContent = !hasImage && item.summary
      && item.summary.length > 30
      && !item.summary.startsWith('Saved from');

    if (hasImage) {
      thumbHtml = `<img class="card-thumb" src="${item.image_path}" alt="" loading="lazy" onerror="this.parentElement.classList.add('img-error')">`;
    } else if (hasTextContent) {
      const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
      const truncated = escHtml(truncateWords(cleanSummary(item.summary), 200));
      thumbHtml = `<div class="card-text-content" style="background:hsl(${hue},15%,13%)">${truncated}</div>`;
    } else {
      const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
      const letter = (item.title || '?')[0].toUpperCase();
      thumbHtml = `<div class="card-placeholder" style="background:hsl(${hue},20%,16%)">${letter}</div>`;
    }

    // Hover overlay with source URL only
    const overlayHtml = item.domain ? `<div class="card-overlay">
      <div class="card-overlay-text">
        <div class="card-domain">${escHtml(item.domain)}</div>
      </div>
    </div>` : '';

    // Expand icon (opens full detail page)
    const expandIcon = `<a class="card-expand-icon" href="detail.html?slug=${item.slug}" onclick="event.stopPropagation()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M9 1h6v6M7 15H1V9M15 1L9 7M1 15l6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;

    // Fallback title for non-image, non-text cards
    const fallbackTitle = !hasImage && !hasTextContent
      ? `<div class="card-fallback-title">${escHtml(item.title)}</div>`
      : '';

    // Expanded detail area (hidden by default, shown on click)
    const tagPills = item.tags
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map(t => renderTagPill(t.tag, t.category)).join('');

    const expandedHtml = `<div class="card-expanded-body">
      <div class="card-expanded-title">${escHtml(item.title)}</div>
      <div class="card-expanded-meta">
        ${item.domain ? `<span>${escHtml(item.domain)}</span>` : ''}
        ${item.added_at ? `<span>${new Date(item.added_at).toLocaleDateString()}</span>` : ''}
      </div>
      ${item.summary ? `<div class="card-expanded-summary">${escHtml(cleanSummary(item.summary))}</div>` : ''}
      <div class="card-expanded-tags">${tagPills}</div>
      ${item.source_url ? `<a class="card-expanded-source" href="${item.source_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Visit source &rarr;</a>` : ''}
      <div class="card-expanded-md" data-slug="${item.slug}"></div>
    </div>`;

    const cardClass = hasImage ? ' card-visual' : (hasTextContent ? ' card-text' : '');

    return `<div class="card${cardClass}" data-slug="${item.slug}">
      <div class="card-visual-area">
        ${thumbHtml}
        ${overlayHtml}
        ${expandIcon}
      </div>
      ${fallbackTitle}
      ${expandedHtml}
    </div>`;
  }

  // --- In-place card expansion ---
  async function toggleCardExpansion(card) {
    const isExpanded = card.classList.contains('card-expanded');

    if (isExpanded) {
      card.classList.remove('card-expanded');
      return;
    }

    card.classList.add('card-expanded');

    // Load markdown body if not already loaded
    const mdContainer = card.querySelector('.card-expanded-md');
    if (mdContainer && !mdContainer.dataset.loaded) {
      const slug = card.dataset.slug;
      try {
        const mdRes = await fetch(`_items/${slug}/item.md`);
        if (mdRes.ok) {
          const raw = await mdRes.text();
          let body = extractMarkdownBody(raw);
          if (body) {
            // Remove redundant sections
            body = stripSections(body, ['Summary', 'Key Details', 'Visual Assets']);
            if (body) mdContainer.innerHTML = renderMarkdown(body);
          }
        }
      } catch { /* silent */ }
      mdContainer.dataset.loaded = 'true';
    }
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

    $drawerToggle.addEventListener('click', function () {
      tagDrawerOpen = !tagDrawerOpen;
      $drawer.classList.toggle('open', tagDrawerOpen);
      this.textContent = tagDrawerOpen ? 'Hide tags' : 'Browse tags';
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
      }, 150);
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

    // Card click -> expand in place (not the expand icon or links)
    $grid.addEventListener('click', function (e) {
      // Don't expand if clicking the expand icon or any link
      if (e.target.closest('.card-expand-icon')) return;
      if (e.target.closest('a')) return;

      const card = e.target.closest('.card');
      if (!card) return;
      toggleCardExpansion(card);
    });
  }

  // --- Utility ---
  function renderTagPill(tag, category) {
    const cls = CAT_CLASS[category] || 'tag-format';
    if (category === 'color') {
      const hex = COLOR_MAP[tag] || COLOR_MAP[tag.replace(/[-_\s]/g, '_')] || '#888';
      return `<span class="card-tag ${cls}"><span class="color-dot" style="background:${hex}"></span>${tag}</span>`;
    }
    return `<span class="card-tag ${cls}">${tag}</span>`;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);
})();

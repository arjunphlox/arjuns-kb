/* === Arjun's Knowledge Base — App Logic === */

(function () {
  'use strict';

  // --- State ---
  let allItems = [];
  let activeTags = [];      // [{tag, category}]
  let searchQuery = '';
  let tagDrawerOpen = false;
  let relatedIndex = {};     // slug -> Set of related slugs

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

  // --- DOM refs ---
  const $grid = document.getElementById('masonry-grid');
  const $search = document.getElementById('search-input');
  const $activeFilters = document.getElementById('active-filters');
  const $drawerToggle = document.getElementById('tag-drawer-toggle');
  const $drawer = document.getElementById('tag-drawer');
  const $statsBar = document.getElementById('stats-bar');
  const $itemsCount = document.getElementById('items-count');

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
            return `<span class="tag-chip ${cls}${isActive ? ' active' : ''}" data-tag="${tag}" data-cat="${cat}">${tag} <span class="chip-count">${count}</span></span>`;
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

  function renderGrid() {
    const items = getFilteredItems();
    $itemsCount.innerHTML = `Showing <span>${items.length}</span> of ${allItems.length} items`;

    if (items.length === 0) {
      $grid.innerHTML = '<div class="no-results">No items match your filters.</div>';
      return;
    }

    const groups = [];
    let currentWeekKey = null;

    items.forEach((item, idx) => {
      const weekKey = getWeekKey(item.added_at);
      if (weekKey !== currentWeekKey) {
        currentWeekKey = weekKey;
        groups.push({
          type: 'date-header',
          dateKey: weekKey,
          label: formatWeekLabel(item.added_at) || 'Undated',
        });
      }
      groups.push({ type: 'item', item, idx });
    });

    let html = '';
    let inMasonry = false;

    groups.forEach(entry => {
      if (entry.type === 'date-header') {
        if (inMasonry) {
          html += '</div>';
          inMasonry = false;
        }
        html += `<div class="date-section-header"><span>${entry.label}</span></div>`;
      } else {
        if (!inMasonry) {
          html += '<div class="masonry-section">';
          inMasonry = true;
        }
        html += renderCard(entry.item, entry.idx);
      }
    });
    if (inMasonry) html += '</div>';

    $grid.innerHTML = html;
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
      const truncated = escHtml(truncateWords(item.summary, 200));
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
      .map(t => {
        const cls = CAT_CLASS[t.category] || 'tag-format';
        return `<span class="card-tag ${cls}">${t.tag}</span>`;
      }).join('');

    const expandedHtml = `<div class="card-expanded-body">
      <div class="card-expanded-title">${escHtml(item.title)}</div>
      <div class="card-expanded-meta">
        ${item.domain ? `<span>${escHtml(item.domain)}</span>` : ''}
        ${item.added_at ? `<span>${new Date(item.added_at).toLocaleDateString()}</span>` : ''}
      </div>
      ${item.summary ? `<div class="card-expanded-summary">${escHtml(item.summary)}</div>` : ''}
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
          const body = extractMarkdownBody(raw);
          if (body) {
            mdContainer.innerHTML = renderMarkdown(body);
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
  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);
})();

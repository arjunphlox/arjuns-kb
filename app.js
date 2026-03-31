/* === Arjun's Knowledge Base — App Logic === */

(function () {
  'use strict';

  // --- State ---
  let allItems = [];
  let activeTags = [];      // [{tag, category}]
  let searchQuery = '';
  let tagDrawerOpen = false;

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

  // Placeholder hues for cards without images
  const PLACEHOLDER_HUES = [210, 260, 330, 160, 30, 190, 290, 50];

  // --- DOM refs ---
  const $grid = document.getElementById('masonry-grid');
  const $search = document.getElementById('search-input');
  const $activeFilters = document.getElementById('active-filters');
  const $drawerToggle = document.getElementById('tag-drawer-toggle');
  const $drawer = document.getElementById('tag-drawer');
  const $statsBar = document.getElementById('stats-bar');
  const $itemsCount = document.getElementById('items-count');
  const $modalOverlay = document.getElementById('modal-overlay');
  const $modalContent = document.getElementById('modal-content');

  // --- Boot ---
  async function init() {
    const res = await fetch('index.json');
    const data = await res.json();
    allItems = data.items;
    renderStats();
    renderTagDrawer();
    renderGrid();
    bindEvents();
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
    const map = {}; // category -> {tag -> count}
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
    // add any categories not in the predefined order
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
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title.toLowerCase().includes(q);
        const inSummary = (item.summary || '').toLowerCase().includes(q);
        const inTags = item.tags.some(t => t.tag.toLowerCase().includes(q));
        if (!inTitle && !inSummary && !inTags) return false;
      }
      // Tag filter (AND)
      if (activeTags.length > 0) {
        return activeTags.every(at =>
          item.tags.some(t => t.tag === at.tag && t.category === at.category)
        );
      }
      return true;
    });
  }

  function renderGrid() {
    const items = getFilteredItems();
    $itemsCount.innerHTML = `Showing <span>${items.length}</span> of ${allItems.length} items`;

    if (items.length === 0) {
      $grid.innerHTML = '<div class="no-results">No items match your filters.</div>';
      return;
    }

    $grid.innerHTML = items.map((item, idx) => {
      const topTags = item.tags
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);

      let thumbHtml;
      if (item.has_image && item.image_path) {
        thumbHtml = `<img class="card-thumb" src="${item.image_path}" alt="" loading="lazy" onerror="this.style.display='none'">`;
      } else {
        const hue = PLACEHOLDER_HUES[idx % PLACEHOLDER_HUES.length];
        const letter = (item.title || '?')[0].toUpperCase();
        thumbHtml = `<div class="card-placeholder" style="background:hsl(${hue},30%,18%)">${letter}</div>`;
      }

      const tagPills = topTags.map(t => {
        const cls = CAT_CLASS[t.category] || 'tag-format';
        return `<span class="card-tag ${cls}">${t.tag}</span>`;
      }).join('');

      return `<div class="card" data-slug="${item.slug}">
        ${thumbHtml}
        <div class="card-body">
          <div class="card-title">${escHtml(item.title)}</div>
          <div class="card-domain">${escHtml(item.domain || '')}</div>
          <div class="card-tags">${tagPills}</div>
        </div>
      </div>`;
    }).join('');
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

  // --- Detail Modal ---
  async function openDetail(slug) {
    const item = allItems.find(i => i.slug === slug);
    if (!item) return;

    // Build initial content immediately
    let html = '';

    if (item.has_image && item.image_path) {
      html += `<img class="modal-image" src="${item.image_path}" alt="" onerror="this.style.display='none'">`;
    }

    html += `<h1 class="modal-title">${escHtml(item.title)}</h1>`;

    html += `<div class="modal-meta">`;
    if (item.domain) html += `<span>${escHtml(item.domain)}</span>`;
    if (item.author) html += `<span>by ${escHtml(item.author)}</span>`;
    if (item.status) html += `<span class="status-badge status-${item.status}">${item.status}</span>`;
    if (item.added_at) html += `<span>${new Date(item.added_at).toLocaleDateString()}</span>`;
    html += `</div>`;

    if (item.summary) {
      html += `<div class="modal-summary">${escHtml(item.summary)}</div>`;
    }

    html += `<div class="modal-tags">`;
    item.tags.sort((a, b) => b.weight - a.weight).forEach(t => {
      const cls = CAT_CLASS[t.category] || 'tag-format';
      html += `<span class="card-tag ${cls}">${t.tag}</span>`;
    });
    html += `</div>`;

    if (item.source_url) {
      html += `<a class="visit-source-btn" href="${item.source_url}" target="_blank" rel="noopener">Visit Source</a>`;
    }

    html += `<div class="modal-body" id="modal-body-md">Loading content...</div>`;

    $modalContent.innerHTML = html;
    $modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Fetch and render markdown body
    try {
      const mdRes = await fetch(`_items/${slug}/item.md`);
      if (mdRes.ok) {
        const raw = await mdRes.text();
        const body = extractMarkdownBody(raw);
        document.getElementById('modal-body-md').innerHTML = renderMarkdown(body);
      } else {
        document.getElementById('modal-body-md').innerHTML = '';
      }
    } catch {
      document.getElementById('modal-body-md').innerHTML = '';
    }
  }

  function closeDetail() {
    $modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // --- Markdown helpers ---
  function extractMarkdownBody(raw) {
    // Strip YAML frontmatter
    const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : raw.trim();
  }

  function renderMarkdown(md) {
    // Lightweight markdown -> HTML (no library)
    let html = md;

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Headings
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Bold and italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Paragraphs: wrap remaining lines
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
    // Search
    $search.addEventListener('input', function () {
      searchQuery = this.value.trim();
      renderGrid();
    });

    // Tag drawer toggle
    $drawerToggle.addEventListener('click', function () {
      tagDrawerOpen = !tagDrawerOpen;
      $drawer.classList.toggle('open', tagDrawerOpen);
      this.textContent = tagDrawerOpen ? 'Hide tags' : 'Browse tags';
    });

    // Tag chip click (delegation)
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

    // Active filter pill removal (delegation)
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

    // Card click -> detail (delegation)
    $grid.addEventListener('click', function (e) {
      const card = e.target.closest('.card');
      if (!card) return;
      openDetail(card.dataset.slug);
    });

    // Modal close
    $modalOverlay.addEventListener('click', function (e) {
      if (e.target === $modalOverlay || e.target.closest('.modal-close')) {
        closeDetail();
      }
    });

    // Escape key closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDetail();
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

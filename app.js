/* =====================================================================
   Photo Archive — app.js
   Fetches archive-data.json and renders folders, photo grids,
   breadcrumbs and a lightbox. No dependencies, no build step.

   Sections:
     1. Config
     2. Data helpers   (normalising JSON, Google Drive URLs, covers)
     3. Router         (hash-based: #/north-carolina-wing/encampment)
     4. Views          (breadcrumbs, folder page)
     5. Lightbox
     6. Boot
   ===================================================================== */
(() => {
  'use strict';

  /* ---------------------------------------------------------------
     1. CONFIG
     The JSON location can be overridden with ?data=<url>, handy for
     pointing at a file hosted elsewhere (e.g. raw.githubusercontent).
     --------------------------------------------------------------- */
  const DEFAULT_DATA_URL = 'archive-data.json';
  const DATA_URL = new URLSearchParams(location.search).get('data') || DEFAULT_DATA_URL;

  const FOLDER_ICON = `
    <svg class="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
    </svg>`;

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const crumbsEl = $('crumbs');

  let siteTitle = 'Photo Archive';
  let root = null;               // the root folder node from the JSON

  /* ---------------------------------------------------------------
     2. DATA HELPERS
     --------------------------------------------------------------- */

  /** "2026 NC Wing Encampment" -> "2026-nc-wing-encampment" */
  const slugify = (s) =>
    String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  /** Google Drive file ID -> image URL at a given width.
      The file must be shared as "Anyone with the link can view". */
  const driveUrl = (id, width) =>
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;

  /** Accepts a URL, or "drive:FILE_ID", and returns a usable URL. */
  function resolveSrc(value, width) {
    if (!value) return '';
    return value.startsWith('drive:') ? driveUrl(value.slice(6), width) : value;
  }

  /** Turn any supported image entry into { src, thumb, title }.
      Supported forms:
        "https://…/photo.jpg"
        "drive:FILE_ID"
        { "src": "…", "thumb": "…", "title": "…" }
        { "drive": "FILE_ID", "title": "…" }                         */
  function normalizeImage(raw) {
    if (typeof raw === 'string') raw = raw.startsWith('drive:') ? { drive: raw.slice(6) } : { src: raw };
    if (raw.drive) {
      return { src: driveUrl(raw.drive, 2400), thumb: driveUrl(raw.drive, 600), title: raw.title || '' };
    }
    const src = raw.src || raw.url || '';
    return { src, thumb: raw.thumb || src, title: raw.title || '' };
  }

  /** Walk the tree once: fill in slugs, normalise images, set parent links. */
  function prepare(folder, parent = null) {
    folder.slug   = folder.slug || slugify(folder.title || 'folder');
    folder.parent = parent;
    folder.folders = (folder.folders || []).map((f) => prepare(f, folder));
    folder.images  = (folder.images  || []).map(normalizeImage);
    return folder;
  }

  /** Total photos in a folder and all of its subfolders. */
  const countPhotos = (f) => f.images.length + f.folders.reduce((n, c) => n + countPhotos(c), 0);

  /** Cover image: explicit "cover" -> first photo -> first photo of any subfolder. */
  function coverFor(folder) {
    if (folder.cover) return resolveSrc(folder.cover, 900);
    if (folder.images.length) return folder.images[0].thumb;
    for (const child of folder.folders) {
      const c = coverFor(child);
      if (c) return c;
    }
    return '';
  }

  /* ---------------------------------------------------------------
     3. ROUTER
     URL hash holds the slug trail, e.g. #/north-carolina-wing/encampment
     --------------------------------------------------------------- */

  /** Resolve a hash into [root, child, grandchild…], or null if a slug is wrong. */
  function resolveTrail(hash) {
    const slugs = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const trail = [root];
    for (const slug of slugs) {
      const next = trail[trail.length - 1].folders.find((f) => f.slug === slug);
      if (!next) return null;
      trail.push(next);
    }
    return trail;
  }

  /** Build the hash link for a folder by walking up its parents. */
  function hrefFor(folder) {
    const slugs = [];
    for (let f = folder; f && f.parent; f = f.parent) slugs.unshift(encodeURIComponent(f.slug));
    return '#/' + slugs.join('/');
  }

  function route() {
    if (lightbox.isOpen()) lightbox.close();
    const trail = resolveTrail(location.hash);
    if (!trail) return renderNotFound();
    renderBreadcrumbs(trail);
    renderFolder(trail[trail.length - 1]);
    document.title = trail.length > 1
      ? `${trail[trail.length - 1].title} · ${siteTitle}`
      : siteTitle;
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------
     4. VIEWS
     All text goes in via textContent, so JSON content can't inject HTML.
     --------------------------------------------------------------- */

  /** Tiny element helper: el('div', {class:'x'}, child, 'text') */
  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const kid of kids) node.append(kid);
    return node;
  }

  function renderBreadcrumbs(trail) {
    crumbsEl.replaceChildren(
      ...trail.map((folder, i) => {
        const label = i === 0 ? 'Home' : folder.title;
        const isLast = i === trail.length - 1;
        const inner = isLast
          ? el('span', { 'aria-current': 'page' }, label)
          : el('a', { href: hrefFor(folder) }, label);
        return el('li', {}, inner);
      })
    );
    // On narrow screens, keep the current page visible at the right edge.
    crumbsEl.scrollLeft = crumbsEl.scrollWidth;
  }

  function folderCard(folder) {
    const card = el('a', { class: 'card', href: hrefFor(folder) });
    const cover = coverFor(folder);
    if (cover) card.append(el('img', { class: 'card__img', src: cover, alt: '', loading: 'lazy' }));

    const label = el('div', { class: 'card__label' });
    label.insertAdjacentHTML('beforeend', FOLDER_ICON);   // static, trusted markup
    label.append(el('span', { class: 'card__title' }, folder.title));
    const n = countPhotos(folder);
    if (n) label.append(el('span', { class: 'card__count' }, String(n)));
    card.append(label);
    return card;
  }

  function photoTile(image, index, images) {
    const btn = el('button', { class: 'photo', type: 'button', 'aria-label': image.title || `Photo ${index + 1}` });
    btn.append(el('img', { src: image.thumb, alt: image.title, loading: 'lazy' }));
    btn.addEventListener('click', () => lightbox.open(images, index, btn));
    return btn;
  }

  function renderFolder(folder) {
    const isRoot = !folder.parent;
    const photoCount = folder.images.length;
    const parts = [];
    if (folder.folders.length) parts.push(`${folder.folders.length} ${folder.folders.length === 1 ? 'folder' : 'folders'}`);
    if (photoCount) parts.push(`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`);

    const view = [
      el('h1', { class: 'page-title' }, isRoot ? (folder.title || siteTitle) : folder.title),
      el('p', { class: 'page-meta' }, folder.description || parts.join(', ')),
    ];

    if (folder.folders.length) {
      const grid = el('div', { class: 'folder-grid' });
      folder.folders.forEach((f) => grid.append(folderCard(f)));
      view.push(grid);
    }

    if (photoCount) {
      if (folder.folders.length) view.push(el('h2', { class: 'section-title' }, 'Photos'));
      const grid = el('div', { class: 'photo-grid' });
      folder.images.forEach((img, i, all) => grid.append(photoTile(img, i, all)));
      view.push(grid);
    }

    if (!folder.folders.length && !photoCount) {
      view.push(notice('This folder is empty', 'Add photos or subfolders to it in archive-data.json.'));
    }

    app.replaceChildren(...view);
  }

  function notice(title, ...lines) {
    return el('div', { class: 'notice' }, el('h2', {}, title), ...lines.map((l) => el('p', {}, l)));
  }

  function renderNotFound() {
    crumbsEl.replaceChildren(el('li', {}, el('a', { href: '#/' }, 'Home')));
    app.replaceChildren(
      el('h1', { class: 'page-title' }, 'Folder not found'),
      el('p', { class: 'page-meta' }, 'The link may be out of date.'),
      el('a', { href: '#/', class: 'notice' }, 'Back to Home')
    );
  }

  /* ---------------------------------------------------------------
     5. LIGHTBOX
     Uses the native <dialog>: Esc closes, focus is trapped, and focus
     returns to the clicked thumbnail afterwards.
     --------------------------------------------------------------- */
  const lightbox = (() => {
    const dlg = $('lightbox'), img = $('lb-img'), cap = $('lb-caption'),
          count = $('lb-count'), orig = $('lb-open');
    let items = [], index = 0, opener = null;

    function show(i) {
      index = (i + items.length) % items.length;          // wrap around
      const item = items[index];
      img.src = item.src;
      img.alt = item.title;
      cap.textContent = item.title;
      count.textContent = `${index + 1} / ${items.length}`;
      orig.href = item.src;
      // Preload neighbours so next/prev feels instant.
      [index + 1, index - 1].forEach((n) => {
        const nb = items[(n + items.length) % items.length];
        if (nb) new Image().src = nb.src;
      });
    }

    function open(list, i, from) {
      items = list; opener = from;
      show(i);
      dlg.showModal();
    }
    const close = () => dlg.open && dlg.close();
    const isOpen = () => dlg.open;

    $('lb-next').addEventListener('click', () => show(index + 1));
    $('lb-prev').addEventListener('click', () => show(index - 1));
    $('lb-close').addEventListener('click', close);
    dlg.addEventListener('close', () => { img.removeAttribute('src'); opener && opener.focus(); });

    // Click on the dark area (not the image or buttons) closes.
    $('lb-stage').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });

    // Keyboard arrows.
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft')  show(index - 1);
    });

    // Touch swipe.
    let startX = null;
    dlg.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });

    return { open, close, isOpen };
  })();

  /* ---------------------------------------------------------------
     6. BOOT
     --------------------------------------------------------------- */
  async function boot() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      siteTitle = data.site?.title || siteTitle;
      root = prepare({ title: siteTitle, description: data.site?.description, ...data.root });
      route();
      window.addEventListener('hashchange', route);
    } catch (err) {
      console.error(err);
      crumbsEl.replaceChildren();
      const onFile = location.protocol === 'file:';
      app.replaceChildren(
        notice(
          'Could not load the archive',
          onFile
            ? 'Browsers block loading JSON from a file:// page. Run a local server from this folder instead, for example: python3 -m http.server 8000, then open http://localhost:8000.'
            : `Check that ${DATA_URL} exists and is valid JSON (${err.message}).`
        )
      );
    }
  }

  boot();
})();

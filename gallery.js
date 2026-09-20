/* ============================================================
   CONFIG, waLink(), openWhatsApp(), R2_BASE_URL, mediaUrl(),
   escapeHtml(), isValidPhone() now live in config.js (loaded
   before this file) — single source of truth for both
   index.html and gallery.html.
============================================================ */

/* ============================================================
   NEWS / PROMOTIONS — same data/logic as index.js (keep both in
   sync). Add a new object here any time there's something to
   announce — the ticker and popup both pick from this list and
   shuffle the order automatically.
============================================================ */
const NEWS_ITEMS = [
  {
    tag: 'New Arrival',
    title: 'Cake Slices',
    price: '₦4,000 / slice',
    blurb: 'Delicious cake slices for any occasion — now on the Finger Foods menu.',
    images: [
      mediaUrl('img/cakeslice1-sm.jpg'),
      mediaUrl('img/cakeslice2-sm.jpg'),
    ],
    ctaHref: 'index.html#finger-foods', // ticker click-through
  },
];

function shuffleArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---- Scrolling ticker: builds one looping track from every item ---- */
const newsTickerTrack = document.getElementById('newsTickerTrack');
if(newsTickerTrack && NEWS_ITEMS.length){
  const order = shuffleArray(NEWS_ITEMS);
  const itemsHtml = order.map(n=>
    `<span class="news-ticker-item" data-href="${n.ctaHref || ''}"><span class="tag">${n.tag}:</span>&nbsp;${n.title} — ${n.price}</span><span class="sep">✦</span>`
  ).join('');
  newsTickerTrack.innerHTML = itemsHtml + itemsHtml; // duplicated so the CSS scroll loop is seamless
  newsTickerTrack.querySelectorAll('.news-ticker-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const href = el.dataset.href;
      if(href) window.location.href = href;
    });
  });
}

/* ---- Auto-dismiss popup: one random item, shown once per session ---- */
const newsModal = document.getElementById('newsModal');
if(newsModal && NEWS_ITEMS.length && !sessionStorage.getItem('lcNewsSeen')){
  const item = NEWS_ITEMS[Math.floor(Math.random() * NEWS_ITEMS.length)];
  const AUTO_DISMISS_MS = 5000;

  document.getElementById('newsModalTag').textContent = item.tag;
  document.getElementById('newsModalTitle').textContent = item.title;
  document.getElementById('newsModalPrice').textContent = item.price;
  document.getElementById('newsModalBlurb').textContent = item.blurb;
  document.getElementById('newsModalGallery').innerHTML = (item.images || []).slice(0, 3)
    .map(src=> `<img src="${src}" alt="${item.title}" fetchpriority="high" decoding="async">`).join('');
  // Timer bar's shrink animation is driven from here (not a fixed
  // CSS duration) so it can never drift out of sync with the actual
  // auto-dismiss delay above.
  document.getElementById('newsModalTimerBar').style.animationDuration = `${AUTO_DISMISS_MS}ms`;

  let dismissTimer;
  function closeNewsModal(){
    closeModal(newsModal);
    clearTimeout(dismissTimer);
  }
  document.getElementById('newsModalClose').addEventListener('click', closeNewsModal);
  document.getElementById('newsModalBackdrop').addEventListener('click', closeNewsModal);
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && newsModal.classList.contains('open')) closeNewsModal(); });

  sessionStorage.setItem('lcNewsSeen', '1');
  setTimeout(()=>{
    openModal(newsModal);
    dismissTimer = setTimeout(closeNewsModal, AUTO_DISMISS_MS);
  }, 1200);
}

const genericWaMessage = `Hello ${CONFIG.businessName}! I saw your gallery and I'd like to enquire about your cakes and catering services.`;
['navWaBtn','contactWaBtn','contactWaIcon'].forEach(id=>{
  const el = document.getElementById(id);
  if(el){ el.href = waLink(genericWaMessage); }
});

/* ============================================================
   TOAST
============================================================ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 3200);
}

/* ============================================================
   NAV BEHAVIOR
============================================================ */
const siteNav = document.getElementById('siteNav');
window.addEventListener('scroll', ()=>{
  siteNav.classList.toggle('scrolled', window.scrollY > 40);
});

/* ============================================================
   BACK TO TOP
============================================================ */
const scrollTopBtn = document.getElementById('scrollTopBtn');
let scrollTopHideTimer;
window.addEventListener('scroll', ()=>{
  if(window.scrollY > 500){
    clearTimeout(scrollTopHideTimer);
    scrollTopBtn.hidden = false;
    requestAnimationFrame(()=> scrollTopBtn.classList.add('show'));
  } else if(scrollTopBtn.classList.contains('show')){
    scrollTopBtn.classList.remove('show');
    scrollTopHideTimer = setTimeout(()=>{ scrollTopBtn.hidden = true; }, 260);
  }
});
scrollTopBtn.addEventListener('click', ()=> window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ============================================================
   SCROLL REVEAL
============================================================ */
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('is-visible'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
revealEls.forEach(el=> io.observe(el));

document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   ICONS
============================================================ */
const ICONS = {
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" width="42" height="42"><path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 21h16M8 12V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4M12 6V3M9 3.5l1.5 1.5M15 3.5 13.5 5"/></svg>',
  platter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" width="42" height="42"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" width="42" height="42"><path d="M3 12h18a9 6 0 0 1-18 0zM7 12a5 7 0 0 1 10 0"/></svg>',
  rice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" width="42" height="42"><path d="M5 20h14M6 20c-1-4 1-8 2-9M18 20c1-4-1-8-2-9M9 11c1-3 1-5 0-8M15 11c-1-3-1-5 0-8"/></svg>',
  meat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" width="42" height="42"><path d="M15 3c3 0 5.5 2.5 5.5 5.5 0 2-1 3.5-2.5 4.5l-7 7a2.5 2.5 0 0 1-3.5-3.5l7-7C15.5 8.5 15 6 15 3z"/></svg>',
  flower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="12" r="2.6"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18M12 8v13M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><path d="M3 9h18M5 9v11M19 9v11M9 3h6l-1 6h-4l-1-6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><path d="M20.8 8.6c0 4.4-8.8 10-8.8 10s-8.8-5.6-8.8-10a4.6 4.6 0 0 1 8.8-1.9A4.6 4.6 0 0 1 20.8 8.6z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><path d="M4 21V6l8-3 8 3v15M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="20" height="20"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
};

/* ============================================================
   FILTER CATEGORIES
   Add/rename tabs here — each gallery item's `category` below
   must match one of these values exactly.
============================================================ */
const filterCategories = ['All', 'Weddings', 'Cakes', 'Catering & Events', 'Finger Foods'];

/* ============================================================
   GALLERY ITEMS — data now lives in gallery-data.js (shared with
   index.html's cake-order modal via a plain <script defer> tag
   loaded before this file). Each entry's `iconKey` gets resolved
   against this page's own ICONS object here.
============================================================ */
const galleryItems = GALLERY_ITEMS.map(item => ({ ...item, icon: ICONS[item.iconKey] }));

const categoryCounts = filterCategories.reduce((acc, cat)=>{
  acc[cat] = cat === 'All' ? galleryItems.length : galleryItems.filter(g=> g.category === cat).length;
  return acc;
}, {});

/* ============================================================
   EDITORIAL INTERSTITIALS
   Section breaks (`type:'break'`) and a pull-quote (`type:'quote'`)
   inserted into the feed as it loads. `beforeId` is the gallery
   item id they appear directly above — only shown in the 'All' view.
============================================================ */
const interstitials = [
  { beforeId:1, type:'break', cat:'Weddings', num:'01', text:'The Weddings' },
  { beforeId:5, type:'break', cat:'Cakes', num:'02', text:'The Cakes' },
  { beforeId:302, type:'quote', quote:'The cake didn’t just look expensive — it tasted like it too. Guests kept asking who made it.', name:'Ifeoma A.', event:'Wedding Reception, Lekki' },
  { beforeId:302, type:'break', cat:'Catering & Events', num:'03', text:'The Catering & Styling' },
  { beforeId:10, type:'break', cat:'Finger Foods', num:'04', text:'The Finger Foods' },
];

/* ============================================================
   MASONRY LAYOUT
   Each batch of items lands in its own `.masonry-block` (absolute-
   positioned children, JS-measured heights from `aspect`) — cheap
   to lay out incrementally as new batches are appended, which is
   exactly what infinite scroll needs.
============================================================ */
function columnsForWidth(width){
  if(width < 640) return 1;
  if(width < 900) return 2;
  if(width < 1280) return 3;
  return 4;
}
function layoutBlock(block){
  const width = block.clientWidth;
  const cols = columnsForWidth(width);
  const gap = 20;
  const colWidth = (width - gap * (cols - 1)) / cols;
  const colHeights = new Array(cols).fill(0);
  const tiles = block.querySelectorAll(':scope > .gi');
  tiles.forEach(tile=>{
    const aspect = parseFloat(tile.dataset.aspect) || 1;
    const span = (tile.dataset.span === '2' && cols >= 2) ? 2 : 1;
    let col = 0, bestHeight = Infinity;
    for(let i = 0; i <= cols - span; i++){
      const h = Math.max(...colHeights.slice(i, i + span));
      if(h < bestHeight){ bestHeight = h; col = i; }
    }
    const w = colWidth * span + gap * (span - 1);
    const h = w / aspect;
    tile.style.width = w + 'px';
    tile.style.height = h + 'px';
    tile.style.transform = `translate(${col * (colWidth + gap)}px, ${bestHeight}px)`;
    for(let i = col; i < col + span; i++) colHeights[i] = bestHeight + h + gap;
  });
  block.style.height = Math.max(0, ...colHeights) - gap + 'px';
}
function layoutAllBlocks(){
  galGrid.querySelectorAll('.masonry-block').forEach(layoutBlock);
}
function debounce(fn, wait){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=> fn(...args), wait); };
}
window.addEventListener('resize', debounce(layoutAllBlocks, 150));

// Takes the specific tiles just added (not the whole block) so the
// delay always starts back at 0 for each new chunk — indexing off
// the growing block's full tile count would make the stagger delay
// climb without bound as a long category accumulates more batches
// (e.g. tile #216 of a 238-item category would wait 216*55 ≈ 12s).
function staggerReveal(tiles){
  tiles.forEach((tile, i)=>{
    setTimeout(()=> tile.classList.add('gi-in'), i * 55);
  });
}

/* ============================================================
   TILE / BREAK / QUOTE / END-CARD RENDERING
============================================================ */
// Native loading="lazy" doesn't work here: these tiles are absolutely
// positioned and sized a frame later (by layoutBlock, via
// requestAnimationFrame), so at insertion time the browser sees a
// 0x0 element and its native lazy-load heuristic decides once and
// never reconsiders it after the resize — the image never loads.
// A plain IntersectionObserver doesn't have that problem: it keeps
// watching and re-fires whenever the target's real geometry changes,
// so observing it immediately (before layoutBlock runs) is fine —
// it'll correctly report "not intersecting" until the tile is both
// positioned for real AND actually near the viewport.
const galImageObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    const img = entry.target;
    img.src = img.dataset.src;
    delete img.dataset.src;
    galImageObserver.unobserve(img);
  });
}, { rootMargin: '400px 0px' });

function makeTile(item){
  const el = document.createElement('div');
  el.className = 'gi';
  el.dataset.id = item.id;
  el.dataset.aspect = item.aspect || 1;
  el.dataset.span = item.span2 ? '2' : '1';

  const media = document.createElement('div');
  media.className = `media-frame ${item.tone || ''}`;
  media.innerHTML = item.image
    ? `<img data-src="${item.image}" alt="${item.caption}">`
    : `<div class="ring"></div>${item.icon}`;
  el.appendChild(media);
  if(item.image){
    const img = media.querySelector('img');
    bindMediaSkeleton(media, img);
    galImageObserver.observe(img);
  }

  el.insertAdjacentHTML('beforeend', `
    <div class="gi-overlay">
      <span class="gi-index">${String(item.id).padStart(2, '0')}</span>
      ${item.caption ? `<div class="gi-cap">${item.caption}</div>` : ''}
      ${item.sub ? `<div class="gi-sub">${item.sub}</div>` : ''}
    </div>
    ${item.label ? `<span class="gi-label${item.label === 'Coming Soon' ? ' gi-label--soon' : ''}">${item.label}</span>` : ''}
    <span class="gi-cat">${item.category}</span>`);

  el.addEventListener('click', ()=> openLightbox(item.id));
  return el;
}
function renderBreak(b){
  const div = document.createElement('div');
  div.className = 'gal-break';
  div.innerHTML = `<span class="gb-num">${b.num}</span><div class="gb-mid"><span class="gb-text">${b.text}</span><div class="gb-line"></div></div><span class="gb-count">${categoryCounts[b.cat]} piece${categoryCounts[b.cat] === 1 ? '' : 's'}</span>`;
  galGrid.appendChild(div);
}
function renderQuote(q){
  const div = document.createElement('div');
  div.className = 'gal-quote';
  div.innerHTML = `<span class="gq-mark">&ldquo;</span><p>${q.quote}</p><span class="gq-who">${q.name} — ${q.event}</span>`;
  galGrid.appendChild(div);
}
function showEndCard(){
  const count = workingItems.length;
  const div = document.createElement('div');
  div.className = 'gal-end';
  div.innerHTML = `
    <span class="eyebrow" style="justify-content:center;">End of the Archive — For Now</span>
    <h3>You've seen all ${count} piece${count === 1 ? '' : 's'}${activeFilter === 'All' ? ' of our current collection' : ` in ${activeFilter}`}</h3>
    <p>We photograph every order — this space grows every week. Follow along on Instagram for the newest work, or start your own.</p>
    <div class="gal-end-ctas">
      <a href="#" class="btn btn-wine" id="galEndWaBtn">Start Your Order</a>
      <a href="#" class="btn btn-outline" target="_blank" rel="noopener">Follow on Instagram</a>
    </div>`;
  galGrid.appendChild(div);
  div.querySelector('#galEndWaBtn').href = waLink(genericWaMessage);
}

/* ============================================================
   INFINITE SCROLL
   Each call to loadMore() renders up to BATCH_SIZE items — capped
   at a category boundary, never spanning two, so editorial breaks
   still always land between tiles, never mid-category. A category
   longer than BATCH_SIZE (Cakes, at 238) spans several calls, but
   they keep appending into the SAME .masonry-block and re-running
   layoutBlock() on the whole thing (cheap — it's just arithmetic,
   no DOM measurement beyond one clientWidth read) rather than
   starting a new block per chunk, so the masonry stays one
   continuous column layout with no seam at the chunk boundary —
   only real category changes start a new block. The first chunk of
   a view loads immediately; every chunk after that waits on the
   sentinel scrolling into view. No artificial delay: with
   galleryItems as a local array there's no real fetch to wait on,
   so faking one only slowed down what's otherwise an instant
   response to scrolling.
============================================================ */
const BATCH_SIZE = 24;
const galGrid = document.getElementById('galGrid');
const galSentinel = document.getElementById('galSentinel');
let activeFilter = 'All';
let workingItems = [];
let nextIndex = 0;
let loading = false;
let insertedInterstitials = new Set();
let currentBlock = null;
let currentBlockCategory = null;

function itemsForFilter(filter){
  return filter === 'All' ? galleryItems : galleryItems.filter(g=> g.category === filter);
}
function maybeInsertInterstitials(beforeId){
  if(activeFilter !== 'All') return;
  interstitials.forEach(x=>{
    const key = x.beforeId + '-' + x.type;
    if(x.beforeId === beforeId && !insertedInterstitials.has(key)){
      insertedInterstitials.add(key);
      if(x.type === 'break') renderBreak(x); else renderQuote(x);
    }
  });
}
function sentinelIsNear(){
  const rect = galSentinel.getBoundingClientRect();
  return rect.top < window.innerHeight + 600;
}
function loadMore(){
  if(loading || nextIndex >= workingItems.length) return;
  loading = true;

  const startItem = workingItems[nextIndex];
  maybeInsertInterstitials(startItem.id);

  const cat = startItem.category;
  let end = nextIndex;
  while(end < workingItems.length && workingItems[end].category === cat && (end - nextIndex) < BATCH_SIZE) end++;

  if(currentBlockCategory !== cat){
    currentBlock = document.createElement('div');
    currentBlock.className = 'masonry-block';
    galGrid.appendChild(currentBlock);
    currentBlockCategory = cat;
  }
  const newTiles = [];
  for(let i = nextIndex; i < end; i++){
    const tile = makeTile(workingItems[i]);
    newTiles.push(tile);
    currentBlock.appendChild(tile);
  }

  nextIndex = end;
  loading = false;
  const block = currentBlock;
  requestAnimationFrame(()=>{
    layoutBlock(block);
    staggerReveal(newTiles);
    // IntersectionObserver only fires on boundary crossings — if the
    // sentinel is still within range after this chunk lands (e.g. the
    // page is already scrolled to the bottom), it won't cross again on
    // its own, so keep the chain going manually until it's pushed out
    // of range or the data runs out.
    if(nextIndex < workingItems.length && sentinelIsNear()) loadMore();
    else if(nextIndex >= workingItems.length) showEndCard();
  });
}
function resetGrid(filter){
  galGrid.innerHTML = '';
  activeFilter = filter;
  workingItems = itemsForFilter(filter);
  nextIndex = 0;
  loading = false;
  insertedInterstitials = new Set();
  currentBlock = null;
  currentBlockCategory = null;
  loadMore();
}
new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting) loadMore(); });
}, { rootMargin: '600px 0px' }).observe(galSentinel);

/* ============================================================
   FILTER TABS
   Supports landing pre-filtered via ?filter=<category> in the URL
   (e.g. gallery.html?filter=Cakes) — used by the "View Cake Designs"
   link on the homepage's cake form, so it can point straight at the
   real gallery's own (already batch-loaded/lazy) infinite scroll
   instead of duplicating a chunk of galleryItems into index.js.
============================================================ */
const galFilters = document.getElementById('galFilters');
const urlFilter = new URLSearchParams(location.search).get('filter');
const initialFilter = filterCategories.includes(urlFilter) ? urlFilter : 'All';
let initialFilterBtn = null;
filterCategories.forEach((cat)=>{
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gal-filter' + (cat === initialFilter ? ' active' : '');
  btn.innerHTML = `${cat} <span class="gf-count">${categoryCounts[cat]}</span>`;
  btn.addEventListener('click', ()=>{
    if(activeFilter === cat) return;
    galFilters.querySelectorAll('.gal-filter').forEach(b=> b.classList.remove('active'));
    btn.classList.add('active');
    resetGrid(cat);
  });
  galFilters.appendChild(btn);
  if(cat === initialFilter) initialFilterBtn = btn;
});
// Only matters when the tab bar itself scrolls (narrow screens) and
// the pre-selected filter isn't the first tab — keeps the active
// one from landing off-screen.
if(initialFilter !== 'All') initialFilterBtn.scrollIntoView({ inline: 'center', block: 'nearest' });
resetGrid(initialFilter);

/* ============================================================
   VIDEO TESTIMONIALS
============================================================ */
const videoTestimonials = [
  { name:'Dessert Table Detail', video:mediaUrl('videos/InShot_20251120_221945950.mp4'), tone:'' },
  { name:'Wedding Cake Reveal', video:mediaUrl('videos/InShot_20251120_224656122.mp4'), tone:'tone-b' },
  { name:'Wedding Day Moment', video:mediaUrl('videos/InShot_20251122_180814090.mp4'), tone:'tone-c' },
  { name:'Cake & Champagne Reveal', video:mediaUrl('videos/InShot_20251213_115333572.mp4'), tone:'tone-b' },
  { name:'Reception Cake Moment', video:mediaUrl('videos/InShot_20251217_202707600.mp4'), tone:'tone-c' },
];
const videoReel = document.getElementById('videoReel');
videoTestimonials.forEach(v=>{
  const el = document.createElement('div');
  el.className = `media-frame reel-item ${v.tone}`;
  el.innerHTML = v.video
    ? `<video src="${v.video}" muted loop playsinline preload="metadata"></video><div class="cap"><span class="who">${v.name}</span></div>`
    : `<div class="ring"></div><span class="play-badge">${ICONS.play}</span><div class="cap">${v.name}</div>`;
  videoReel.appendChild(el);
});
// Autoplay each clip only while it's actually in view (muted, so
// autoplay is allowed cross-browser); pause it once scrolled away.
const reelVideoObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting) entry.target.play().catch(()=>{});
    else entry.target.pause();
  });
}, { threshold: 0.5 });
videoReel.querySelectorAll('video').forEach(v=> reelVideoObserver.observe(v));

/* ============================================================
   TESTIMONIAL QUOTES
============================================================ */
const testimonials = [
  { quote:'The cake didn\'t just look expensive — it tasted like it too. Guests kept asking who made it.', name:'Ifeoma A.', event:'Wedding Reception, Lekki' },
  { quote:'We ordered small chops for 150 guests and everything arrived hot, on time, beautifully packed.', name:'Tunde O.', event:'Corporate Launch' },
  { quote:'The Afang soup alone made my mother-in-law\'s day. We\'re already booking for next year.', name:'Grace E.', event:'Family Owambe' },
  { quote:'Everyone thought we hired an event company from Lagos. It was one woman and a great team.', name:'Blessing N.', event:'40th Birthday' },
  { quote:'The wedding cake arrived exactly as we designed it on WhatsApp, down to the inscription.', name:'Chidi & Amaka', event:'Wedding, Owerri' },
  { quote:'Bulk jollof for 200 people and it still tasted like home cooking. Rare to find.', name:'Pastor Emeka', event:'Church Anniversary' },
];
const testimonialGrid = document.getElementById('testimonialGrid');
testimonials.forEach(t=>{
  const el = document.createElement('div');
  el.className = 't-card';
  el.innerHTML = `<span class="quote-mark">&ldquo;</span><p>${t.quote}</p>
    <div class="who"><span class="initial">${t.name.charAt(0)}</span><div><div class="name">${t.name}</div><div class="event">${t.event}</div></div></div>`;
  testimonialGrid.appendChild(el);
});

/* ============================================================
   LIGHTBOX (prev/next within the currently filtered items)
============================================================ */
const lightbox = document.getElementById('lightbox');
const lightboxInner = document.getElementById('lightboxInner');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxSub = document.getElementById('lightboxSub');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
let lbIndex = 0;
let lbItems = [];

function openLightbox(id){
  lbItems = galleryItems.filter(g=> activeFilter === 'All' || g.category === activeFilter);
  lbIndex = lbItems.findIndex(g=> g.id === id);
  renderLightbox();
  openModal(lightbox);
}
function renderLightbox(){
  const item = lbItems[lbIndex];
  if(!item) return;
  lightboxInner.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}" loading="lazy" style="border-radius:2px;">`
    : `<div class="media-frame ${item.tone}" style="aspect-ratio:4/5; border-radius:2px;"><div class="ring"></div>${item.icon}</div>`;
  lightboxCaption.textContent = item.caption;
  lightboxCaption.hidden = !item.caption;
  lightboxSub.textContent = item.sub;
  lightboxSub.hidden = !item.sub;
  lightboxPrev.style.opacity = lbIndex > 0 ? '1' : '0.25';
  lightboxNext.style.opacity = lbIndex < lbItems.length - 1 ? '1' : '0.25';
}
document.getElementById('lightboxClose').addEventListener('click', ()=> closeModal(lightbox));
lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) closeModal(lightbox); });
lightboxPrev.addEventListener('click', ()=>{ if(lbIndex > 0){ lbIndex--; renderLightbox(); } });
lightboxNext.addEventListener('click', ()=>{ if(lbIndex < lbItems.length - 1){ lbIndex++; renderLightbox(); } });
document.addEventListener('keydown', (e)=>{
  if(!lightbox.classList.contains('open')) return;
  if(e.key === 'Escape') closeModal(lightbox);
  if(e.key === 'ArrowLeft' && lbIndex > 0){ lbIndex--; renderLightbox(); }
  if(e.key === 'ArrowRight' && lbIndex < lbItems.length - 1){ lbIndex++; renderLightbox(); }
});
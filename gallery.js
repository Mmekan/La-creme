/* ============================================================
   CONFIG
   (Same number as index.js — update both if you change it, or
   see the note in gallery.html's top comment about consolidating
   this later.)
============================================================ */
const CONFIG = {
  whatsappNumber: '2348066556677',
  businessName: 'La Crème'
};

document.getElementById('contactPhoneDisplay').textContent =
  '+' + CONFIG.whatsappNumber.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1 $2 $3 $4');

function waLink(message){
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
function openWhatsApp(message){
  window.open(waLink(message), '_blank');
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
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', ()=>{
  const open = navLinks.classList.toggle('open');
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
});
navLinks.querySelectorAll('a').forEach(a=> a.addEventListener('click', ()=>{
  navLinks.classList.remove('open'); navToggle.classList.remove('open');
}));

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
   GALLERY ITEMS — real La Crème photography, from /img.
   `aspect` is width÷height and drives the masonry tile's height
   (no cropping surprises — pick a number close to the photo's
   real ratio: ~0.75-0.85 for portrait, ~1 for square, ~1.3-1.6
   for landscape). `span2` stretches a tile across two columns
   for the occasional full-bleed "spread" moment.
   Leave `image` null to keep the elegant placeholder frame for
   categories that don't have real photos yet.

   ------------------------------------------------------------
   HOOKING THIS UP TO CLOUDFLARE R2 (once the bucket is live):
   Replace the static `galleryItems` array below with an async
   fetch against a small JSON manifest (or a Worker endpoint that
   lists the bucket) — e.g.:

     let galleryItems = [];
     async function loadGalleryItems(){
       const res = await fetch('https://<your-worker-or-cdn>/gallery-manifest.json');
       galleryItems = await res.json();
       resetGrid('All');
     }

   Everything below this point (masonry layout, infinite scroll,
   filters, lightbox) already reads from `galleryItems` and
   `itemsForFilter()`, so nothing else needs to change — the
   manifest just needs the same shape as the objects below
   (id, category, image, caption, sub, aspect).
   ------------------------------------------------------------
============================================================ */
const galleryItems = [
  // — Weddings —
  { id:1, category:'Weddings', span2:true, aspect:1.4, icon:ICONS.cake, tone:'', image:'img/504807796_9099742323462413_1120354441484283313_n.jpg', caption:'Under the Chandeliers', sub:'Reception centerpiece, styled with hanging florals & crystal light', label:'Featured' },
  { id:2, category:'Weddings', aspect:0.75, icon:ICONS.cake, tone:'tone-b', image:'img/503736309_9061189193984393_2635635431881218558_n.jpg', caption:'The Six-Tier Reveal', sub:'Red, black & ivory — a full family celebration' },
  { id:3, category:'Weddings', aspect:0.8, icon:ICONS.heart, tone:'tone-c', image:'img/504388932_9085240524912593_6387128751467127027_n.jpg', caption:'Lilac, Slate & Sealed With Rings', sub:'Four-tier wedding cake, custom palette' },
  { id:4, category:'Weddings', aspect:0.78, icon:ICONS.flower, tone:'', image:'img/504685489_9085240854912560_3651136197304790624_n.jpg', caption:'Crystal Base, Ivory Tiers', sub:'Wedding cake with crystal stand detail' },

  // — Cakes —
  { id:5, category:'Cakes', aspect:0.85, icon:ICONS.flower, tone:'tone-b', image:'img/503084596_9068281273275185_5558051441541664408_n.jpg', caption:'For Mummy, With Love', sub:'Birthday cake, sugar-flower finish' },
  { id:6, category:'Cakes', aspect:0.95, icon:ICONS.heart, tone:'tone-c', image:'img/503416798_9068281249941854_7585160892651594669_n.jpg', caption:'The Boss Cake', sub:'Chocolate birthday cake, loaded finish' },
  { id:7, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:'img/505753228_9109996449103667_9107171079224956350_n.jpg', caption:'A Pot Worth Celebrating', sub:'Custom novelty cake, sculpted to order' },

  // — Catering & Events — (no photos in the archive yet — placeholders
  // until real ones are added; keep the category so the filter tab works)
  { id:8, category:'Catering & Events', aspect:1.35, icon:ICONS.rice, tone:'tone-b', image:null, caption:'The Owambe Spread', sub:'Bulk jollof & fried rice, plated for 300 guests', label:'Coming Soon' },
  { id:9, category:'Catering & Events', aspect:0.8, icon:ICONS.gift, tone:'tone-c', image:null, caption:'Dessert & Styling Table', sub:'Full dessert table + event styling', label:'Coming Soon' },

  // — Finger Foods —
  { id:10, category:'Finger Foods', span2:true, aspect:1.55, icon:ICONS.platter, tone:'', image:'img/123520380_2807744082662300_1396207157575276742_n.jpg', caption:'The Full Small Chops Platter', sub:'Spring rolls, samosas, drumettes & puff-puff' },
  { id:11, category:'Finger Foods', aspect:1.3, icon:ICONS.meat, tone:'tone-b', image:'img/123515735_2807744542662254_376565533110552828_n.jpg', caption:'Boxed & Ready to Travel', sub:'Individually packed small chops trays' },
  { id:12, category:'Finger Foods', aspect:1.3, icon:ICONS.platter, tone:'tone-c', image:'img/123525387_2807744419328933_5693730396838484112_n.jpg', caption:'Packed for Pickup', sub:'Small chops, prepped for a 100-guest order' },
  { id:13, category:'Finger Foods', aspect:1.3, icon:ICONS.meat, tone:'', image:'img/123589705_2807744209328954_7226536928879259652_n.jpg', caption:'Ready for Cocktail Hour', sub:'Small chops trays, boxed and labeled' },
];

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
  { beforeId:8, type:'quote', quote:'The cake didn’t just look expensive — it tasted like it too. Guests kept asking who made it.', name:'Ifeoma A.', event:'Wedding Reception, Lekki' },
  { beforeId:8, type:'break', cat:'Catering & Events', num:'03', text:'The Catering & Styling' },
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

function staggerReveal(block){
  block.querySelectorAll('.gi').forEach((tile, i)=>{
    setTimeout(()=> tile.classList.add('gi-in'), i * 55);
  });
}

/* ============================================================
   TILE / BREAK / QUOTE / END-CARD RENDERING
============================================================ */
function makeTile(item){
  const el = document.createElement('div');
  el.className = 'gi';
  el.dataset.id = item.id;
  el.dataset.aspect = item.aspect || 1;
  el.dataset.span = item.span2 ? '2' : '1';

  const media = document.createElement('div');
  media.className = `media-frame ${item.tone || ''}`;
  media.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}" loading="lazy">`
    : `<div class="ring"></div>${item.icon}`;
  el.appendChild(media);

  el.insertAdjacentHTML('beforeend', `
    <div class="gi-overlay">
      <span class="gi-index">${String(item.id).padStart(2, '0')}</span>
      <div class="gi-cap">${item.caption}</div>
      <div class="gi-sub">${item.sub}</div>
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
   Each call to loadMore() renders exactly one category's worth
   of items as a batch (so editorial breaks always land between
   batches, never mid-category). The first batch of a view loads
   immediately; every batch after that waits on the sentinel
   scrolling into view, with a short simulated-network delay so
   the loader is visible — swap in a real fetch delay once this
   reads from R2 and the loader keeps working unchanged.
============================================================ */
const galGrid = document.getElementById('galGrid');
const galLoader = document.getElementById('galLoader');
const galSentinel = document.getElementById('galSentinel');
let activeFilter = 'All';
let workingItems = [];
let nextIndex = 0;
let loading = false;
let insertedInterstitials = new Set();

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
function loadMore(immediate){
  if(loading || nextIndex >= workingItems.length) return;
  loading = true;
  const run = ()=>{
    galLoader.classList.remove('show');
    const startItem = workingItems[nextIndex];
    maybeInsertInterstitials(startItem.id);

    const cat = startItem.category;
    let end = nextIndex;
    while(end < workingItems.length && workingItems[end].category === cat) end++;

    const block = document.createElement('div');
    block.className = 'masonry-block';
    for(let i = nextIndex; i < end; i++) block.appendChild(makeTile(workingItems[i]));
    galGrid.appendChild(block);

    nextIndex = end;
    loading = false;
    requestAnimationFrame(()=>{
      layoutBlock(block);
      staggerReveal(block);
      // IntersectionObserver only fires on boundary crossings — if the
      // sentinel is still within range after this batch lands (e.g. the
      // page is already scrolled to the bottom), it won't cross again on
      // its own, so keep the chain going manually until it's pushed out
      // of range or the data runs out.
      if(nextIndex < workingItems.length && sentinelIsNear()) loadMore(false);
      else if(nextIndex >= workingItems.length) showEndCard();
    });
  };
  if(immediate) run();
  else { galLoader.classList.add('show'); setTimeout(run, 480 + Math.random() * 320); }
}
function resetGrid(filter){
  galGrid.innerHTML = '';
  galLoader.classList.remove('show');
  activeFilter = filter;
  workingItems = itemsForFilter(filter);
  nextIndex = 0;
  loading = false;
  insertedInterstitials = new Set();
  loadMore(true);
}
new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting) loadMore(false); });
}, { rootMargin: '600px 0px' }).observe(galSentinel);

/* ============================================================
   FILTER TABS
============================================================ */
const galFilters = document.getElementById('galFilters');
filterCategories.forEach((cat, i)=>{
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gal-filter' + (i === 0 ? ' active' : '');
  btn.innerHTML = `${cat} <span class="gf-count">${categoryCounts[cat]}</span>`;
  btn.addEventListener('click', ()=>{
    if(activeFilter === cat) return;
    galFilters.querySelectorAll('.gal-filter').forEach(b=> b.classList.remove('active'));
    btn.classList.add('active');
    resetGrid(cat);
  });
  galFilters.appendChild(btn);
});
resetGrid('All');

/* ============================================================
   VIDEO TESTIMONIALS
============================================================ */
const videoTestimonials = [
  { name:'Bride, Lekki Wedding', video:null, tone:'' },
  { name:'Host, 40th Birthday', video:null, tone:'tone-b' },
  { name:'Corporate Client', video:null, tone:'tone-c' },
  { name:'Naming Ceremony Family', video:null, tone:'' },
  { name:'Groom, Owerri Wedding', video:null, tone:'tone-b' },
  { name:'Host, Baby Shower', video:null, tone:'tone-c' },
];
const videoReel = document.getElementById('videoReel');
videoTestimonials.forEach(v=>{
  const el = document.createElement('div');
  el.className = `media-frame reel-item ${v.tone}`;
  el.innerHTML = v.video
    ? `<video src="${v.video}" controls playsinline></video>`
    : `<div class="ring"></div><span class="play-badge">${ICONS.play}</span><div class="cap">Client testimonial video</div><span class="cap who">${v.name}</span>`;
  videoReel.appendChild(el);
});

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
  lightbox.classList.add('open');
}
function renderLightbox(){
  const item = lbItems[lbIndex];
  if(!item) return;
  lightboxInner.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}" style="border-radius:2px;">`
    : `<div class="media-frame ${item.tone}" style="aspect-ratio:4/5; border-radius:2px;"><div class="ring"></div>${item.icon}</div>`;
  lightboxCaption.textContent = item.caption;
  lightboxSub.textContent = item.sub;
  lightboxPrev.style.opacity = lbIndex > 0 ? '1' : '0.25';
  lightboxNext.style.opacity = lbIndex < lbItems.length - 1 ? '1' : '0.25';
}
document.getElementById('lightboxClose').addEventListener('click', ()=> lightbox.classList.remove('open'));
lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) lightbox.classList.remove('open'); });
lightboxPrev.addEventListener('click', ()=>{ if(lbIndex > 0){ lbIndex--; renderLightbox(); } });
lightboxNext.addEventListener('click', ()=>{ if(lbIndex < lbItems.length - 1){ lbIndex++; renderLightbox(); } });
document.addEventListener('keydown', (e)=>{
  if(!lightbox.classList.contains('open')) return;
  if(e.key === 'Escape') lightbox.classList.remove('open');
  if(e.key === 'ArrowLeft' && lbIndex > 0){ lbIndex--; renderLightbox(); }
  if(e.key === 'ArrowRight' && lbIndex < lbItems.length - 1){ lbIndex++; renderLightbox(); }
});
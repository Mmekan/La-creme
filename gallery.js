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
      mediaUrl('img/503084596_9068281273275185_5558051441541664408_n.jpg'),
      mediaUrl('img/503416798_9068281249941854_7585160892651594669_n.jpg'),
      mediaUrl('img/504685489_9085240854912560_3651136197304790624_n.jpg'),
    ],
    ctaLabel: 'Order Now',
    ctaHref: 'index.html#finger-foods',
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
  const AUTO_DISMISS_MS = 7000;

  document.getElementById('newsModalTag').textContent = item.tag;
  document.getElementById('newsModalTitle').textContent = item.title;
  document.getElementById('newsModalPrice').textContent = item.price;
  document.getElementById('newsModalBlurb').textContent = item.blurb;
  document.getElementById('newsModalGallery').innerHTML = (item.images || []).slice(0, 3)
    .map(src=> `<img src="${src}" alt="${item.title}">`).join('');
  const ctaEl = document.getElementById('newsModalCta');
  ctaEl.textContent = item.ctaLabel || 'Learn More';
  ctaEl.href = item.ctaHref || '#';

  let dismissTimer;
  function closeNewsModal(){
    closeModal(newsModal);
    clearTimeout(dismissTimer);
  }
  document.getElementById('newsModalClose').addEventListener('click', closeNewsModal);
  document.getElementById('newsModalBackdrop').addEventListener('click', closeNewsModal);
  ctaEl.addEventListener('click', closeNewsModal);
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
   GALLERY ITEMS — real La Crème photography, hosted on the R2
   bucket (see R2_BASE_URL / mediaUrl() above) rather than this
   repo. `aspect` is width÷height and drives the masonry tile's
   height (no cropping surprises — pick a number close to the
   photo's real ratio: ~0.75-0.85 for portrait, ~1 for square,
   ~1.3-1.6 for landscape). `span2` stretches a tile across two
   columns for the occasional full-bleed "spread" moment.
   Leave `image` null to keep the elegant placeholder frame for
   categories that don't have real photos yet.

   ADDING A NEW PHOTO: upload it to the R2 bucket under `img/`,
   then add an entry below with `image: mediaUrl('img/your-file.jpg')`.

   GOING FURTHER: once there are enough photos that hand-editing
   this array gets tedious, swap it for an async fetch against a
   small JSON manifest (or a Worker endpoint that lists the
   bucket) — everything below this point (masonry layout, infinite
   scroll, filters, lightbox) already reads from `galleryItems`
   and `itemsForFilter()`, so nothing else would need to change.
============================================================ */
const galleryItems = [
  // — Weddings —
  { id:1, category:'Weddings', span2:true, aspect:1.4, icon:ICONS.cake, tone:'', image:mediaUrl('img/504807796_9099742323462413_1120354441484283313_n.jpg'), caption:'Under the Chandeliers', sub:'Reception centerpiece, styled with hanging florals & crystal light', label:'Featured' },
  { id:2, category:'Weddings', aspect:0.75, icon:ICONS.cake, tone:'tone-b', image:mediaUrl('img/503736309_9061189193984393_2635635431881218558_n.jpg'), caption:'The Six-Tier Reveal', sub:'Red, black & ivory — a full family celebration' },
  { id:3, category:'Weddings', aspect:0.8, icon:ICONS.heart, tone:'tone-c', image:mediaUrl('img/504388932_9085240524912593_6387128751467127027_n.jpg'), caption:'Lilac, Slate & Sealed With Rings', sub:'Four-tier wedding cake, custom palette' },
  { id:4, category:'Weddings', aspect:0.78, icon:ICONS.flower, tone:'', image:mediaUrl('img/504685489_9085240854912560_3651136197304790624_n.jpg'), caption:'Crystal Base, Ivory Tiers', sub:'Wedding cake with crystal stand detail' },
  { id:14, category:'Weddings', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230912_173214343~2.jpg'), caption:'A Wedding Cake to Remember', sub:'Bespoke wedding cake, made to order' },
  { id:15, category:'Weddings', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231001_193222881~3.jpg'), caption:'Tiered for the Big Day', sub:'Every tier, considered' },
  { id:17, category:'Weddings', aspect:0.61, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231028_151210015.jpg'), caption:'Wedding Cake, Custom Palette', sub:'Bespoke wedding cake, made to order' },
  { id:19, category:'Weddings', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231028_155626880.jpg'), caption:'', sub:'' },
  { id:20, category:'Weddings', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231207_154250281~2.jpg'), caption:'', sub:'' },
  { id:21, category:'Weddings', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231208_154325680.jpg'), caption:'The Reception Centerpiece', sub:'Every tier, considered' },
  { id:24, category:'Weddings', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231213_093315211~3.jpg'), caption:'', sub:'' },
  { id:26, category:'Weddings', aspect:0.63, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241006_181132962.jpg'), caption:'', sub:'' },
  { id:27, category:'Weddings', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241109_190851349.jpg'), caption:'', sub:'' },
  { id:29, category:'Weddings', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250109_125809896.jpg'), caption:'', sub:'' },
  { id:30, category:'Weddings', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250126_193037744.jpg'), caption:'', sub:'' },
  { id:31, category:'Weddings', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250524_083518378.jpg'), caption:'', sub:'' },
  { id:33, category:'Weddings', aspect:0.61, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251120_225707906.jpg'), caption:'Styled for \'I Do\'', sub:'Every tier, considered' },
  { id:34, category:'Weddings', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260128_085430295~2.jpg'), caption:'', sub:'' },

  // — Cakes —
  { id:5, category:'Cakes', aspect:0.85, icon:ICONS.flower, tone:'tone-b', image:mediaUrl('img/503084596_9068281273275185_5558051441541664408_n.jpg'), caption:'For Mummy, With Love', sub:'Birthday cake, sugar-flower finish' },
  { id:6, category:'Cakes', aspect:0.95, icon:ICONS.heart, tone:'tone-c', image:mediaUrl('img/503416798_9068281249941854_7585160892651594669_n.jpg'), caption:'The Boss Cake', sub:'Chocolate birthday cake, loaded finish' },
  { id:7, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/505753228_9109996449103667_9107171079224956350_n.jpg'), caption:'A Pot Worth Celebrating', sub:'Custom novelty cake, sculpted to order' },
  { id:35, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/IMG_20220210_101300_855.jpg'), caption:'A Cake Worth the Occasion', sub:'From the La Crème kitchen' },
  { id:36, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230808_153643251~2.jpg'), caption:'Custom Cake, Made to Order', sub:'Custom flavors & finish, made to order' },
  { id:37, category:'Cakes', aspect:0.74, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230820_215803387~2.jpg'), caption:'Handcrafted for the Celebration', sub:'Every cake tells a celebration\'s story' },
  { id:38, category:'Cakes', aspect:0.88, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230827_205934724~2.jpg'), caption:'Every Detail, Considered', sub:'Design brief, brought to life' },
  { id:39, category:'Cakes', aspect:0.94, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230827_211616502~2.jpg'), caption:'Made by Hand, Made to Remember', sub:'Handpiped, hand-finished' },
  { id:40, category:'Cakes', aspect:0.83, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230908_131731668~2.jpg'), caption:'A Cake Built Around the Story', sub:'From the La Crème kitchen' },
  { id:41, category:'Cakes', aspect:0.92, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230908_133358960~2.jpg'), caption:'Celebration Cake, Custom Design', sub:'Custom flavors & finish, made to order' },
  { id:42, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230909_114116260~2.jpg'), caption:'Crafted for the Guest of Honor', sub:'Every cake tells a celebration\'s story' },
  { id:43, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230911_171147197~3.jpg'), caption:'A Sweet Centerpiece', sub:'Design brief, brought to life' },
  { id:44, category:'Cakes', aspect:0.67, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20230912_174349364~2.jpg'), caption:'Cake Design, Client Brief', sub:'Handpiped, hand-finished' },
  { id:45, category:'Cakes', aspect:0.9, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231001_174458726~2.jpg'), caption:'', sub:'' },
  { id:46, category:'Cakes', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231001_184025905~2.jpg'), caption:'', sub:'' },
  { id:49, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231008_203157136~3.jpg'), caption:'', sub:'' },
  { id:50, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231009_180022223~2.jpg'), caption:'', sub:'' },
  { id:51, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231013_203353401.jpg'), caption:'', sub:'' },
  { id:52, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231015_183849160~2.jpg'), caption:'', sub:'' },
  { id:53, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231017_165453371.jpg'), caption:'', sub:'' },
  { id:54, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231018_150348728.jpg'), caption:'', sub:'' },
  { id:55, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231031_210327169.jpg'), caption:'', sub:'' },
  { id:56, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231101_093353282.jpg'), caption:'', sub:'' },
  { id:57, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231106_180159725~2.jpg'), caption:'', sub:'' },
  { id:58, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231106_193942122.jpg'), caption:'', sub:'' },
  { id:59, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231108_134449992~2.jpg'), caption:'', sub:'' },
  { id:60, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231110_094010052.jpg'), caption:'', sub:'' },
  { id:62, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231111_112528493.jpg'), caption:'', sub:'' },
  { id:63, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231121_152910036.jpg'), caption:'', sub:'' },
  { id:64, category:'Cakes', aspect:0.93, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231125_011842460.jpg'), caption:'', sub:'' },
  { id:65, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231125_174811635.jpg'), caption:'', sub:'' },
  { id:66, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231204_122344145~4.jpg'), caption:'', sub:'' },
  { id:67, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20231221_183123151.jpg'), caption:'', sub:'' },
  { id:68, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240114_215042176.jpg'), caption:'', sub:'' },
  { id:69, category:'Cakes', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240116_185612073.jpg'), caption:'', sub:'' },
  { id:70, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240116_185852997.jpg'), caption:'', sub:'' },
  { id:71, category:'Cakes', aspect:0.88, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240120_130211238.jpg'), caption:'', sub:'' },
  { id:72, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240123_120635726.jpg'), caption:'', sub:'' },
  { id:73, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240206_114056008.jpg'), caption:'', sub:'' },
  { id:74, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240208_084431375.jpg'), caption:'', sub:'' },
  { id:75, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240208_092144991.jpg'), caption:'', sub:'' },
  { id:76, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240223_102046549.jpg'), caption:'', sub:'' },
  { id:77, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240223_104137029~2.jpg'), caption:'', sub:'' },
  { id:78, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240223_115700401~2.jpg'), caption:'', sub:'' },
  { id:79, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240226_134428223.jpg'), caption:'', sub:'' },
  { id:82, category:'Cakes', aspect:0.83, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240319_230953839~2.jpg'), caption:'', sub:'' },
  { id:83, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240320_143224607.jpg'), caption:'', sub:'' },
  { id:84, category:'Cakes', aspect:1.02, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240322_144554420~2.jpg'), caption:'', sub:'' },
  { id:85, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240322_183944728~2.jpg'), caption:'', sub:'' },
  { id:86, category:'Cakes', aspect:0.86, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240323_131603565~3.jpg'), caption:'', sub:'' },
  { id:87, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240323_233427784.jpg'), caption:'', sub:'' },
  { id:88, category:'Cakes', aspect:0.94, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240408_194622302.jpg'), caption:'', sub:'' },
  { id:89, category:'Cakes', aspect:1.11, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240409_204357917.jpg'), caption:'', sub:'' },
  { id:90, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240418_084747575~2.jpg'), caption:'', sub:'' },
  { id:91, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240425_225336754~2.jpg'), caption:'', sub:'' },
  { id:92, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240427_141703919.jpg'), caption:'', sub:'' },
  { id:93, category:'Cakes', aspect:0.74, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240427_141850697.jpg'), caption:'', sub:'' },
  { id:96, category:'Cakes', aspect:0.72, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240427_203201302.jpg'), caption:'', sub:'' },
  { id:97, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240430_104447775~2.jpg'), caption:'', sub:'' },
  { id:99, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240430_130218626~2.jpg'), caption:'', sub:'' },
  { id:100, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240501_210114000.jpg'), caption:'', sub:'' },
  { id:101, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240516_225022908.jpg'), caption:'', sub:'' },
  { id:102, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240516_225139430~2.jpg'), caption:'', sub:'' },
  { id:103, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240525_211014984~2.jpg'), caption:'', sub:'' },
  { id:104, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240527_222838556.jpg'), caption:'', sub:'' },
  { id:105, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240527_230548884.jpg'), caption:'', sub:'' },
  { id:107, category:'Cakes', aspect:0.89, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240531_223206032.jpg'), caption:'', sub:'' },
  { id:108, category:'Cakes', aspect:0.63, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240601_195013924.jpg'), caption:'', sub:'' },
  { id:109, category:'Cakes', aspect:0.88, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240606_233326051~2.jpg'), caption:'', sub:'' },
  { id:111, category:'Cakes', aspect:0.66, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_152259850.jpg'), caption:'', sub:'' },
  { id:112, category:'Cakes', aspect:1.39, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_173956521.jpg'), caption:'', sub:'' },
  { id:113, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_185800777.jpg'), caption:'', sub:'' },
  { id:114, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_203348676.jpg'), caption:'', sub:'' },
  { id:115, category:'Cakes', aspect:1.06, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_204331855.jpg'), caption:'', sub:'' },
  { id:116, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_210201077.jpg'), caption:'', sub:'' },
  { id:117, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240607_235300783.jpg'), caption:'', sub:'' },
  { id:120, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240609_154541015~3.jpg'), caption:'', sub:'' },
  { id:121, category:'Cakes', aspect:0.61, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240614_220655660~3.jpg'), caption:'', sub:'' },
  { id:122, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240618_134702771.jpg'), caption:'', sub:'' },
  { id:123, category:'Cakes', aspect:0.94, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240618_134733686~3.jpg'), caption:'', sub:'' },
  { id:124, category:'Cakes', aspect:0.72, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240627_234424769.jpg'), caption:'', sub:'' },
  { id:126, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240630_230418515~3.jpg'), caption:'', sub:'' },
  { id:127, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240710_123502813~2.jpg'), caption:'', sub:'' },
  { id:128, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240719_194247735~2.jpg'), caption:'', sub:'' },
  { id:130, category:'Cakes', aspect:0.58, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240722_184737913~3.jpg'), caption:'', sub:'' },
  { id:131, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240727_195822354~2.jpg'), caption:'', sub:'' },
  { id:132, category:'Cakes', aspect:0.9, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240727_200110011.jpg'), caption:'', sub:'' },
  { id:133, category:'Cakes', aspect:0.86, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240727_201054015.jpg'), caption:'', sub:'' },
  { id:134, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240819_223423512.jpg'), caption:'', sub:'' },
  { id:135, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240819_230219220.jpg'), caption:'', sub:'' },
  { id:136, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240821_211416424.jpg'), caption:'', sub:'' },
  { id:137, category:'Cakes', aspect:1.37, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240829_204627916.jpg'), caption:'', sub:'' },
  { id:138, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240831_173459098.jpg'), caption:'', sub:'' },
  { id:140, category:'Cakes', aspect:0.82, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240903_104242469.jpg'), caption:'', sub:'' },
  { id:141, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240904_175847749~2.jpg'), caption:'', sub:'' },
  { id:142, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240904_191937451~2.jpg'), caption:'', sub:'' },
  { id:144, category:'Cakes', aspect:1.19, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240905_192959702.jpg'), caption:'', sub:'' },
  { id:145, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240905_225827872~2.jpg'), caption:'', sub:'' },
  { id:148, category:'Cakes', aspect:1, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240909_223141370~2.jpg'), caption:'', sub:'' },
  { id:151, category:'Cakes', aspect:1.02, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_073857901~2.jpg'), caption:'', sub:'' },
  { id:152, category:'Cakes', aspect:1, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_154424766.jpg'), caption:'', sub:'' },
  { id:153, category:'Cakes', aspect:0.91, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_213850387~2.jpg'), caption:'', sub:'' },
  { id:154, category:'Cakes', aspect:1.04, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_214620724~2.jpg'), caption:'', sub:'' },
  { id:155, category:'Cakes', aspect:1, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_215408934~2.jpg'), caption:'', sub:'' },
  { id:156, category:'Cakes', aspect:0.87, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240912_220638090~2.jpg'), caption:'', sub:'' },
  { id:158, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20240919_180820600.jpg'), caption:'', sub:'' },
  { id:159, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241001_105445559.jpg'), caption:'', sub:'' },
  { id:160, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241010_133149786.jpg'), caption:'', sub:'' },
  { id:161, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241011_114644164.jpg'), caption:'', sub:'' },
  { id:162, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241014_193904884.jpg'), caption:'', sub:'' },
  { id:163, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241024_225224097.jpg'), caption:'', sub:'' },
  { id:164, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241028_231701736.jpg'), caption:'', sub:'' },
  { id:165, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241031_184305047~2.jpg'), caption:'', sub:'' },
  { id:167, category:'Cakes', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241109_191058335.jpg'), caption:'', sub:'' },
  { id:168, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241111_135525364.jpg'), caption:'', sub:'' },
  { id:169, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241113_182439956.jpg'), caption:'', sub:'' },
  { id:170, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241115_233245547.jpg'), caption:'', sub:'' },
  { id:171, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20241117_155045993.jpg'), caption:'', sub:'' },
  { id:172, category:'Cakes', aspect:0.63, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250117_224011061.jpg'), caption:'', sub:'' },
  { id:173, category:'Cakes', aspect:0.82, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250118_230538898.jpg'), caption:'', sub:'' },
  { id:174, category:'Cakes', aspect:0.97, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250120_174358608.jpg'), caption:'', sub:'' },
  { id:175, category:'Cakes', aspect:0.88, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250120_225314361.jpg'), caption:'', sub:'' },
  { id:176, category:'Cakes', aspect:0.87, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250123_173517063.jpg'), caption:'', sub:'' },
  { id:177, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250211_130000263.jpg'), caption:'', sub:'' },
  { id:178, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250214_084040892.jpg'), caption:'', sub:'' },
  { id:179, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250217_184423396.jpg'), caption:'', sub:'' },
  { id:180, category:'Cakes', aspect:0.67, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250217_215710272.jpg'), caption:'', sub:'' },
  { id:181, category:'Cakes', aspect:0.91, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250305_091918379.jpg'), caption:'', sub:'' },
  { id:182, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250306_140726708.jpg'), caption:'', sub:'' },
  { id:183, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250316_162212200.jpg'), caption:'', sub:'' },
  { id:184, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250317_101640635.jpg'), caption:'', sub:'' },
  { id:185, category:'Cakes', aspect:0.87, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250319_214733761.jpg'), caption:'', sub:'' },
  { id:186, category:'Cakes', aspect:0.66, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250319_221339521.jpg'), caption:'', sub:'' },
  { id:187, category:'Cakes', aspect:0.72, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250321_230103843.jpg'), caption:'', sub:'' },
  { id:188, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250325_184111736.jpg'), caption:'', sub:'' },
  { id:189, category:'Cakes', aspect:0.72, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250325_211049599.jpg'), caption:'', sub:'' },
  { id:190, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250325_211401006.jpg'), caption:'', sub:'' },
  { id:191, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250328_184725529.jpg'), caption:'', sub:'' },
  { id:192, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250401_224537275.jpg'), caption:'', sub:'' },
  { id:193, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250401_224537275~2.jpg'), caption:'', sub:'' },
  { id:194, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250419_203203479.jpg'), caption:'', sub:'' },
  { id:195, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250424_072606122.jpg'), caption:'', sub:'' },
  { id:196, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250505_122616830.jpg'), caption:'', sub:'' },
  { id:197, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250516_153022398.jpg'), caption:'', sub:'' },
  { id:198, category:'Cakes', aspect:0.73, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250524_111525780.jpg'), caption:'', sub:'' },
  { id:199, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250530_222800018.jpg'), caption:'', sub:'' },
  { id:200, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250531_110226380.jpg'), caption:'', sub:'' },
  { id:201, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250602_132346758.jpg'), caption:'', sub:'' },
  { id:202, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250602_192302871~2.jpg'), caption:'', sub:'' },
  { id:203, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250603_204706090.jpg'), caption:'', sub:'' },
  { id:205, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250605_075807032.jpg'), caption:'', sub:'' },
  { id:207, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_163448512.jpg'), caption:'', sub:'' },
  { id:208, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_163706254.jpg'), caption:'', sub:'' },
  { id:209, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_164528732.jpg'), caption:'', sub:'' },
  { id:210, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_164817879.jpg'), caption:'', sub:'' },
  { id:211, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_171251391.jpg'), caption:'', sub:'' },
  { id:212, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250607_215640126.jpg'), caption:'', sub:'' },
  { id:213, category:'Cakes', aspect:0.96, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250608_185325081.jpg'), caption:'', sub:'' },
  { id:214, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250610_183222039.jpg'), caption:'', sub:'' },
  { id:215, category:'Cakes', aspect:0.67, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250623_220925828.jpg'), caption:'', sub:'' },
  { id:216, category:'Cakes', aspect:0.83, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250702_144009671.jpg'), caption:'', sub:'' },
  { id:217, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250702_165646833.jpg'), caption:'', sub:'' },
  { id:218, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250707_162126673.jpg'), caption:'', sub:'' },
  { id:219, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250708_181539811.jpg'), caption:'', sub:'' },
  { id:220, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250709_091108311.jpg'), caption:'', sub:'' },
  { id:221, category:'Cakes', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250710_100712015.jpg'), caption:'', sub:'' },
  { id:222, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250716_223823848.jpg'), caption:'', sub:'' },
  { id:223, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250720_090505501~2.jpg'), caption:'', sub:'' },
  { id:224, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250729_174155717.jpg'), caption:'', sub:'' },
  { id:225, category:'Cakes', aspect:0.88, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250804_214909422.jpg'), caption:'', sub:'' },
  { id:226, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250804_215631147.jpg'), caption:'', sub:'' },
  { id:227, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250806_040024777.jpg'), caption:'', sub:'' },
  { id:228, category:'Cakes', aspect:0.81, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250807_201508771.jpg'), caption:'', sub:'' },
  { id:229, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250808_205249020.jpg'), caption:'', sub:'' },
  { id:230, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250809_192050060.jpg'), caption:'', sub:'' },
  { id:231, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250812_222631232.jpg'), caption:'', sub:'' },
  { id:232, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250821_081947679.jpg'), caption:'', sub:'' },
  { id:233, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250828_090813420.jpg'), caption:'', sub:'' },
  { id:234, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250831_235858641~2.jpg'), caption:'', sub:'' },
  { id:235, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250909_124713440.jpg'), caption:'', sub:'' },
  { id:236, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250909_182935722.jpg'), caption:'', sub:'' },
  { id:237, category:'Cakes', aspect:0.6, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250909_194937276~2.jpg'), caption:'', sub:'' },
  { id:238, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250910_174753610.jpg'), caption:'', sub:'' },
  { id:239, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250911_101135515.jpg'), caption:'', sub:'' },
  { id:241, category:'Cakes', aspect:0.82, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250912_190121566~2.jpg'), caption:'', sub:'' },
  { id:242, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250912_193701827.jpg'), caption:'', sub:'' },
  { id:244, category:'Cakes', aspect:0.74, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250914_215641026~2.jpg'), caption:'', sub:'' },
  { id:245, category:'Cakes', aspect:0.8, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250915_192156979~2.jpg'), caption:'', sub:'' },
  { id:246, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250916_230604866.jpg'), caption:'', sub:'' },
  { id:247, category:'Cakes', aspect:0.67, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250920_200759265.jpg'), caption:'', sub:'' },
  { id:248, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250922_214714542.jpg'), caption:'', sub:'' },
  { id:249, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250924_134653868.jpg'), caption:'', sub:'' },
  { id:250, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250924_134805945.jpg'), caption:'', sub:'' },
  { id:251, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250924_195655896~2.jpg'), caption:'', sub:'' },
  { id:252, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20250927_114155874.jpg'), caption:'', sub:'' },
  { id:253, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251003_131230775.jpg'), caption:'', sub:'' },
  { id:254, category:'Cakes', aspect:0.91, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251004_082501652~2.jpg'), caption:'', sub:'' },
  { id:255, category:'Cakes', aspect:0.67, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251006_144620574.jpg'), caption:'', sub:'' },
  { id:256, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251006_175326755.jpg'), caption:'', sub:'' },
  { id:257, category:'Cakes', aspect:0.94, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251021_144215611.jpg'), caption:'', sub:'' },
  { id:258, category:'Cakes', aspect:1.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251029_113501096.jpg'), caption:'', sub:'' },
  { id:260, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251030_103559710.jpg'), caption:'', sub:'' },
  { id:261, category:'Cakes', aspect:0.74, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251102_224406026.jpg'), caption:'', sub:'' },
  { id:262, category:'Cakes', aspect:1.27, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251102_224717434.jpg'), caption:'', sub:'' },
  { id:263, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251102_230406391.jpg'), caption:'', sub:'' },
  { id:264, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251102_230426906.jpg'), caption:'', sub:'' },
  { id:265, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251107_204912802.jpg'), caption:'', sub:'' },
  { id:266, category:'Cakes', aspect:0.68, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251107_233341685.jpg'), caption:'', sub:'' },
  { id:268, category:'Cakes', aspect:0.77, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251109_185752635.jpg'), caption:'', sub:'' },
  { id:269, category:'Cakes', aspect:0.63, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251111_215238835.jpg'), caption:'', sub:'' },
  { id:270, category:'Cakes', aspect:0.71, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251111_220726250.jpg'), caption:'', sub:'' },
  { id:271, category:'Cakes', aspect:0.62, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251111_223022393.jpg'), caption:'', sub:'' },
  { id:272, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251111_223627934~2.jpg'), caption:'', sub:'' },
  { id:273, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251111_224252052~2.jpg'), caption:'', sub:'' },
  { id:274, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251112_134511651.jpg'), caption:'', sub:'' },
  { id:275, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251113_104210605~2.jpg'), caption:'', sub:'' },
  { id:276, category:'Cakes', aspect:0.64, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251123_170225468.jpg'), caption:'', sub:'' },
  { id:277, category:'Cakes', aspect:0.84, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251124_144651440.jpg'), caption:'', sub:'' },
  { id:278, category:'Cakes', aspect:0.59, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251124_151744433.jpg'), caption:'', sub:'' },
  { id:279, category:'Cakes', aspect:0.7, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251124_152816883.jpg'), caption:'', sub:'' },
  { id:280, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251124_161244830.jpg'), caption:'', sub:'' },
  { id:281, category:'Cakes', aspect:0.86, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251124_193733353~2.jpg'), caption:'', sub:'' },
  { id:283, category:'Cakes', aspect:0.69, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251127_083608444~2.jpg'), caption:'', sub:'' },
  { id:284, category:'Cakes', aspect:0.9, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251201_214027373.jpg'), caption:'', sub:'' },
  { id:285, category:'Cakes', aspect:1.07, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251218_214420995.jpg'), caption:'', sub:'' },
  { id:286, category:'Cakes', aspect:0.97, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251218_214724347.jpg'), caption:'', sub:'' },
  { id:287, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251226_185516134.jpg'), caption:'', sub:'' },
  { id:288, category:'Cakes', aspect:1.46, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251229_155102182.jpg'), caption:'', sub:'' },
  { id:290, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20251229_194548172.jpg'), caption:'', sub:'' },
  { id:291, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260111_183926078.jpg'), caption:'', sub:'' },
  { id:292, category:'Cakes', aspect:0.76, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260116_100957094~2.jpg'), caption:'', sub:'' },
  { id:293, category:'Cakes', aspect:0.56, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260116_110627042.jpg'), caption:'', sub:'' },
  { id:294, category:'Cakes', aspect:0.79, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260116_195831983.jpg'), caption:'', sub:'' },
  { id:295, category:'Cakes', aspect:0.75, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260117_143302015.jpg'), caption:'', sub:'' },
  { id:298, category:'Cakes', aspect:0.78, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260307_203402729~2.jpg'), caption:'', sub:'' },
  { id:299, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260429_190513421.jpg'), caption:'', sub:'' },
  { id:300, category:'Cakes', aspect:0.85, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260520_183859026.jpg'), caption:'', sub:'' },
  { id:301, category:'Cakes', aspect:0.46, icon:ICONS.cake, tone:'', image:mediaUrl('img/offload/InShot_20260712_193120053.jpg'), caption:'', sub:'' },

  // — Catering & Events —
  { id:302, category:'Catering & Events', aspect:0.56, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20230916_082943699~3.jpg'), caption:'Catering for Every Occasion', sub:'Rice, proteins & sides for every event size' },
  { id:303, category:'Catering & Events', aspect:0.74, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20230920_163214120~2.jpg'), caption:'Bulk Catering, Freshly Prepared', sub:'Prepared fresh, delivered hot' },
  { id:304, category:'Catering & Events', aspect:1, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20230921_153427079.png'), caption:'Event Catering, On Time & On Point', sub:'From an intimate table to a full spread' },
  { id:305, category:'Catering & Events', aspect:0.86, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20231005_103233617~2.jpg'), caption:'Set Up for the Celebration', sub:'Rice, proteins & sides for every event size' },
  { id:306, category:'Catering & Events', aspect:1.33, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20231107_133622375.jpg'), caption:'Catering, Served Your Way', sub:'Prepared fresh, delivered hot' },
  { id:307, category:'Catering & Events', aspect:0.75, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20231119_155746249.jpg'), caption:'', sub:'' },
  { id:308, category:'Catering & Events', aspect:0.75, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20231128_175325401.jpg'), caption:'', sub:'' },
  { id:309, category:'Catering & Events', aspect:0.62, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20240118_110953185.jpg'), caption:'', sub:'' },
  { id:310, category:'Catering & Events', aspect:0.75, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20240118_111357746.jpg'), caption:'', sub:'' },
  { id:311, category:'Catering & Events', aspect:1.34, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20240617_193254053~2.jpg'), caption:'', sub:'' },
  { id:312, category:'Catering & Events', aspect:0.75, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20240617_194716840.jpg'), caption:'', sub:'' },
  { id:313, category:'Catering & Events', aspect:1.78, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20240909_224729543.jpg'), caption:'', sub:'' },
  { id:314, category:'Catering & Events', aspect:0.75, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20250421_020311446~2.jpg'), caption:'', sub:'' },
  { id:317, category:'Catering & Events', aspect:0.55, icon:ICONS.rice, tone:'', image:mediaUrl('img/offload/InShot_20250701_193529500.jpg'), caption:'', sub:'' },

  // — Finger Foods —
  { id:10, category:'Finger Foods', span2:true, aspect:1.55, icon:ICONS.platter, tone:'', image:mediaUrl('img/123520380_2807744082662300_1396207157575276742_n.jpg'), caption:'The Full Small Chops Platter', sub:'Spring rolls, samosas, drumettes & puff-puff' },
  { id:11, category:'Finger Foods', aspect:1.3, icon:ICONS.meat, tone:'tone-b', image:mediaUrl('img/123515735_2807744542662254_376565533110552828_n.jpg'), caption:'Boxed & Ready to Travel', sub:'Individually packed small chops trays' },
  { id:12, category:'Finger Foods', aspect:1.3, icon:ICONS.platter, tone:'tone-c', image:mediaUrl('img/123525387_2807744419328933_5693730396838484112_n.jpg'), caption:'Packed for Pickup', sub:'Small chops, prepped for a 100-guest order' },
  { id:13, category:'Finger Foods', aspect:1.3, icon:ICONS.meat, tone:'', image:mediaUrl('img/123589705_2807744209328954_7226536928879259652_n.jpg'), caption:'Ready for Cocktail Hour', sub:'Small chops trays, boxed and labeled' },
  { id:321, category:'Finger Foods', aspect:0.77, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230508_124339492~2.jpg'), caption:'Finger Foods for Every Guest List', sub:'Boxed and ready for pickup or delivery' },
  { id:322, category:'Finger Foods', aspect:1, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230818_153329649.jpg'), caption:'Packed Fresh, Ready to Serve', sub:'Perfect for cocktail hours & parties' },
  { id:323, category:'Finger Foods', aspect:1, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230819_160630324.jpg'), caption:'Cocktail Hour Favorites', sub:'Puff puff, spring rolls, samosas & more' },
  { id:324, category:'Finger Foods', aspect:0.75, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230819_161642147~2.jpg'), caption:'Small Chops, Freshly Fried', sub:'Boxed and ready for pickup or delivery' },
  { id:326, category:'Finger Foods', aspect:1.01, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230906_173529651~2.jpg'), caption:'', sub:'' },
  { id:327, category:'Finger Foods', aspect:1, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20230924_193517893.jpg'), caption:'', sub:'' },
  { id:328, category:'Finger Foods', aspect:0.77, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231013_195426186~2.jpg'), caption:'', sub:'' },
  { id:329, category:'Finger Foods', aspect:1.44, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231026_151247203~2.jpg'), caption:'', sub:'' },
  { id:330, category:'Finger Foods', aspect:0.75, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231124_070300127.jpg'), caption:'Small Chops, Party Ready', sub:'Boxed and ready for pickup or delivery' },
  { id:331, category:'Finger Foods', aspect:1.41, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231127_114053284.jpg'), caption:'', sub:'' },
  { id:332, category:'Finger Foods', aspect:0.97, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231127_134957194.jpg'), caption:'', sub:'' },
  { id:333, category:'Finger Foods', aspect:0.86, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231127_135327800.jpg'), caption:'', sub:'' },
  { id:334, category:'Finger Foods', aspect:1, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20231129_004648933.jpg'), caption:'', sub:'' },
  { id:336, category:'Finger Foods', aspect:1.01, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20240506_152755263~2.jpg'), caption:'', sub:'' },
  { id:337, category:'Finger Foods', aspect:1.23, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20240713_123310448.jpg'), caption:'', sub:'' },
  { id:338, category:'Finger Foods', aspect:1.44, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20240905_170426994~2.jpg'), caption:'', sub:'' },
  { id:339, category:'Finger Foods', aspect:1, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20240917_133956063~2.jpg'), caption:'', sub:'' },
  { id:340, category:'Finger Foods', aspect:0.75, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20241216_222040981.jpg'), caption:'', sub:'' },
  { id:341, category:'Finger Foods', aspect:1.12, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250111_123943467.jpg'), caption:'', sub:'' },
  { id:342, category:'Finger Foods', aspect:0.99, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250122_152045218.jpg'), caption:'', sub:'' },
  { id:343, category:'Finger Foods', aspect:0.81, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250122_152214144.jpg'), caption:'', sub:'' },
  { id:344, category:'Finger Foods', aspect:0.81, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250122_204548048.jpg'), caption:'', sub:'' },
  { id:345, category:'Finger Foods', aspect:0.8, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250123_103549493.jpg'), caption:'', sub:'' },
  { id:346, category:'Finger Foods', aspect:0.81, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250124_110916895.jpg'), caption:'', sub:'' },
  { id:347, category:'Finger Foods', aspect:0.81, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250210_143419624.jpg'), caption:'', sub:'' },
  { id:348, category:'Finger Foods', aspect:1.54, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250331_145807939.jpg'), caption:'', sub:'' },
  { id:349, category:'Finger Foods', aspect:0.97, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20250627_052411426.jpg'), caption:'', sub:'' },
  { id:350, category:'Finger Foods', aspect:0.56, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20251106_205315101.jpg'), caption:'', sub:'' },
  { id:352, category:'Finger Foods', aspect:0.95, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20260127_190647688.jpg'), caption:'', sub:'' },
  { id:353, category:'Finger Foods', aspect:1.02, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20260421_183320537.jpg'), caption:'', sub:'' },
  { id:355, category:'Finger Foods', aspect:0.75, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/InShot_20260520_185648015~2.jpg'), caption:'', sub:'' },
  { id:356, category:'Finger Foods', aspect:0.89, icon:ICONS.platter, tone:'', image:mediaUrl('img/offload/Screenshot_20200827-182930.png'), caption:'', sub:'' },

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
    // No `loading="lazy"` here: these tiles are absolutely positioned
    // and sized a frame later (by layoutBlock, via requestAnimationFrame),
    // so at insertion time the browser sees a 0x0 element and its native
    // lazy-load heuristic never reconsiders it once resized — the tile
    // never loads. The batched infinite-scroll (see loadMore()) already
    // keeps unseen images from being requested, so eager-loading each
    // batch's own images once it's created is fine.
    ? `<img src="${item.image}" alt="${item.caption}">`
    : `<div class="ring"></div>${item.icon}`;
  el.appendChild(media);
  if(item.image) bindMediaSkeleton(media, media.querySelector('img'));

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
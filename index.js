/* ============================================================
   CONFIG, waLink(), openWhatsApp(), fmtNaira(), R2_BASE_URL,
   mediaUrl(), escapeHtml(), isValidPhone() now live in config.js
   (loaded before this file) — single source of truth for both
   index.html and gallery.html.
============================================================ */

const aboutPhotoEl = document.getElementById('aboutPhoto');
bindMediaSkeleton(aboutPhotoEl.closest('.media-frame'), aboutPhotoEl);
aboutPhotoEl.src = mediaUrl('img/503736309_9061189193984393_2635635431881218558_n.jpg');

/* ============================================================
   NEWS / PROMOTIONS — shared data for the scrolling ticker and
   the auto-dismiss popup. Add a new object here any time there's
   something to announce — both the ticker and the popup pick from
   this list automatically and shuffle the order, so it's not
   always the same item shown first.
============================================================ */
const NEWS_ITEMS = [
  {
    tag: 'New Arrival',
    title: 'Cake Slices',
    price: '₦4,000 / slice',
    blurb: 'Delicious cake slices for any occasion, now on the Finger Foods menu.',
    images: [
      mediaUrl('img/cakeslice1-sm.jpg'),
      mediaUrl('img/cakeslice2-sm.jpg'),
    ],
    ctaHref: 'index.html#finger-foods', // ticker click-through; works from both index.html and gallery.html
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

// Generic WhatsApp buttons (nav, hero, contact)
const genericWaMessage = `Hello ${CONFIG.businessName}! I'd like to enquire about your cakes and catering services.`;
['navWaBtn','heroWaBtn','contactWaBtn','contactWaIcon'].forEach(id=>{
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

// Scrolls a field (or field-group container, e.g. a chip-row) into
// view and rings it briefly, so a validation failure always points
// at exactly what needs fixing rather than just toasting about it.
function flagInvalidField(el){
  if(!el) return;
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  if(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement){
    el.focus({ preventScroll:true });
  }
  el.classList.add('field-invalid');
  const clear = ()=> el.classList.remove('field-invalid');
  el.addEventListener('input', clear, { once:true });
  el.addEventListener('change', clear, { once:true });
  el.addEventListener('click', clear, { once:true });
  setTimeout(clear, 2500);
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
// Brand text shows alone while the "what would you like today?" hero
// question is on screen; once the user scrolls past it, the brand
// swaps out for the Gallery/Cakes/Catering links (see .nav.past-hero
// in index.css).
const heroSection = document.getElementById('home');
const heroObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=> siteNav.classList.toggle('past-hero', !entry.isIntersecting));
}, { threshold: 0 });
heroObserver.observe(heroSection);

// Highlights the matching nav link (Cakes/Catering) while its section
// is centered in the viewport, so the navbar tracks where the user is
// as they scroll.
const navSectionLinks = [
  { section: document.getElementById('cakes'), link: document.querySelector('#navLinks a[href="#cakes"]') },
  { section: document.getElementById('catering'), link: document.querySelector('#navLinks a[href="#catering"]') },
];
const navSectionObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const match = navSectionLinks.find(item=> item.section === entry.target);
    if(match) match.link.classList.toggle('active', entry.isIntersecting);
  });
}, { threshold: 0, rootMargin: '-50% 0px -50% 0px' });
navSectionLinks.forEach(item=> navSectionObserver.observe(item.section));

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
   ICONS (small inline set reused for placeholders & menu items)
============================================================ */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="20" height="20"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.44 1.33 4.93L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2z"/></svg>'
};

/* ============================================================
   VIDEO REEL — behind-the-scenes clips (silent, autoplay while
   in view). Add a real video by setting `video: mediaUrl('videos/
   your-clip.mp4')` — the play placeholder is swapped automatically.
============================================================ */
const videoTestimonials = [
  { name: 'Dessert Table Detail', video: mediaUrl('videos/InShot_20260612_184349227-sm.mp4'), poster: mediaUrl('videos/InShot_20260612_184349227-poster.jpg'), tone:'' },
  { name: '12inch Cake Reveal', video: mediaUrl('videos/InShot_20251207_154703112-sm.mp4'), poster: mediaUrl('videos/InShot_20251207_154703112-poster.jpg'), tone:'tone-b' },
  { name: 'Wedding Day Moment', video: mediaUrl('videos/InShot_20251122_180814090-sm.mp4'), poster: mediaUrl('videos/InShot_20251122_180814090-poster.jpg'), tone:'tone-c' },
  { name: 'Lunchpack Preparation', video: mediaUrl('videos/InShot_20251122_201354636-sm.mp4'), poster: mediaUrl('videos/InShot_20251122_201354636-poster.jpg'), tone:'' },
];
const videoReel = document.getElementById('videoReel');
videoTestimonials.forEach(v=>{
  const el = document.createElement('div');
  el.className = `media-frame reel-item ${v.tone}`;
  el.innerHTML = v.video
    ? `<video src="${v.video}"${v.poster ? ` poster="${v.poster}"` : ''} muted loop playsinline preload="auto"></video><div class="cap"><span class="who">${v.name}</span></div>`
    : `<div class="ring"></div><span class="play-badge">${ICONS.play}</span><div class="cap">${v.name}</div>`;
  videoReel.appendChild(el);
  const reelVid = el.querySelector('video');
  if(reelVid) bindMediaSkeleton(el, reelVid);
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
  { quote: 'The cake didn\'t just look expensive, it tasted like it too. Guests kept asking who made it.', name:'Ifeoma A.', event:'Wedding Reception, Lekki' },
  { quote: 'We ordered small chops for 150 guests and everything arrived hot, on time, beautifully packed.', name:'Tunde O.', event:'Corporate Launch' },
];
const testimonialGrid = document.getElementById('testimonialGrid');
// .t-grid defaults to 3 columns (shared with gallery.html's larger
// set) — with just 2 cards here that leaves a lopsided empty column,
// so scope a centered 2-up layout via a modifier class instead of
// touching the shared rule.
testimonialGrid.classList.toggle('t-grid--pair', testimonials.length === 2);
testimonials.forEach(t=>{
  const el = document.createElement('div');
  el.className = 't-card';
  el.innerHTML = `<span class="quote-mark">&ldquo;</span><p>${t.quote}</p>
    <div class="who"><div><div class="name">${t.name}</div><div class="event">${t.event}</div></div></div>`;
  testimonialGrid.appendChild(el);
});

/* ============================================================
   ORDER DATE RESTRICTION — every "Date Needed" field on the site
   requires at least a 1-day lead time (so choosing on a Monday, the
   earliest pickable date is Tuesday), enforced both as the native
   date-picker's min (blocks selecting an earlier date in the UI) and
   as an explicit JS check at submit time (covers keyboard-typed
   dates a picker's min doesn't always catch). Uses local
   year/month/day rather than toISOString(), which is UTC-based and
   can land on the wrong calendar day depending on the visitor's
   timezone offset.
============================================================ */
const MIN_ORDER_LEAD_DAYS = 1;
function minOrderDate(daysAhead = MIN_ORDER_LEAD_DAYS){
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
document.getElementById('cakeDate').min = minOrderDate();
document.getElementById('checkoutDate').min = minOrderDate();

/* ============================================================
   CAKE DESIGN GALLERY MODAL — "Cakes"-category photos, filtered
   out of GALLERY_ITEMS (gallery-data.js, shared with gallery.html
   so nothing is duplicated). Renders in batches with the same
   lazy-load pattern as the real gallery, appended as the user
   scrolls the modal itself close to its bottom.
============================================================ */
const cakeGalleryItems = GALLERY_ITEMS.filter(item => item.category === 'Cakes');
const CGM_BATCH_SIZE = 24;
let cgmRendered = 0;

const cgmImageObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    const img = entry.target;
    img.src = img.dataset.src;
    delete img.dataset.src;
    cgmImageObserver.unobserve(img);
  });
}, { rootMargin: '400px 0px' });

const cgmGrid = document.getElementById('cgmGrid');
const cgmSentinel = document.getElementById('cgmSentinel');

function cgmLoadMore(){
  const next = cakeGalleryItems.slice(cgmRendered, cgmRendered + CGM_BATCH_SIZE);
  next.forEach(item=>{
    const tile = document.createElement('div');
    tile.className = 'cgm-tile';
    tile.innerHTML = `<div class="media-frame"><img data-src="${item.image}" alt="${item.caption || 'Cake design'}"></div>`;
    cgmGrid.appendChild(tile);
    const media = tile.querySelector('.media-frame');
    const img = tile.querySelector('img');
    bindMediaSkeleton(media, img);
    cgmImageObserver.observe(img);
  });
  cgmRendered += next.length;
}

const cgmScrollObserver = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting && cgmRendered < cakeGalleryItems.length) cgmLoadMore();
  });
}, { rootMargin: '300px 0px' });
cgmScrollObserver.observe(cgmSentinel);

const cakeGalleryModal = document.getElementById('cakeGalleryModal');
document.getElementById('cakeGalleryOpenBtn').addEventListener('click', ()=>{
  if(!cgmRendered) cgmLoadMore();
  openModal(cakeGalleryModal);
});
document.getElementById('cakeGalleryClose').addEventListener('click', ()=> closeModal(cakeGalleryModal));
document.getElementById('cakeGalleryBackdrop').addEventListener('click', ()=> closeModal(cakeGalleryModal));
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && cakeGalleryModal.classList.contains('open')) closeModal(cakeGalleryModal); });

// Which layer counts are available for each cake size (inches).
const INCH_LAYER_OPTIONS = { '6': [3], '8': [3, 4, 5], '10': [3, 4, 5], '12': [3], '14': [3] };
const CAKE_INCHES = ['6', '8', '10', '12', '14'];

const tierSelectEl = document.getElementById('tierSelect');
const tierConfigEl = document.getElementById('tierConfig');
const tierOpt4 = document.getElementById('tierOpt4');
const tierOpt5plus = document.getElementById('tierOpt5plus');
const tierOptCustom = document.getElementById('tierOptCustom');
const tierCustomCheckbox = document.getElementById('tierCustomCheckbox');
const tierCustomField = document.getElementById('tierCustomField');
const tierCustomCount = document.getElementById('tierCustomCount');
const birthdayTierNote = document.getElementById('birthdayTierNote');
const cakeOccasionEl = document.getElementById('cakeOccasion');
const MAX_CUSTOM_TIERS = 20;

function buildTierRow(index){
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.dataset.index = index;
  row.innerHTML = `
    <span class="tier-row-label">${index} Tier/ Step</span>
    <div class="field">
      <label for="tierInches-${index}">Inches</label>
      <select id="tierInches-${index}" class="tier-inches">
        <option value="">Select inches</option>
        ${CAKE_INCHES.map(i=> `<option value="${i}">${i}"</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="tierLayers-${index}">Layers</label>
      <select id="tierLayers-${index}" class="tier-layers" disabled>
        <option value="">Select inches first</option>
      </select>
    </div>`;
  const inchesSel = row.querySelector('.tier-inches');
  const layersSel = row.querySelector('.tier-layers');
  inchesSel.addEventListener('change', ()=>{
    const opts = INCH_LAYER_OPTIONS[inchesSel.value] || [];
    layersSel.disabled = !opts.length;
    layersSel.innerHTML = opts.length
      ? `<option value="">Select layers</option>` + opts.map(l=> `<option value="${l}">${l} Layers</option>`).join('')
      : `<option value="">Select inches first</option>`;
  });
  return row;
}

// Inserts a single tier's row in numeric order without touching the
// others, so inches/layers already picked for other selected tiers
// survive regardless of click order.
function addTierRow(tierNumber){
  if(tierConfigEl.querySelector(`.tier-row[data-index="${tierNumber}"]`)) return;
  const row = buildTierRow(tierNumber);
  const existingRows = Array.from(tierConfigEl.querySelectorAll('.tier-row'));
  const nextRow = existingRows.find(r=> Number(r.dataset.index) > tierNumber);
  if(nextRow) tierConfigEl.insertBefore(row, nextRow);
  else tierConfigEl.appendChild(row);
}
function removeTierRow(tierNumber){
  const row = tierConfigEl.querySelector(`.tier-row[data-index="${tierNumber}"]`);
  if(row) row.remove();
}

// The full set of tier numbers that should currently have a row —
// one per checked preset (1/2/3/4/5+). Custom deliberately never
// contributes a row: it's for orders too open-ended to spec inches/
// layers for up front, so it only collects a tier/step count and
// gets flagged as a custom order in the WhatsApp message instead
// (see formatCakeLines()).
function getDesiredTierNumbers(){
  const numbers = new Set();
  tierSelectEl.querySelectorAll('.tier-option input[data-count]:checked').forEach(input=>{
    numbers.add(Number(input.dataset.count));
  });
  return numbers;
}

// Reconciles rendered tier-rows with the desired set — removes rows no
// longer wanted by anything, adds rows newly wanted, and leaves the rest
// (and whatever inches/layers were already picked in them) untouched.
function syncTierRows(){
  const desired = getDesiredTierNumbers();
  Array.from(tierConfigEl.querySelectorAll('.tier-row')).forEach(row=>{
    if(!desired.has(Number(row.dataset.index))) row.remove();
  });
  Array.from(desired).sort((a,b)=> a - b).forEach(n=> addTierRow(n));
}

function updateTierAvailability(){
  const isBirthday = cakeOccasionEl.value === 'Birthday';
  birthdayTierNote.style.display = isBirthday ? 'block' : 'none';
  [tierOpt4, tierOpt5plus, tierOptCustom].forEach(opt=>{
    const input = opt.querySelector('input');
    opt.classList.toggle('tier-option--disabled', isBirthday);
    input.disabled = isBirthday;
    if(isBirthday && input.checked){
      input.checked = false;
      opt.classList.remove('selected');
      if(input === tierCustomCheckbox){
        tierCustomField.style.display = 'none';
        tierCustomCount.value = '';
      }
    }
  });
  syncTierRows();
}
cakeOccasionEl.addEventListener('change', updateTierAvailability);

tierSelectEl.querySelectorAll('.tier-option input[data-count]').forEach(input=>{
  input.addEventListener('change', ()=>{
    input.closest('.tier-option').classList.toggle('selected', input.checked);
    syncTierRows();
  });
});

tierCustomCheckbox.addEventListener('change', ()=>{
  tierOptCustom.classList.toggle('selected', tierCustomCheckbox.checked);
  tierCustomField.style.display = tierCustomCheckbox.checked ? 'block' : 'none';
  if(!tierCustomCheckbox.checked) tierCustomCount.value = '';
  syncTierRows();
});
tierCustomCount.addEventListener('input', syncTierRows);

const cakeDeliveryAddressField = document.getElementById('cakeDeliveryAddressField');
const cakeDeliveryAddressInput = document.getElementById('cakeDeliveryAddress');
let cakeDelivery = '';
document.querySelectorAll('#cakeDelivery .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#cakeDelivery .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    cakeDelivery = c.dataset.value;
    const needsAddress = cakeDelivery === 'Delivery';
    cakeDeliveryAddressField.style.display = needsAddress ? 'block' : 'none';
    if(!needsAddress) cakeDeliveryAddressInput.value = '';
  });
});

/* ============================================================
   CAKE CART — lets one order cover more than one cake. "Add Another
   Cake" validates and saves just the cake-specific fields (occasion
   through design) into cakeCart and clears them for a fresh cake;
   the shared fields below (delivery, name, phone) are deliberately
   left untouched since they're the same customer/order either way.
   "Checkout Now" folds whatever's currently in the form in too (if
   it's been touched), then sends every cake in cakeCart as one
   WhatsApp message.
============================================================ */
let cakeCart = [];
let cakeIdCounter = 0;

function cakeFormHasContent(){
  return !!(
    cakeOccasionEl.value ||
    document.querySelectorAll('#tierSelect input:checked').length ||
    document.getElementById('cakeDate').value ||
    document.getElementById('cakeFlavor').value
  );
}

// Validates and reads back just the per-cake fields — returns null
// (after toasting the problem) if anything required is missing.
function validateCakeFields(){
  const occasion = cakeOccasionEl.value;
  const tierInputs = Array.from(document.querySelectorAll('#tierSelect input:checked'));
  const dateEl = document.getElementById('cakeDate');
  const date = dateEl.value;
  const flavorEl = document.getElementById('cakeFlavor');
  const flavor = flavorEl.value;
  const finish = document.getElementById('cakeFinish').value;
  const inscription = document.getElementById('cakeInscription').value;
  const design = document.getElementById('cakeDesign').value;

  if(!occasion){
    showToast('Please select an occasion.');
    flagInvalidField(cakeOccasionEl);
    return null;
  }
  if(!tierInputs.length){
    showToast('Please choose at least one tier/step size.');
    flagInvalidField(tierSelectEl);
    return null;
  }
  if(!date){
    showToast('Please choose a date needed.');
    flagInvalidField(dateEl);
    return null;
  }
  if(!flavor){
    showToast('Please choose a cake flavor.');
    flagInvalidField(flavorEl);
    return null;
  }
  if(date < minOrderDate()){
    showToast(`We need at least ${MIN_ORDER_LEAD_DAYS} days' notice — please pick a date from ${minOrderDate()} onward.`);
    flagInvalidField(dateEl);
    return null;
  }
  const isCustom = tierCustomCheckbox.checked;
  const customCount = Math.floor(Number(tierCustomCount.value)) || 0;
  if(isCustom && !(customCount > 0)){
    showToast('Please type how many tiers/steps for your custom option.');
    flagInvalidField(tierCustomCount);
    return null;
  }
  if(isCustom && customCount > MAX_CUSTOM_TIERS){
    showToast(`Custom orders top out at ${MAX_CUSTOM_TIERS} tiers/steps here — message us directly for anything bigger.`);
    flagInvalidField(tierCustomCount);
    return null;
  }

  const tierDetails = [];
  const tierRows = tierConfigEl.querySelectorAll('.tier-row');
  for(const row of tierRows){
    const inchesEl = row.querySelector('.tier-inches');
    const layersEl = row.querySelector('.tier-layers');
    if(!inchesEl.value || !layersEl.value){
      showToast('Please select inches and layers for every tier.');
      flagInvalidField(inchesEl.value ? layersEl : inchesEl);
      return null;
    }
    tierDetails.push(`Tier ${row.dataset.index}: ${inchesEl.value}" — ${layersEl.value} layers`);
  }

  const tiersLabel = tierInputs.map(i=> i === tierCustomCheckbox ? `Custom (${customCount} Tiers/Steps)` : i.value).join(', ');

  return { id: ++cakeIdCounter, occasion, tiersLabel, tierDetails, isCustom, customCount, date, flavor, finish, inscription, design };
}

function resetCakeFields(){
  cakeOccasionEl.value = '';
  document.querySelectorAll('#tierSelect input[type="checkbox"]').forEach(inp=>{
    inp.checked = false;
    inp.closest('.tier-option').classList.remove('selected');
  });
  tierCustomField.style.display = 'none';
  tierCustomCount.value = '';
  tierConfigEl.innerHTML = '';
  document.getElementById('cakeDate').value = '';
  document.getElementById('cakeFlavor').value = '';
  document.getElementById('cakeFinish').value = '';
  document.getElementById('cakeInscription').value = '';
  document.getElementById('cakeDesign').value = '';
  updateTierAvailability();
}

/* ============================================================
   WHATSAPP MESSAGE FORMATTING

   A wa.me link carries the whole order in its URL, and encoding
   roughly doubles its length — so a big order (a dozen cakes, each
   with free-typed design notes) can grow past what WhatsApp clients
   reliably accept, and the message silently arrives truncated.

   Every message is therefore built at a detail level, and dropped to
   the next level down until it fits: 'full' (everything), 'brief'
   (drops per-tier sizing and the free-text fields), then 'summary'
   (one line per cake). The order number is in the message either way,
   and the untrimmed order is in the order sheet, so nothing is ever
   actually lost — only the WhatsApp copy gets shorter.
============================================================ */
// Measured on the URL-encoded message, since that's what the wa.me link
// actually carries: ₦, × and — expand to 6-9 characters each once encoded,
// so a message that looks short can still make a very long link.
const WA_MAX_ENCODED_CHARS = 1900;
const WA_DETAIL_LEVELS = ['full', 'brief', 'summary'];

function trimText(str, max){
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

// Calls buildLines(detail) at successively lower detail levels and
// returns the first message that fits (or the shortest one if none do).
function fitWhatsAppMessage(buildLines){
  let message = '';
  for(const detail of WA_DETAIL_LEVELS){
    message = buildLines(detail).filter(l=> l !== null && l !== undefined).join('\n');
    if(encodeURIComponent(message).length <= WA_MAX_ENCODED_CHARS) break;
  }
  return message;
}

function formatCakeLines(cake, index, total, detail){
  const label = total > 1 ? `*Cake ${index + 1}*` : `*Cake*`;
  if(detail === 'summary'){
    return [`${label} — ${cake.occasion}, ${cake.tiersLabel}, ${cake.date}, ${cake.flavor}`];
  }
  return [
    label,
    `Occasion: ${cake.occasion}`,
    `Tiers/Steps: ${cake.tiersLabel}`,
    ...(detail === 'full' ? cake.tierDetails.map(t=> `   ${t}`) : []),
    cake.isCustom ? `CUSTOM ORDER (${cake.customCount} tiers/steps) — confirm sizing, design and price directly` : null,
    `Date: ${cake.date}`,
    `Flavor: ${cake.flavor}`,
    detail === 'full' && cake.finish ? `Finish: ${cake.finish}` : null,
    detail === 'full' && cake.inscription ? `Inscription: ${trimText(cake.inscription, 120)}` : null,
    detail === 'full' && cake.design ? `Design: ${trimText(cake.design, 200)}` : null,
  ].filter(Boolean);
}

document.getElementById('cakeAddAnotherBtn').addEventListener('click', ()=>{
  const cake = validateCakeFields();
  if(!cake) return;
  cakeCart.push(cake);
  resetCakeFields();
  refreshCartUI();
  showToast(`Cake added to your order (${cakeCart.length} so far), add another or check out when ready.`);
});

// Validates and sends the queued cake(s) via WhatsApp — shared by the
// Cakes section's own "Checkout Now" button and by the nav cart's
// "Checkout All", which falls through to this when the cart holds
// only cakes (cakes have no fixed price, so the generic FF/Catering
// checkout modal can't handle them — see CART_SOURCES.cake above).
function finalizeCakeOrder(){
  // Fold the current form into the cart too, unless it's untouched
  // and there's already at least one cake queued up — in that case
  // this click is purely "I'm done, check out" for what's already
  // been added via "Add Another Cake".
  if(cakeFormHasContent() || cakeCart.length === 0){
    const cake = validateCakeFields();
    if(!cake) return;
    cakeCart.push(cake);
    resetCakeFields();
    refreshCartUI();
  }

  const nameEl = document.getElementById('cakeName');
  const phoneEl = document.getElementById('cakePhone');
  const name = nameEl.value;
  const phone = phoneEl.value;
  const deliveryAddress = cakeDeliveryAddressInput.value.trim();

  if(!cakeDelivery){
    showToast('Please choose a delivery method.');
    flagInvalidField(document.getElementById('cakeDelivery'));
    return;
  }
  if(!name){
    showToast('Please enter your name.');
    flagInvalidField(nameEl);
    return;
  }
  if(!phone){
    showToast('Please enter your WhatsApp number.');
    flagInvalidField(phoneEl);
    return;
  }
  if(!isValidPhone(phone)){
    showToast('Please enter a valid WhatsApp number.');
    flagInvalidField(phoneEl);
    return;
  }
  if(cakeDelivery === 'Delivery' && !deliveryAddress){
    showToast('Please add your delivery location.');
    flagInvalidField(cakeDeliveryAddressInput);
    return;
  }

  const orderNo = generateOrderNumber(name);

  const message = fitWhatsAppMessage((detail)=> [
    `*CAKE ORDER*`,
    `No. ${orderNo}`,
    ``,
    ...cakeCart.flatMap((cake, i, arr)=> [...formatCakeLines(cake, i, arr.length, detail), ``]),
    `${cakeDelivery}${deliveryAddress ? `, ${deliveryAddress}` : ''}`,
    ``,
    `${name}, ${phone}`,
  ]);

  logOrder({
    orderNumber: orderNo,
    orderType: 'Cake',
    name, phone,
    delivery: cakeDelivery,
    address: deliveryAddress,
    dateNeeded: cakeCart.map(c=> c.date).join(' | '),
    items: cakeCart.map(c=> [
      `${c.occasion} cake, ${c.tiersLabel}, ${c.flavor}, needed ${c.date}`,
      c.tierDetails.length ? `sizes: ${c.tierDetails.join('; ')}` : '',
      c.isCustom ? `CUSTOM ORDER (${c.customCount} tiers/steps)` : '',
      c.finish ? `finish: ${c.finish}` : '',
      c.inscription ? `inscription: ${c.inscription}` : '',
      c.design ? `design: ${c.design}` : ''
    ].filter(Boolean).join(' | ')).join('\n'),
    total: '',
    notes: ''
  });

  const opened = openWhatsApp(message);
  showToast(opened
    ? `Opening WhatsApp — your order no. is ${orderNo}`
    : `Order no. ${orderNo} — taking you to WhatsApp…`);
  cakeCart = [];
  refreshCartUI();
}

document.getElementById('cakeForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  finalizeCakeOrder();
});

/* ============================================================
   FINGER FOOD MENU — data-driven
   Small Chops and Chin Chin are cascading composites: the item
   shows just its option buttons by default, and a quantity
   stepper only appears once a specific variant is chosen. Meat
   Pie and Cake Slices are simple always-visible qty-stepper rows.
============================================================ */
const CAKE_SLICE_FLAVOURS = ['Red Velvet', 'Chocolate', 'Vanilla', 'Cookies & Cream', 'Triple Delight'];

const SMALL_CHOPS_VARIANTS = [
  { id:'sc-plate-standard', type:'Plate', style:'Standard', name:'Small Chops — Plate (Standard)', unit:'plate', price:2500, contents:'1 Spring roll, 1 Samosa, 5 puff-puff & 1 chicken' },
  { id:'sc-plate-classic', type:'Plate', style:'Classic', name:'Small Chops — Plate (Classic)', unit:'plate', price:4000, contents:'2 Spring rolls, 2 Samosa, 10 puff-puff & 1 chicken' },
  { id:'sc-tray-standard', type:'Tray', style:'Standard', name:'Small Chops — Tray (Standard)', unit:'tray', price:13000, contents:'5 Spring rolls, 5 Samosa, 25 puff-puff & 5 chicken' },
  { id:'sc-tray-classic', type:'Tray', style:'Classic', name:'Small Chops — Tray (Classic)', unit:'tray', price:25000, contents:'10 Spring rolls, 10 Samosa, 50 puff-puff & 10 chicken' },
];
const CHIN_CHIN_VARIANTS = [
  { id:'cc-standard', name:'Chin Chin — Standard Pack', unit:'1 litre pack', price:2000 },
  { id:'cc-bucket', name:'Chin Chin — Bucket', unit:'bucket', price:15000 },
];
const fingerFoodMenu = [
  { id:'meat-pie', name:'Meat Pie', desc:'Buttery pastry, seasoned minced meat', unit:'pack of 12', price:1000 },
  { id:'cake-slices', name:'Cake Slices', desc:'Delicious cake slices for any occasion', unit:'slice', price:3500, needsFlavour:true },
];
const ALL_FF_ITEMS = [...SMALL_CHOPS_VARIANTS, ...CHIN_CHIN_VARIANTS, ...fingerFoodMenu];

const ffState = {};
const ffFlavours = {};
const ffWidgets = [];
ALL_FF_ITEMS.forEach(item=>{ ffState[item.id] = 0; });

const fingerFoodList = document.getElementById('fingerFoodList');

/* Small Chops: Plate/Tray -> Style -> Qty */
function buildSmallChopsItem(){
  const wrap = document.createElement('div');
  wrap.className = 'menu-item has-extra';
  wrap.innerHTML = `
    <div class="m-top">
      <div class="m-body">
        <h4>Small Chops</h4>
        <p>Puff puff, spring rolls, samosa & sausage rolls, choose plate or tray</p>
      </div>
    </div>
    <div class="m-extra sc-picker-row">
      <div data-role="type-block">
        <span class="m-extra-label">Plate or Tray?</span>
        <div class="liter-chips" data-role="type">
          <button type="button" class="liter-chip" data-value="Plate">Plate</button>
          <button type="button" class="liter-chip" data-value="Tray">Tray</button>
        </div>
      </div>
      <div data-role="style-wrap" style="display:none;">
        <span class="m-extra-label">Style</span>
        <div class="liter-chips" data-role="style"></div>
        <p class="form-note sc-note" data-role="note" style="display:none;"></p>
      </div>
    </div>
    <div class="m-extra" data-role="qty-wrap" style="display:none;">
      <div class="m-qty-row">
        <div class="m-price" data-role="price"></div>
        <div class="qty-with-label"><span class="qty-label">Quantity</span><div class="qty-control">
          <button type="button" aria-label="Decrease" data-act="dec">−</button>
          <span class="qty-val" data-role="qty-val">0</span>
          <button type="button" aria-label="Increase" data-act="inc">+</button>
        </div></div>
      </div>
    </div>`;

  const typeWrap = wrap.querySelector('[data-role="type"]');
  const styleWrap = wrap.querySelector('[data-role="style-wrap"]');
  const styleChipsEl = wrap.querySelector('[data-role="style"]');
  const noteEl = wrap.querySelector('[data-role="note"]');
  const qtyWrap = wrap.querySelector('[data-role="qty-wrap"]');
  const qtyVal = wrap.querySelector('[data-role="qty-val"]');
  const priceEl = wrap.querySelector('[data-role="price"]');
  let currentVariant = null;

  function selectVariant(variant){
    currentVariant = variant;
    priceEl.textContent = `${fmtNaira(variant.price)} / ${variant.unit}`;
    qtyVal.textContent = ffState[variant.id];
    qtyWrap.style.display = 'block';
    noteEl.textContent = `Contains: ${variant.contents}`;
    noteEl.style.display = 'block';
  }

  typeWrap.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      typeWrap.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      chip.classList.add('selected');
      currentVariant = null;
      qtyWrap.style.display = 'none';
      noteEl.style.display = 'none';
      const variants = SMALL_CHOPS_VARIANTS.filter(v=> v.type === chip.dataset.value);
      styleChipsEl.innerHTML = variants.map(v=> `<button type="button" class="liter-chip" data-id="${v.id}">${v.style}</button>`).join('');
      styleChipsEl.querySelectorAll('.liter-chip').forEach(sc=>{
        sc.addEventListener('click', ()=>{
          styleChipsEl.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
          sc.classList.add('selected');
          selectVariant(variants.find(v=> v.id === sc.dataset.id));
        });
      });
      styleWrap.style.display = 'block';
    });
  });

  wrap.querySelector('[data-act="dec"]').addEventListener('click', ()=>{
    if(currentVariant && ffState[currentVariant.id] > 0){ ffState[currentVariant.id]--; renderFF(); }
  });
  wrap.querySelector('[data-act="inc"]').addEventListener('click', ()=>{
    if(currentVariant){ ffState[currentVariant.id]++; renderFF(); }
  });

  wrap.syncQty = ()=>{ if(currentVariant) qtyVal.textContent = ffState[currentVariant.id]; };
  wrap.restoreSelection = ()=>{
    const v = SMALL_CHOPS_VARIANTS.find(x=> ffState[x.id] > 0);
    if(!v) return;
    typeWrap.querySelector('[data-value="' + v.type + '"]').click();
    styleChipsEl.querySelector('[data-id="' + v.id + '"]').click();
  };
  return wrap;
}

/* Chin Chin: option buttons -> Qty */
function buildChinChinItem(){
  const wrap = document.createElement('div');
  wrap.className = 'menu-item has-extra';
  wrap.innerHTML = `
    <div class="m-top">
      <div class="m-body">
        <h4>Chin Chin</h4>
        <p>Crunchy, lightly sweetened bites, choose your size</p>
      </div>
    </div>
    <div class="m-extra">
      <span class="m-extra-label">Choose a Size</span>
      <div class="liter-chips" data-role="option">
        ${CHIN_CHIN_VARIANTS.map(v=> `<button type="button" class="liter-chip" data-id="${v.id}">${v.name.replace('Chin Chin — ', '')} — ${fmtNaira(v.price)}</button>`).join('')}
      </div>
    </div>
    <div class="m-extra" data-role="qty-wrap" style="display:none;">
      <div class="m-qty-row">
        <div class="m-price" data-role="price"></div>
        <div class="qty-with-label"><span class="qty-label">Quantity</span><div class="qty-control">
          <button type="button" aria-label="Decrease" data-act="dec">−</button>
          <span class="qty-val" data-role="qty-val">0</span>
          <button type="button" aria-label="Increase" data-act="inc">+</button>
        </div></div>
      </div>
    </div>`;

  const optionWrap = wrap.querySelector('[data-role="option"]');
  const qtyWrap = wrap.querySelector('[data-role="qty-wrap"]');
  const qtyVal = wrap.querySelector('[data-role="qty-val"]');
  const priceEl = wrap.querySelector('[data-role="price"]');
  let currentVariant = null;

  optionWrap.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      optionWrap.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      chip.classList.add('selected');
      currentVariant = CHIN_CHIN_VARIANTS.find(v=> v.id === chip.dataset.id);
      priceEl.textContent = `${fmtNaira(currentVariant.price)} / ${currentVariant.unit}`;
      qtyVal.textContent = ffState[currentVariant.id];
      qtyWrap.style.display = 'block';
    });
  });

  wrap.querySelector('[data-act="dec"]').addEventListener('click', ()=>{
    if(currentVariant && ffState[currentVariant.id] > 0){ ffState[currentVariant.id]--; renderFF(); }
  });
  wrap.querySelector('[data-act="inc"]').addEventListener('click', ()=>{
    if(currentVariant){ ffState[currentVariant.id]++; renderFF(); }
  });

  wrap.syncQty = ()=>{ if(currentVariant) qtyVal.textContent = ffState[currentVariant.id]; };
  wrap.restoreSelection = ()=>{
    const v = CHIN_CHIN_VARIANTS.find(x=> ffState[x.id] > 0);
    if(v) optionWrap.querySelector('[data-id="' + v.id + '"]').click();
  };
  return wrap;
}

ffWidgets.push(buildSmallChopsItem(), buildChinChinItem());
ffWidgets.forEach(w=> fingerFoodList.appendChild(w));

fingerFoodMenu.forEach(item=>{
  const row = document.createElement('div');
  row.className = 'menu-item' + (item.needsFlavour ? ' has-extra' : '');
  row.innerHTML = `
    <div class="m-top">
      <div class="m-body">
        <h4>${item.name}</h4>
        <p>${item.desc}</p>
        <div class="m-price">${fmtNaira(item.price)} / ${item.unit}</div>
      </div>
      <div class="qty-with-label"><span class="qty-label">Quantity</span><div class="qty-control">
        <button type="button" aria-label="Decrease" data-act="dec">−</button>
        <span class="qty-val" id="ff-qty-${item.id}">0</span>
        <button type="button" aria-label="Increase" data-act="inc">+</button>
      </div></div>
    </div>
    ${item.needsFlavour ? `
    <div class="m-extra" id="ff-extra-${item.id}" style="display:none;">
      <div class="field">
        <label for="ff-flavour-${item.id}">Flavour <span class="req">*</span></label>
        <select id="ff-flavour-${item.id}">
          <option value="">Select flavour</option>
          ${CAKE_SLICE_FLAVOURS.map(f=> `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}`;

  if(item.needsFlavour){
    ffFlavours[item.id] = '';
    row.querySelector(`#ff-flavour-${item.id}`).addEventListener('change', (e)=>{
      ffFlavours[item.id] = e.target.value;
    });
  }

  row.querySelector('[data-act="dec"]').addEventListener('click', ()=>{ if(ffState[item.id] > 0){ ffState[item.id]--; renderFF(); } });
  row.querySelector('[data-act="inc"]').addEventListener('click', ()=>{ ffState[item.id]++; renderFF(); });
  fingerFoodList.appendChild(row);
});

function renderFF(){
  let count = 0, total = 0;
  const listEl = document.getElementById('ffList');
  listEl.innerHTML = '';

  fingerFoodMenu.forEach(item=>{
    document.getElementById(`ff-qty-${item.id}`).textContent = ffState[item.id];
    if(item.needsFlavour){
      document.getElementById(`ff-extra-${item.id}`).style.display = ffState[item.id] > 0 ? 'block' : 'none';
    }
  });
  ffWidgets.forEach(w=> w.syncQty());

  ALL_FF_ITEMS.forEach(item=>{
    const qty = ffState[item.id];
    if(qty > 0){
      count += qty; total += qty * item.price;
      const flavourNote = item.needsFlavour && ffFlavours[item.id] ? ` — Flavour: ${ffFlavours[item.id]}` : '';
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `<div><div class="s-name">${item.name} × ${qty}${flavourNote}</div><div class="s-meta">${fmtNaira(item.price * qty)}</div></div>
        <button type="button" class="s-remove" data-id="${item.id}">Remove</button>`;
      row.querySelector('.s-remove').addEventListener('click', ()=>{ ffState[item.id] = 0; renderFF(); });
      listEl.appendChild(row);
    }
  });

  document.getElementById('ffCount').textContent = count;
  document.getElementById('ffTotal').textContent = fmtNaira(total);
  document.getElementById('ffEmpty').style.display = count ? 'none' : 'block';
  document.getElementById('ffCheckout').style.display = count ? 'block' : 'none';
  document.getElementById('fingerFoodSummary').style.display = count ? 'block' : 'none';
  if(typeof refreshCartUI === 'function') refreshCartUI();
}

document.getElementById('ffCheckoutBtn').addEventListener('click', openCheckoutModal);

/* ============================================================
   CATERING — Soups, Rice, Proteins (liter/qty based)
============================================================ */
// Each soup prices its own 5L/10L (10L = 2× the 5L price) rather than
// sharing one flat per-litre rate across all flavours.
const cateringSoups = [
  { id:'afang', name:'Afang Soup', desc:'Waterleaf, afang leaf, assorted meat or fish', sizes:[{label:'5L', price:30000}, {label:'10L', price:60000}] },
  { id:'edikang-ikong', name:'Edikang Ikong', desc:'Ugu & waterleaf, rich with assorted meat', sizes:[{label:'5L', price:30000}, {label:'10L', price:60000}] },
  { id:'atama', name:'Atama Soup', desc:'Atama leaf, periwinkle & assorted meat', sizes:[{label:'5L', price:28000}, {label:'10L', price:56000}] },
  { id:'white-soup', name:'White Soup', desc:'Catfish soup, native spice base', sizes:[{label:'5L', price:28000}, {label:'10L', price:56000}] },
  { id:'egusi', name:'Egusi Soup', desc:'Melon seed, assorted meat or fish', sizes:[{label:'5L', price:28000}, {label:'10L', price:56000}] },
];
const SOUP_PROTEINS = ['Goat meat', 'Beef', 'Fish', 'Cow Leg'];

const cateringRice = [
  { id:'jollof', name:'Jollof Rice', desc:'Smoky party-style jollof' },
  { id:'fried-rice', name:'Fried Rice', desc:'Mixed vegetables, Nigerian-style' },
  { id:'coconut-rice', name:'Coconut Rice', desc:'Rich coconut milk base' },
];
// Lunchpack = personal portion, Tray = serves 10. Classic adds a side.
const RICE_TYPES = ['Lunchpack', 'Tray'];
const RICE_STYLES = ['Standard', 'Classic'];
const RICE_SIDES = ['Salad', 'Plantain'];
const RICE_PRICING = {
  Lunchpack: { Standard: 3500, Classic: 4500 },
  Tray: { Standard: 20000, Classic: 24000 },
};
// What's actually in each pack. Listed up front on every rice row
// rather than tucked behind a selection, so the difference between the
// two is obvious before choosing.
const RICE_STYLE_NOTES = {
  Standard: 'Rice and Chicken',
  Classic: 'Rice, Chicken and a Side (Salad or Plantain)',
};

const cateringProteins = [
  { id:'chicken', name:'Chicken', unit:'per portion', price:2500 },
  { id:'turkey', name:'Turkey', unit:'per portion', price:3000 },
  { id:'beef', name:'Beef', unit:'per portion', price:2200 },
  { id:'fish', name:'Fish (Titus/Croaker)', unit:'per portion', price:3200 },
];

const catState = { soups:{}, rice:{}, proteins:{} };

/* Soup: pick a litre size, then which protein it should be made
   with — the protein choice doesn't change price, it just specifies
   the order (soup pricing already assumes assorted meat/fish). */
function buildSoupRow(item){
  const row = document.createElement('div');
  row.className = 'menu-item has-extra';
  row.dataset.itemId = item.id;
  row.innerHTML = `
    <div class="m-top">
      <div class="m-body"><h4>${item.name}</h4><p>${item.desc}</p></div>
    </div>
    <div class="m-extra">
      <div class="m-qty-row">
        <div>
          <span class="m-extra-label">Size</span>
          <div class="liter-chips" data-role="size">
            ${item.sizes.map(o=> `<button type="button" class="liter-chip" data-label="${o.label}" data-price="${o.price}">${o.label}</button>`).join('')}
          </div>
        </div>
        <div class="qty-with-label" data-role="qty-wrap" style="display:none;">
          <span class="qty-label">Quantity</span>
          <div class="qty-control">
            <button type="button" aria-label="Decrease quantity" data-act="dec">−</button>
            <span class="qty-val" data-role="qty-val">0</span>
            <button type="button" aria-label="Increase quantity" data-act="inc">+</button>
          </div>
        </div>
      </div>
    </div>
    <div class="m-extra" data-role="protein-wrap" style="display:none;">
      <span class="m-extra-label">Protein</span>
      <div class="liter-chips" data-role="protein">
        ${SOUP_PROTEINS.map(p=> `<button type="button" class="liter-chip" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>`;

  const sel = { label:'', price:0, protein:'', qty:1 };
  const sizeWrap = row.querySelector('[data-role="size"]');
  const qtyWrap = row.querySelector('[data-role="qty-wrap"]');
  const qtyVal = row.querySelector('[data-role="qty-val"]');
  const proteinWrap = row.querySelector('[data-role="protein-wrap"]');
  const proteinChips = row.querySelector('[data-role="protein"]');

  function commit(){
    if(sel.label && sel.protein){
      catState.soups[item.id] = { name:item.name, label:`${sel.label}, ${sel.protein}`, unitPrice: sel.price, qty: sel.qty, sel:{ label: sel.label, protein: sel.protein } };
    } else {
      delete catState.soups[item.id];
    }
    renderCatering();
  }

  sizeWrap.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      sizeWrap.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      proteinChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      if(already){
        sel.label = ''; sel.price = 0; sel.protein = ''; sel.qty = 1;
        qtyVal.textContent = '0'; // keeps syncCartStates()'s generic qty>0 check honest pre-selection
        proteinWrap.style.display = 'none';
        qtyWrap.style.display = 'none';
      } else {
        chip.classList.add('selected');
        sel.label = chip.dataset.label;
        sel.price = Number(chip.dataset.price);
        sel.protein = '';
        sel.qty = 1;
        qtyVal.textContent = '1';
        proteinWrap.style.display = 'block';
        qtyWrap.style.display = 'flex';
      }
      commit();
    });
  });
  qtyWrap.querySelector('[data-act="dec"]').addEventListener('click', ()=>{
    const q = Number(qtyVal.textContent) || 1;
    if(q <= 1) return;
    sel.qty = q - 1;
    qtyVal.textContent = sel.qty;
    commit();
  });
  qtyWrap.querySelector('[data-act="inc"]').addEventListener('click', ()=>{
    const q = Number(qtyVal.textContent) || 1;
    sel.qty = q + 1;
    qtyVal.textContent = sel.qty;
    commit();
  });
  proteinChips.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      proteinChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sel.protein = already ? '' : chip.dataset.value;
      if(!already) chip.classList.add('selected');
      commit();
    });
  });

  return row;
}

/* Rice: pick Lunchpack or Tray, then Standard or Classic — Classic
   (either type) reveals a required side choice. */
function buildRiceRow(item){
  const row = document.createElement('div');
  row.className = 'menu-item has-extra';
  row.dataset.itemId = item.id;
  row.innerHTML = `
    <div class="m-top">
      <div class="m-body"><h4>${item.name}</h4><p>${item.desc}</p></div>
    </div>
    <div class="m-extra">
      <span class="m-extra-label">Type</span>
      <div class="liter-chips" data-role="type">
        ${RICE_TYPES.map(t=> `<button type="button" class="liter-chip" data-value="${t}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="m-extra" data-role="style-wrap" style="display:none;">
      <span class="m-extra-label">Style</span>
      <div class="liter-chips" data-role="style">
        ${RICE_STYLES.map(s=> `<button type="button" class="liter-chip" data-value="${s}">${s}</button>`).join('')}
      </div>
      <ul class="pack-contents">
        ${RICE_STYLES.map(s=> `<li><strong>${s}</strong><span>${RICE_STYLE_NOTES[s]}</span></li>`).join('')}
      </ul>
    </div>
    <div class="m-extra" data-role="sides-wrap" style="display:none;">
      <span class="m-extra-label">Choose a Side</span>
      <div class="liter-chips" data-role="sides">
        ${RICE_SIDES.map(s=> `<button type="button" class="liter-chip" data-value="${s}">${s}</button>`).join('')}
      </div>
    </div>`;

  const sel = { type:'', style:'', sides:'' };
  const typeChips = row.querySelector('[data-role="type"]');
  const styleWrap = row.querySelector('[data-role="style-wrap"]');
  const styleChips = row.querySelector('[data-role="style"]');
  const sidesWrap = row.querySelector('[data-role="sides-wrap"]');
  const sidesChips = row.querySelector('[data-role="sides"]');

  function commit(){
    if(sel.type && sel.style && (sel.style !== 'Classic' || sel.sides)){
      const price = RICE_PRICING[sel.type][sel.style];
      const labelBits = [sel.type, sel.style];
      if(sel.sides) labelBits.push(sel.sides);
      catState.rice[item.id] = { name: item.name, label: labelBits.join(', '), price, sel:{ type: sel.type, style: sel.style, sides: sel.sides } };
    } else {
      delete catState.rice[item.id];
    }
    renderCatering();
  }

  typeChips.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      typeChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      styleChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sidesChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sel.style = ''; sel.sides = '';
      sidesWrap.style.display = 'none';
      if(already){
        sel.type = '';
        styleWrap.style.display = 'none';
      } else {
        chip.classList.add('selected');
        sel.type = chip.dataset.value;
        styleWrap.style.display = 'block';
      }
      commit();
    });
  });
  styleChips.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      styleChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sidesChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sel.sides = '';
      if(already){
        sel.style = '';
        sidesWrap.style.display = 'none';
      } else {
        chip.classList.add('selected');
        sel.style = chip.dataset.value;
        sidesWrap.style.display = sel.style === 'Classic' ? 'block' : 'none';
      }
      commit();
    });
  });
  sidesChips.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      sidesChips.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      sel.sides = already ? '' : chip.dataset.value;
      if(!already) chip.classList.add('selected');
      commit();
    });
  });

  return row;
}

const soupList = document.getElementById('soupList');
cateringSoups.forEach(item=> soupList.appendChild(buildSoupRow(item)));

const riceList = document.getElementById('riceList');
cateringRice.forEach(item=> riceList.appendChild(buildRiceRow(item)));

const proteinList = document.getElementById('proteinList');
cateringProteins.forEach(item=>{
  catState.proteins[item.id] = 0;
  const row = document.createElement('div');
  row.className = 'menu-item';
  row.innerHTML = `
    <div class="m-body"><h4>${item.name}</h4><div class="m-price">${fmtNaira(item.price)} ${item.unit}</div></div>
    <div class="qty-with-label"><span class="qty-label">Quantity</span><div class="qty-control">
      <button type="button" aria-label="Decrease" data-act="dec">−</button>
      <span class="qty-val" id="cat-qty-${item.id}">0</span>
      <button type="button" aria-label="Increase" data-act="inc">+</button>
    </div></div>`;
  row.querySelector('[data-act="dec"]').addEventListener('click', ()=>{ if(catState.proteins[item.id] > 0){ catState.proteins[item.id]--; renderCatering(); } });
  row.querySelector('[data-act="inc"]').addEventListener('click', ()=>{ catState.proteins[item.id]++; renderCatering(); });
  proteinList.appendChild(row);
});

function renderCatering(){
  let count = 0, total = 0;
  const listEl = document.getElementById('catList');
  listEl.innerHTML = '';

  Object.values(catState.soups).forEach(s=>{
    count += s.qty; total += s.qty * s.unitPrice;
    const row = document.createElement('div'); row.className = 'summary-row';
    row.innerHTML = `<div><div class="s-name">${s.name}, ${s.label}${s.qty > 1 ? ` × ${s.qty}` : ''}</div><div class="s-meta">${fmtNaira(s.qty * s.unitPrice)}</div></div>`;
    listEl.appendChild(row);
  });
  Object.values(catState.rice).forEach(r=>{
    count++; total += r.price;
    const row = document.createElement('div'); row.className = 'summary-row';
    row.innerHTML = `<div><div class="s-name">${r.name}, ${r.label}</div><div class="s-meta">${fmtNaira(r.price)}</div></div>`;
    listEl.appendChild(row);
  });
  cateringProteins.forEach(p=>{
    const qty = catState.proteins[p.id];
    document.getElementById(`cat-qty-${p.id}`).textContent = qty;
    if(qty > 0){
      count += qty; total += qty * p.price;
      const row = document.createElement('div'); row.className = 'summary-row';
      row.innerHTML = `<div><div class="s-name">${p.name} × ${qty}</div><div class="s-meta">${fmtNaira(qty * p.price)}</div></div>
        <button type="button" class="s-remove" data-id="${p.id}">Remove</button>`;
      row.querySelector('.s-remove').addEventListener('click', ()=>{ catState.proteins[p.id] = 0; renderCatering(); });
      listEl.appendChild(row);
    }
  });

  document.getElementById('catCount').textContent = count;
  document.getElementById('catTotal').textContent = fmtNaira(total);
  document.getElementById('catEmpty').style.display = count ? 'none' : 'block';
  document.getElementById('catCheckout').style.display = count ? 'block' : 'none';
  if(typeof refreshCartUI === 'function') refreshCartUI();
}

document.getElementById('catCheckoutBtn').addEventListener('click', openCheckoutModal);

/* ============================================================
   CHECKOUT — one modal, shared by Finger Foods and Catering (cakes
   have their own always-inline form and send straight to WhatsApp,
   so they never touch this). Opened from either section's Checkout
   button or the nav cart dropdown's Checkout All — never sits
   inline on the page. Reviews everything in the cart and sends it
   all as a single WhatsApp message; the event-specific fields only
   show up if there's a catering item in the mix.
============================================================ */
const checkoutModal = document.getElementById('checkoutModal');

function renderCheckoutModal(){
  const ffLines = CART_SOURCES.ff.lines();
  const catLines = CART_SOURCES.cat.lines();
  const hasCat = catLines.length > 0;

  const reviewEl = document.getElementById('checkoutReview');
  reviewEl.innerHTML = '';
  [...ffLines, ...catLines].forEach(line=>{
    const row = document.createElement('div');
    row.className = 'checkout-review-row';
    row.innerHTML = `<span>${line.name}${line.qty > 1 ? ` × ${line.qty}` : ''}</span><span>${fmtNaira(line.qty * line.unitPrice)}</span>`;
    reviewEl.appendChild(row);
  });

  const total = [...ffLines, ...catLines].reduce((n,l)=> n + l.qty * l.unitPrice, 0);
  document.getElementById('checkoutTotal').textContent = fmtNaira(total);

  document.getElementById('checkoutEventTypeField').hidden = !hasCat;
  document.getElementById('checkoutEventDetailsRow').hidden = !hasCat;
  document.getElementById('checkoutDateReq').hidden = !hasCat;
}

function openCheckoutModal(){
  const ffLines = CART_SOURCES.ff.lines();
  const catLines = CART_SOURCES.cat.lines();
  if(!ffLines.length && !catLines.length){
    // Nothing but cakes queued up (or a cake form filled in but not
    // yet added) — cakes have no fixed price, so they skip this
    // generic modal and go straight to their own WhatsApp flow.
    if(cakeCart.length || cakeFormHasContent()){
      closeCartDropdown();
      finalizeCakeOrder();
      return;
    }
    showToast('Your cart is empty.');
    return;
  }
  closeCartDropdown();
  renderCheckoutModal();
  openModal(checkoutModal);
}
document.getElementById('checkoutClose').addEventListener('click', ()=> closeModal(checkoutModal));
document.getElementById('checkoutBackdrop').addEventListener('click', ()=> closeModal(checkoutModal));
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && checkoutModal.classList.contains('open')) closeModal(checkoutModal); });
document.getElementById('cartCheckoutAllBtn').addEventListener('click', openCheckoutModal);

let checkoutServiceType = '';
document.querySelectorAll('#checkoutServiceType .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#checkoutServiceType .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    checkoutServiceType = c.dataset.value;
  });
});

const checkoutAddressField = document.getElementById('checkoutAddressField');
const checkoutAddressInput = document.getElementById('checkoutAddress');
let checkoutDelivery = '';
document.querySelectorAll('#checkoutDelivery .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#checkoutDelivery .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    checkoutDelivery = c.dataset.value;
    const needsAddress = checkoutDelivery === 'Delivery';
    checkoutAddressField.style.display = needsAddress ? 'block' : 'none';
    if(!needsAddress) checkoutAddressInput.value = '';
  });
});

document.getElementById('checkoutForm').addEventListener('submit', (e)=>{
  e.preventDefault();

  const ffLines = CART_SOURCES.ff.lines();
  const catLines = CART_SOURCES.cat.lines();
  if(!ffLines.length && !catLines.length){ showToast('Your cart is empty.'); return; }
  const hasCat = catLines.length > 0;

  const eventTypeEl = document.getElementById('checkoutEventType');
  const eventType = eventTypeEl.value;
  const guests = document.getElementById('checkoutGuests').value;
  const nameEl = document.getElementById('checkoutName');
  const phoneEl = document.getElementById('checkoutPhone');
  const name = nameEl.value;
  const phone = phoneEl.value;
  const address = checkoutAddressInput.value.trim();
  const dateEl = document.getElementById('checkoutDate');
  const date = dateEl.value;
  const notes = document.getElementById('checkoutNotes').value;

  if(hasCat && !eventType){
    showToast('Please select an event type.');
    flagInvalidField(eventTypeEl);
    return;
  }
  if(hasCat && !date){
    showToast('Please choose the date of your event.');
    flagInvalidField(dateEl);
    return;
  }
  if(date && date < minOrderDate()){
    showToast(`We need at least ${MIN_ORDER_LEAD_DAYS} days' notice — please pick a date from ${minOrderDate()} onward.`);
    flagInvalidField(dateEl);
    return;
  }
  if(!checkoutDelivery){
    showToast('Please choose a delivery method.');
    flagInvalidField(document.getElementById('checkoutDelivery'));
    return;
  }
  if(!name){
    showToast('Please enter your name.');
    flagInvalidField(nameEl);
    return;
  }
  if(!phone){
    showToast('Please enter your WhatsApp number.');
    flagInvalidField(phoneEl);
    return;
  }
  if(!isValidPhone(phone)){
    showToast('Please enter a valid WhatsApp number.');
    flagInvalidField(phoneEl);
    return;
  }
  if(checkoutDelivery === 'Delivery' && !address){
    showToast('Please add your delivery location.');
    flagInvalidField(checkoutAddressInput);
    return;
  }

  for(const item of ALL_FF_ITEMS){
    if(item.needsFlavour && ffState[item.id] > 0 && !ffFlavours[item.id]){
      showToast(`Please select a flavour for ${item.name}.`);
      closeModal(checkoutModal);
      flagInvalidField(document.getElementById(`ff-flavour-${item.id}`));
      return;
    }
  }

  const ffItemLines = ffLines.map(l=> `${l.qty} × ${l.name} — ${fmtNaira(l.qty * l.unitPrice)}`);
  const cateringItemLines = [
    ...Object.values(catState.soups).map(s=> `${s.qty} × ${s.name}, ${s.label} — ${fmtNaira(s.qty * s.unitPrice)}`),
    ...Object.values(catState.rice).map(r=> `${r.name}, ${r.label} — ${fmtNaira(r.price)}`),
    ...cateringProteins.filter(p=> catState.proteins[p.id] > 0)
      .map(p=> `${catState.proteins[p.id]} × ${p.name} — ${fmtNaira(p.price * catState.proteins[p.id])}`),
  ];
  const eventBits = [eventType, guests ? `${guests} guests` : '', checkoutServiceType].filter(Boolean);
  const total = [...ffLines, ...catLines].reduce((n,l)=> n + l.qty * l.unitPrice, 0);
  const orderNo = generateOrderNumber(name);

  const message = fitWhatsAppMessage((detail)=> {
    const strip = (arr)=> detail === 'summary'
      ? [`${arr.length} item${arr.length === 1 ? '' : 's'}`]
      : arr.map(l=> detail === 'brief' ? l.replace(/ — ₦[\d,]+$/, '') : l);
    return [
      `*ORDER*`,
      `No. ${orderNo}`,
      ``,
      ffItemLines.length ? `*Finger Foods*` : null,
      ...(ffItemLines.length ? strip(ffItemLines) : []),
      ffItemLines.length ? `` : null,
      cateringItemLines.length ? `*Catering*` : null,
      ...(cateringItemLines.length ? strip(cateringItemLines) : []),
      cateringItemLines.length ? `` : null,
      eventBits.length ? `Event: ${eventBits.join(', ')}` : null,
      `*Total ${fmtNaira(total)}*`,
      `${checkoutDelivery}${address ? `, ${address}` : ''}`,
      date ? `Needed: ${date}` : null,
      notes ? `Notes: ${trimText(notes, detail === 'full' ? 300 : 100)}` : null,
      ``,
      `${name}, ${phone}`,
    ];
  });

  logOrder({
    orderNumber: orderNo,
    orderType: hasCat ? (ffLines.length ? 'Finger Foods + Catering' : 'Catering') : 'Finger Foods',
    name, phone,
    delivery: checkoutDelivery,
    address,
    dateNeeded: date,
    eventType: hasCat ? eventType : '',
    guests: hasCat ? guests : '',
    serviceType: hasCat ? checkoutServiceType : '',
    items: [...ffItemLines, ...cateringItemLines].join('\n'),
    total: fmtNaira(total),
    notes
  });

  const opened = openWhatsApp(message);
  closeModal(checkoutModal);
  clearFingerFoodAndCateringCart();
  showToast(opened
    ? `Opening WhatsApp — your order no. is ${orderNo}`
    : `Order no. ${orderNo} — taking you to WhatsApp…`);
});

// Empties the finger-food and catering cart after an order has been sent,
// so a returning visitor (the cart is persisted) doesn't resend it and
// create a duplicate order. Drives the real widgets so their chips and
// steppers reset along with the underlying state. Cakes clear themselves
// in finalizeCakeOrder().
function clearFingerFoodAndCateringCart(){
  ALL_FF_ITEMS.forEach(item=>{ ffState[item.id] = 0; });
  Object.keys(ffFlavours).forEach(id=>{
    ffFlavours[id] = '';
    const sel = document.getElementById('ff-flavour-' + id);
    if(sel) sel.value = '';
  });
  document.querySelectorAll('#soupList [data-role="size"] .liter-chip.selected').forEach(chip=> chip.click());
  document.querySelectorAll('#riceList [data-role="type"] .liter-chip.selected').forEach(chip=> chip.click());
  cateringProteins.forEach(p=>{ catState.proteins[p.id] = 0; });
  catState.soups = {};
  catState.rice = {};
  renderFF();
  renderCatering();
}

/* ============================================================
   CART WIDGET — nav icon + dropdown (Finger Foods + Catering only;
   cakes go straight to WhatsApp so they never appear here)

   Problem: at <=980px .menu-layout collapses to one column, which
   stacks the order summary below the entire menu list. A customer
   building an order has no idea what their running total is until
   they've scrolled past every item — so they can't tell when to
   stop adding. This keeps a running total + review panel reachable
   from the nav at all times, on any screen size.

   Deliberately NOT a toast per tap: that's noise on mobile. Per-add
   feedback is in-place (digit pulse, badge pop, wine rule on cards
   already in the cart) plus — desktop only — the dropdown itself
   popping open briefly. See updateCartIcon() below.
============================================================ */
const cartWidget        = document.getElementById('cartWidget');
const cartIconBtn       = document.getElementById('cartIconBtn');
const cartIconBadge     = document.getElementById('cartIconBadge');
const cartDropdown      = document.getElementById('cartDropdown');
const cartDropdownBody  = document.getElementById('cartDropdownBody');
const cartDropdownTotal = document.getElementById('cartDropdownTotal');

/* Each cart exposes the same shape so the dropdown can render every
   section generically. */
const CART_SOURCES = {
  ff: {
    title: 'Finger Foods Order',
    lines(){
      return ALL_FF_ITEMS.filter(i=> ffState[i.id] > 0).map(i=>({
        id: i.id,
        name: i.name + (i.needsFlavour && ffFlavours[i.id] ? ` — ${ffFlavours[i.id]}` : ''),
        qty: ffState[i.id],
        unitPrice: i.price,
        stepper: true
      }));
    },
    setQty(id, qty){ ffState[id] = Math.max(0, qty); renderFF(); }
  },
  cat: {
    title: 'Catering Order',
    lines(){
      const out = [];
      // Soup quantity is set via its own selector in the menu (not
      // adjustable from the cart), and rice is a single size selection —
      // so both get a remove action here rather than a +/- stepper.
      Object.entries(catState.soups).forEach(([key, s])=>
        out.push({ id:`soup:${key}`, name:`${s.name}, ${s.label}`, qty:s.qty, unitPrice:s.unitPrice, stepper:false }));
      Object.entries(catState.rice).forEach(([key, r])=>
        out.push({ id:`rice:${key}`, name:`${r.name}, ${r.label}`, qty:1, unitPrice:r.price, stepper:false }));
      cateringProteins.forEach(p=>{
        if(catState.proteins[p.id] > 0)
          out.push({ id:`protein:${p.id}`, name:p.name, qty:catState.proteins[p.id], unitPrice:p.price, stepper:true });
      });
      return out;
    },
    setQty(id, qty){
      const sep = id.indexOf(':');
      const kind = id.slice(0, sep), key = id.slice(sep + 1);
      if(kind === 'protein') catState.proteins[key] = Math.max(0, qty);
      else if(kind === 'soup') delete catState.soups[key];
      else if(kind === 'rice') delete catState.rice[key];
      renderCatering();
    }
  },
  // Cakes have no fixed price (quoted directly on WhatsApp) and no
  // per-line quantity — each entry is one full cake spec, added via
  // "Add Another Cake" and only removable, not adjustable, from here.
  // Not part of the "Checkout All" flow below: cakes are finalized
  // from their own "Checkout Now" button in the Cakes section, which
  // has the richer per-cake detail (tiers, custom-order flag, etc.)
  // that a generic cart line can't show.
  cake: {
    title: 'Cake Order',
    lines(){
      return cakeCart.map(c=>({
        id: c.id,
        name: `${c.occasion} Cake — ${c.tiersLabel}`,
        qty: 1,
        unitPrice: 0,
        priceLabel: 'Quote on request',
        stepper: false
      }));
    },
    setQty(id){
      cakeCart = cakeCart.filter(c=> c.id !== id);
      refreshCartUI();
    }
  }
};

const isDesktopCart = ()=> window.matchMedia('(min-width: 981px)').matches;

let lastCartCount = 0;
let cartAnnounceTimer;
let cartAutoDismissTimer;
let cartDropdownHovered = false;
const CART_AUTO_DISMISS_MS = 4500;

function announceCart(count, total){
  // Debounced so rapid +/- taps don't flood a screen reader.
  clearTimeout(cartAnnounceTimer);
  cartAnnounceTimer = setTimeout(()=>{
    document.getElementById('cartLive').textContent =
      `${count} item${count === 1 ? '' : 's'} in your order. Estimated total ${fmtNaira(total)}.`;
  }, 600);
}

function buildCartLineRow(line, src){
  const row = document.createElement('div');
  row.className = 'cart-dd-line';

  const body = document.createElement('div');
  body.className = 'cart-dd-line-body';
  const nameEl = document.createElement('div');
  nameEl.className = 'cart-dd-line-name';
  nameEl.textContent = line.qty > 1 ? `${line.name} × ${line.qty}` : line.name;
  const priceEl = document.createElement('div');
  priceEl.className = 'cart-dd-line-price';
  priceEl.textContent = line.priceLabel || fmtNaira(line.qty * line.unitPrice);
  body.append(nameEl, priceEl);
  row.appendChild(body);

  const ctrl = document.createElement('div');
  ctrl.className = 'cart-dd-line-qty';
  if(line.stepper){
    const dec = document.createElement('button');
    dec.type = 'button'; dec.textContent = '−';
    dec.setAttribute('aria-label', `Decrease ${line.name}`);
    dec.addEventListener('click', ()=> src.setQty(line.id, line.qty - 1));
    const val = document.createElement('span');
    val.textContent = line.qty;
    const inc = document.createElement('button');
    inc.type = 'button'; inc.textContent = '+';
    inc.setAttribute('aria-label', `Increase ${line.name}`);
    inc.addEventListener('click', ()=> src.setQty(line.id, line.qty + 1));
    ctrl.append(dec, val, inc);
  } else {
    const rm = document.createElement('button');
    rm.type = 'button'; rm.textContent = '×';
    rm.setAttribute('aria-label', `Remove ${line.name}`);
    rm.addEventListener('click', ()=> src.setQty(line.id, 0));
    ctrl.appendChild(rm);
  }
  row.appendChild(ctrl);
  return row;
}

// One section per source that actually has items — omitted entirely
// when empty, so a customer with only a Finger Foods order doesn't
// see a blank "Catering Order" heading.
function buildCartSection(key){
  const src = CART_SOURCES[key];
  const lines = src.lines();
  if(!lines.length) return null;

  const section = document.createElement('div');
  section.className = 'cart-dd-section';
  section.innerHTML = `<div class="cart-dd-section-head"><span>${src.title}</span></div>`;
  const linesWrap = document.createElement('div');
  linesWrap.className = 'cart-dd-lines';
  lines.forEach(line=> linesWrap.appendChild(buildCartLineRow(line, src)));
  section.appendChild(linesWrap);
  return section;
}

function renderCartDropdown(){
  cartDropdownBody.innerHTML = '';
  const sections = ['ff','cat','cake'].map(buildCartSection).filter(Boolean);
  if(!sections.length){
    const empty = document.createElement('p');
    empty.className = 'cart-dropdown-empty';
    empty.textContent = 'Nothing added yet.';
    cartDropdownBody.appendChild(empty);
    return;
  }
  sections.forEach(s=> cartDropdownBody.appendChild(s));
}

function getCartTotals(){
  const allLines = [...CART_SOURCES.ff.lines(), ...CART_SOURCES.cat.lines(), ...CART_SOURCES.cake.lines()];
  return {
    count: allLines.reduce((n,l)=> n + l.qty, 0),
    total: allLines.reduce((n,l)=> n + l.qty * l.unitPrice, 0)
  };
}

/* ============================================================
   CART ICON ATTENTION PULSE — every 20s, briefly pulses the nav
   cart icon while it's on screen and holds at least one item, as a
   lightweight nudge to come back and finish checking out.
============================================================ */
let cartIconInView = false;
new IntersectionObserver((entries)=>{
  entries.forEach(entry=> cartIconInView = entry.isIntersecting);
}, { threshold: 0 }).observe(cartIconBtn);

setInterval(()=>{
  if(!cartIconInView || !getCartTotals().count) return;
  cartIconBtn.classList.add('cart-pulse');
  setTimeout(()=> cartIconBtn.classList.remove('cart-pulse'), 1000);
}, 20000);

function scheduleCartAutoDismiss(){
  clearTimeout(cartAutoDismissTimer);
  if(cartDropdownHovered) return; // don't count down while the cursor is on it
  cartAutoDismissTimer = setTimeout(closeCartDropdown, CART_AUTO_DISMISS_MS);
}
cartDropdown.addEventListener('mouseenter', ()=>{
  cartDropdownHovered = true;
  clearTimeout(cartAutoDismissTimer);
});
cartDropdown.addEventListener('mouseleave', ()=>{
  cartDropdownHovered = false;
  if(cartDropdown.classList.contains('open')) scheduleCartAutoDismiss();
});

function openCartDropdown(){
  renderCartDropdown();
  cartDropdown.hidden = false;
  requestAnimationFrame(()=> cartDropdown.classList.add('open'));
  cartIconBtn.setAttribute('aria-expanded', 'true');
}
function closeCartDropdown(){
  cartDropdown.classList.remove('open');
  cartIconBtn.setAttribute('aria-expanded', 'false');
  clearTimeout(cartAutoDismissTimer);
  setTimeout(()=>{ if(!cartDropdown.classList.contains('open')) cartDropdown.hidden = true; }, 240);
}
function toggleCartDropdown(){
  if(cartDropdown.classList.contains('open')) closeCartDropdown();
  else openCartDropdown();
}

cartIconBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleCartDropdown(); });
document.getElementById('cartDropdownClose').addEventListener('click', closeCartDropdown);
document.addEventListener('click', (e)=>{
  if(!cartDropdown.classList.contains('open')) return;
  if(cartWidget.contains(e.target)) return; // clicks on the icon/panel itself aren't "outside"
  closeCartDropdown();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && cartDropdown.classList.contains('open')) closeCartDropdown();
});

function updateCartIcon(){
  const { count, total } = getCartTotals();

  if(!count){
    cartWidget.hidden = true;
    lastCartCount = 0;
    if(cartDropdown.classList.contains('open')) closeCartDropdown();
    return;
  }

  cartWidget.hidden = false;
  cartIconBadge.textContent = count;
  cartDropdownTotal.textContent = fmtNaira(total);
  if(cartDropdown.classList.contains('open')) renderCartDropdown();

  if(count !== lastCartCount){
    cartIconBadge.classList.remove('pop');
    void cartIconBadge.offsetWidth; // force reflow so the animation re-runs
    cartIconBadge.classList.add('pop');
    announceCart(count, total);

    // Auto-pop the dropdown on desktop, only when an item was just
    // added (not on removals) — mobile stays click-only so nothing
    // pops open unexpectedly on a small screen.
    if(count > lastCartCount && isDesktopCart()){
      openCartDropdown();
      scheduleCartAutoDismiss();
    }
  }
  lastCartCount = count;
}

/* In-place feedback: mark cards that are in the cart, and pulse the
   quantity digit when it changes. Keyed off .qty-val so it covers
   plain menu items, the small-chops/chin-chin widgets and the
   catering protein rows without needing three separate hooks. */
const prevCardQty = new WeakMap();
function syncCartStates(){
  document.querySelectorAll('.menu-item').forEach(card=>{
    const val = card.querySelector('.qty-val');
    if(!val){
      // Soup/rice rows have no stepper — they're "in cart" once a
      // size chip has been chosen.
      card.classList.toggle('in-cart', !!card.querySelector('[data-role="size"] .liter-chip.selected'));
      return;
    }
    const n = Number(val.textContent) || 0;
    card.classList.toggle('in-cart', n > 0);
    if(prevCardQty.has(card) && prevCardQty.get(card) !== n){
      val.classList.remove('bump');
      void val.offsetWidth;
      val.classList.add('bump');
    }
    prevCardQty.set(card, n);
  });
}

/* ============================================================
   CART PERSISTENCE — the whole order-in-progress (finger foods,
   catering, queued cakes) is mirrored to localStorage on every change
   and rebuilt on load, so a refresh or a trip to the gallery page
   doesn't wipe it. Expires after CART_TTL_MS so a stale order from
   last week doesn't greet a returning visitor. Restoring drives the
   real menu widgets with .click() so their own internal state (chips,
   steppers) stays consistent with what's in the cart.
============================================================ */
const CART_STORAGE_KEY = 'lcCartV1';
const CART_TTL_MS = 3 * 24 * 60 * 60 * 1000;
// Starts true so the initial renderFF()/renderCatering() at load can't
// wipe the saved cart before restoreCartState() has read it.
let cartRestoring = true;

function saveCartState(){
  if(cartRestoring) return;
  try{
    const empty = !getCartTotals().count;
    if(empty){ localStorage.removeItem(CART_STORAGE_KEY); return; }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      t: Date.now(), ff: ffState, fl: ffFlavours, cat: catState, cake: cakeCart, cid: cakeIdCounter
    }));
  }catch(e){ /* private mode / quota — persistence is best-effort */ }
}

function restoreCartState(){
  let saved;
  try{
    saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || 'null');
  }catch(e){ cartRestoring = false; return; }
  if(!saved || typeof saved !== 'object' || Date.now() - saved.t > CART_TTL_MS){
    cartRestoring = false;
    try{ localStorage.removeItem(CART_STORAGE_KEY); }catch(e){}
    return;
  }
  try{
    const qtyOf = v => Math.max(0, Math.min(999, Math.floor(Number(v)) || 0));

    // Finger foods
    ALL_FF_ITEMS.forEach(item=>{ ffState[item.id] = qtyOf(saved.ff && saved.ff[item.id]); });
    fingerFoodMenu.forEach(item=>{
      if(!item.needsFlavour) return;
      const f = saved.fl && saved.fl[item.id];
      if(CAKE_SLICE_FLAVOURS.includes(f)){
        ffFlavours[item.id] = f;
        document.getElementById('ff-flavour-' + item.id).value = f;
      }
    });
    ffWidgets.forEach(w=> w.restoreSelection && w.restoreSelection());
    renderFF();

    // Catering: proteins are plain counts; soups/rice re-drive their chips.
    cateringProteins.forEach(p=>{ catState.proteins[p.id] = qtyOf(saved.cat && saved.cat.proteins && saved.cat.proteins[p.id]); });
    const clickChip = (root, sel)=>{ const c = root.querySelector(sel); if(c) c.click(); return c; };
    Object.entries((saved.cat && saved.cat.soups) || {}).forEach(([id, s])=>{
      const row = document.querySelector('#soupList [data-item-id="' + id + '"]');
      if(!row || !s.sel) return;
      if(!clickChip(row, '[data-role="size"] .liter-chip[data-label="' + s.sel.label + '"]')) return;
      if(!clickChip(row, '[data-role="protein"] .liter-chip[data-value="' + s.sel.protein + '"]')) return;
      for(let i = 1; i < qtyOf(s.qty); i++) row.querySelector('[data-act="inc"]').click();
    });
    Object.entries((saved.cat && saved.cat.rice) || {}).forEach(([id, r])=>{
      const row = document.querySelector('#riceList [data-item-id="' + id + '"]');
      if(!row || !r.sel) return;
      if(!clickChip(row, '[data-role="type"] .liter-chip[data-value="' + r.sel.type + '"]')) return;
      if(!clickChip(row, '[data-role="style"] .liter-chip[data-value="' + r.sel.style + '"]')) return;
      if(r.sel.sides) clickChip(row, '[data-role="sides"] .liter-chip[data-value="' + r.sel.sides + '"]');
    });
    renderCatering();

    // Cakes
    if(Array.isArray(saved.cake)){
      cakeCart = saved.cake.filter(c=> c && typeof c.occasion === 'string' && typeof c.tiersLabel === 'string' && Array.isArray(c.tierDetails));
      cakeIdCounter = Math.max(Number(saved.cid) || 0, ...cakeCart.map(c=> Number(c.id) || 0));
    }
  } catch(err) {
    // A saved cart that can't be replayed (edited by hand, or from an
    // older menu) is dropped rather than left to fail on every load.
    try{ localStorage.removeItem(CART_STORAGE_KEY); }catch(e){}
    ALL_FF_ITEMS.forEach(item=>{ ffState[item.id] = 0; });
    catState.soups = {}; catState.rice = {};
    cateringProteins.forEach(p=>{ catState.proteins[p.id] = 0; });
    cakeCart = [];
    renderFF();
    renderCatering();
  } finally {
    cartRestoring = false;
  }
  refreshCartUI();
}

function refreshCartUI(){ syncCartStates(); updateCartIcon(); saveCartState(); }

// Both call refreshCartUI() internally — must run after every const/
// function above is initialized (cartWidget, prevCardQty, etc.), or
// the page throws a TDZ ReferenceError on load and the cart widget
// never initializes. See git history for the incident.
renderFF();
renderCatering();
restoreCartState();

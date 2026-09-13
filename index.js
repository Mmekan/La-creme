/* ============================================================
   CONFIG, waLink(), openWhatsApp(), fmtNaira(), R2_BASE_URL,
   mediaUrl(), escapeHtml(), isValidPhone() now live in config.js
   (loaded before this file) — single source of truth for both
   index.html and gallery.html.
============================================================ */

document.getElementById('aboutPhoto').src = mediaUrl('img/503736309_9061189193984393_2635635431881218558_n.jpg');

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
    blurb: 'Delicious cake slices for any occasion — now on the Finger Foods menu.',
    images: [
      mediaUrl('img/503084596_9068281273275185_5558051441541664408_n.jpg'),
      mediaUrl('img/503416798_9068281249941854_7585160892651594669_n.jpg'),
      mediaUrl('img/504685489_9085240854912560_3651136197304790624_n.jpg'),
    ],
    ctaLabel: 'Order Now',
    ctaHref: 'index.html#finger-foods', // works from both index.html and gallery.html
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

// Generic WhatsApp buttons (nav, hero, contact, floating)
const genericWaMessage = `Hello ${CONFIG.businessName}! I'd like to enquire about your cakes and catering services.`;
['navWaBtn','heroWaBtn','contactWaBtn','floatWaBtn','contactWaIcon'].forEach(id=>{
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
   ICONS (small inline set reused for placeholders & menu items)
============================================================ */
const ICONS = {
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="22" height="22"><path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 21h16M8 12V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4M12 6V3M9 3.5l1.5 1.5M15 3.5 13.5 5"/></svg>',
  platter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="22" height="22"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="22" height="22"><path d="M3 12h18a9 6 0 0 1-18 0zM7 12a5 7 0 0 1 10 0"/></svg>',
  rice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="22" height="22"><path d="M5 20h14M6 20c-1-4 1-8 2-9M18 20c1-4-1-8-2-9M9 11c1-3 1-5 0-8M15 11c-1-3-1-5 0-8"/></svg>',
  meat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="22" height="22"><path d="M15 3c3 0 5.5 2.5 5.5 5.5 0 2-1 3.5-2.5 4.5l-7 7a2.5 2.5 0 0 1-3.5-3.5l7-7C15.5 8.5 15 6 15 3z"/></svg>',
  flower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="12" r="2.6"/></svg>',
  glass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><path d="M7 3h10l-1.5 12a3.5 3.5 0 0 1-7 0L7 3zM12 15v6M8 21h8"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18M12 8v13M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="46" height="46"><path d="M3 9h18M5 9v11M19 9v11M9 3h6l-1 6h-4l-1-6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="20" height="20"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.44 1.33 4.93L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2z"/></svg>'
};

/* ============================================================
   GALLERY DATA — a six-photo preview of the full gallery (see
   gallery.html for the whole infinite-scroll archive).
   Add a real photo by setting `image: "your-photo.jpg"`.
   Leave image: null to keep the elegant placeholder frame.
============================================================ */
const galleryItems = [
  { caption: 'Wedding cake beneath the chandeliers', icon: ICONS.cake, tone:'', image: mediaUrl('img/504807796_9099742323462413_1120354441484283313_n.jpg'), cls:'g-1' },
  { caption: 'Small chops platter — cocktail hour', icon: ICONS.platter, tone:'tone-b', image: mediaUrl('img/123520380_2807744082662300_1396207157575276742_n.jpg'), cls:'g-2' },
  { caption: 'Birthday cake, made to order', icon: ICONS.cake, tone:'tone-c', image: mediaUrl('img/503084596_9068281273275185_5558051441541664408_n.jpg'), cls:'g-3' },
  { caption: 'Crystal-base wedding tier', icon: ICONS.flower, tone:'tone-b', image: mediaUrl('img/504685489_9085240854912560_3651136197304790624_n.jpg'), cls:'g-5' },
  { caption: 'The six-tier reveal, red & ivory', icon: ICONS.table, tone:'', image: mediaUrl('img/503736309_9061189193984393_2635635431881218558_n.jpg'), cls:'g-6' },
  { caption: 'Custom novelty cakes, made to order', icon: ICONS.gift, tone:'tone-c', image: mediaUrl('img/505753228_9109996449103667_9107171079224956350_n.jpg'), cls:'g-7' },
];

const galleryGrid = document.getElementById('galleryGrid');
galleryItems.forEach((item, i)=>{
  const el = document.createElement('div');
  el.className = `media-frame ${item.tone} ${item.cls}`;
  el.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}" loading="lazy"><div class="ring"></div>`
    : `<div class="ring"></div>${item.icon}<span class="cap">${item.caption}</span>`;
  el.addEventListener('click', ()=> openLightbox(item));
  galleryGrid.appendChild(el);
});

/* ============================================================
   VIDEO REEL — behind-the-scenes clips (silent, autoplay while
   in view). Add a real video by setting `video: mediaUrl('videos/
   your-clip.mp4')` — the play placeholder is swapped automatically.
============================================================ */
const videoTestimonials = [
  { name: 'Dessert Table Detail', video: mediaUrl('videos/InShot_20260612_184349227.mp4'), tone:'' },
  { name: '12inch Cake Reveal', video: mediaUrl('videos/InShot_20251207_154703112.mp4'), tone:'tone-b' },
  { name: 'Wedding Day Moment', video: mediaUrl('videos/InShot_20251122_180814090.mp4'), tone:'tone-c' },
  { name: 'Lunchpack Preparation', video: mediaUrl('videos/InShot_20251122_201354636.mp4'), tone:'' },
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
  { quote: 'The cake didn\'t just look expensive — it tasted like it too. Guests kept asking who made it.', name:'Ifeoma A.', event:'Wedding Reception, Lekki' },
  { quote: 'We ordered small chops for 150 guests and everything arrived hot, on time, beautifully packed.', name:'Tunde O.', event:'Corporate Launch' },
  { quote: 'The Afang soup alone made my mother-in-law\'s day. We\'re already booking for next year.', name:'Grace E.', event:'Family Owambe' },
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
   LIGHTBOX
============================================================ */
const lightbox = document.getElementById('lightbox');
const lightboxInner = document.getElementById('lightboxInner');
function openLightbox(item){
  lightboxInner.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}" loading="lazy" style="border-radius:2px;">`
    : `<div class="media-frame ${item.tone}" style="aspect-ratio:4/5; border-radius:2px;"><div class="ring"></div>${item.icon}<span class="cap">${item.caption}</span></div>`;
  openModal(lightbox);
}
document.getElementById('lightboxClose').addEventListener('click', ()=> closeModal(lightbox));
lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) closeModal(lightbox); });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && lightbox.classList.contains('open')) closeModal(lightbox); });

/* ============================================================
   CAKE FORM
============================================================ */

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
    </div>
    <button type="button" class="tier-preview-btn" data-tier="${index}">Preview</button>`;
  const inchesSel = row.querySelector('.tier-inches');
  const layersSel = row.querySelector('.tier-layers');
  inchesSel.addEventListener('change', ()=>{
    const opts = INCH_LAYER_OPTIONS[inchesSel.value] || [];
    layersSel.disabled = !opts.length;
    layersSel.innerHTML = opts.length
      ? `<option value="">Select layers</option>` + opts.map(l=> `<option value="${l}">${l} Layers</option>`).join('')
      : `<option value="">Select inches first</option>`;
  });
  row.querySelector('.tier-preview-btn').addEventListener('click', ()=> openTierPreview(index));
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

// The full set of tier numbers that should currently have a row: every
// checked preset (1/2/3/4/5+) contributes its own number, and a checked
// Custom contributes 1..N for whatever count was typed.
function getDesiredTierNumbers(){
  const numbers = new Set();
  tierSelectEl.querySelectorAll('.tier-option input[data-count]:checked').forEach(input=>{
    numbers.add(Number(input.dataset.count));
  });
  if(tierCustomCheckbox.checked){
    const n = Math.min(MAX_CUSTOM_TIERS, Math.max(0, Math.floor(Number(tierCustomCount.value)) || 0));
    for(let i = 1; i <= n; i++) numbers.add(i);
  }
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

document.getElementById('cakeForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const occasion = document.getElementById('cakeOccasion').value;
  const tierInputs = Array.from(document.querySelectorAll('#tierSelect input:checked'));
  const date = document.getElementById('cakeDate').value;
  const flavor = document.getElementById('cakeFlavor').value;
  const finish = document.getElementById('cakeFinish').value;
  const inscription = document.getElementById('cakeInscription').value;
  const design = document.getElementById('cakeDesign').value;
  const name = document.getElementById('cakeName').value;
  const phone = document.getElementById('cakePhone').value;
  const deliveryAddress = cakeDeliveryAddressInput.value.trim();

  if(!occasion || !tierInputs.length || !date || !flavor || !cakeDelivery || !name || !phone){
    showToast('Please fill all required fields marked with *');
    return;
  }
  if(!isValidPhone(phone)){
    showToast('Please enter a valid WhatsApp number.');
    document.getElementById('cakePhone').focus();
    return;
  }
  if(tierCustomCheckbox.checked && !(Number(tierCustomCount.value) > 0)){
    showToast('Please type how many tiers for your custom option.');
    tierCustomCount.focus();
    return;
  }
  if(cakeDelivery === 'Delivery' && !deliveryAddress){
    showToast('Please add your delivery location.');
    cakeDeliveryAddressInput.focus();
    return;
  }

  const tierDetails = [];
  const tierRows = tierConfigEl.querySelectorAll('.tier-row');
  for(const row of tierRows){
    const inches = row.querySelector('.tier-inches').value;
    const layers = row.querySelector('.tier-layers').value;
    if(!inches || !layers){
      showToast('Please select inches and layers for every tier.');
      return;
    }
    tierDetails.push(`Tier ${row.dataset.index}: ${inches}" — ${layers} layers`);
  }

  const lines = [
    `Hello ${CONFIG.businessName}! I'd like to place a *Custom Cake* request.`,
    ``,
    `*Occasion:* ${occasion}`,
    `*Tiers/Steps:* ${tierInputs.map(i=> i === tierCustomCheckbox ? `Custom (${tierCustomCount.value} Tiers)` : i.value).join(', ')}`,
    tierDetails.length ? `*Tier Details:*` : null,
    ...tierDetails.map(t=> `• ${t}`),
    `*Date Needed:* ${date}`,
    `*Flavor:* ${flavor}`,
    finish ? `*Icing/Finish:* ${finish}` : null,
    inscription ? `*Inscription:* ${inscription}` : null,
    design ? `*Design Inspiration:* ${design}` : null,
    `*Delivery:* ${cakeDelivery}`,
    deliveryAddress ? `*Delivery Location:* ${deliveryAddress}` : null,
    ``,
    `*Name:* ${name}`,
    `*WhatsApp Number:* ${phone}`,
  ].filter(Boolean).join('\n');

  openWhatsApp(lines);
  showToast('Opening WhatsApp with your cake request…');
});

/* ============================================================
   CAKE GALLERY PICKER — a small curated set of past cake photos
   for inspiration. Closing it (X, backdrop click, or Escape)
   only toggles this modal's own class, so #cakeForm's fields are
   left untouched and the order continues right where it was.
============================================================ */
const cakeGalleryItems = [
  { caption: 'Under the Chandeliers', image: mediaUrl('img/504807796_9099742323462413_1120354441484283313_n.jpg') },
  { caption: 'The Six-Tier Reveal', image: mediaUrl('img/503736309_9061189193984393_2635635431881218558_n.jpg') },
  { caption: 'Crystal Base, Ivory Tiers', image: mediaUrl('img/504685489_9085240854912560_3651136197304790624_n.jpg') },
  { caption: 'For Mummy, With Love', image: mediaUrl('img/503084596_9068281273275185_5558051441541664408_n.jpg') },
  { caption: 'The Boss Cake', image: mediaUrl('img/503416798_9068281249941854_7585160892651594669_n.jpg') },
  { caption: 'A Pot Worth Celebrating', image: mediaUrl('img/505753228_9109996449103667_9107171079224956350_n.jpg') },
];
const cakeGalleryGrid = document.getElementById('cakeGalleryGrid');
cakeGalleryItems.forEach(item=>{
  const el = document.createElement('div');
  el.className = 'media-frame';
  el.innerHTML = `<img src="${item.image}" alt="${item.caption}" loading="lazy"><div class="ring"></div>`;
  el.addEventListener('click', ()=> openLightbox(item));
  cakeGalleryGrid.appendChild(el);
});

const cakeGalleryModal = document.getElementById('cakeGalleryModal');
document.getElementById('viewCakeGalleryBtn').addEventListener('click', ()=> openModal(cakeGalleryModal));
document.getElementById('cakeGalleryClose').addEventListener('click', ()=> closeModal(cakeGalleryModal));
document.getElementById('cakeGalleryBackdrop').addEventListener('click', ()=> closeModal(cakeGalleryModal));
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && cakeGalleryModal.classList.contains('open')) closeModal(cakeGalleryModal); });

/* ============================================================
   TIER QUICK LOOK — 3 photos per tier count, shown when the
   "Preview" link on a tier-row is clicked. Fill in the 3 images
   you want for each number below by replacing `image: null` with
   image: mediaUrl('img/your-file.jpg'). Leaving image: null keeps
   an empty placeholder frame with the caption text.
============================================================ */
const TIER_PREVIEW_IMAGES = {
  1: [
    { image: null, caption: '1 Tier — photo 1' },
    { image: null, caption: '1 Tier — photo 2' },
    { image: null, caption: '1 Tier — photo 3' },
  ],
  2: [
    { image: null, caption: '2 Tiers — photo 1' },
    { image: null, caption: '2 Tiers — photo 2' },
    { image: null, caption: '2 Tiers — photo 3' },
  ],
  3: [
    { image: null, caption: '3 Tiers — photo 1' },
    { image: null, caption: '3 Tiers — photo 2' },
    { image: null, caption: '3 Tiers — photo 3' },
  ],
  4: [
    { image: null, caption: '4 Tiers — photo 1' },
    { image: null, caption: '4 Tiers — photo 2' },
    { image: null, caption: '4 Tiers — photo 3' },
  ],
  5: [
    { image: null, caption: '5+ Tiers — photo 1' },
    { image: null, caption: '5+ Tiers — photo 2' },
    { image: null, caption: '5+ Tiers — photo 3' },
  ],
};
const tierPreviewModal = document.getElementById('tierPreviewModal');
const tierPreviewGrid = document.getElementById('tierPreviewGrid');
const tierPreviewTitle = document.getElementById('tierPreviewTitle');

function openTierPreview(tierNumber){
  const items = TIER_PREVIEW_IMAGES[tierNumber] || [];
  tierPreviewTitle.textContent = `${tierNumber} Tier${tierNumber > 1 ? 's' : ''} — Quick Look`;
  tierPreviewGrid.innerHTML = items.map(item=> item.image
    ? `<div class="media-frame"><img src="${item.image}" alt="${item.caption}" loading="lazy"><div class="ring"></div></div>`
    : `<div class="media-frame" style="aspect-ratio:4/5;"><div class="ring"></div><span class="cap">${item.caption}</span></div>`
  ).join('');
  openModal(tierPreviewModal);
}
document.getElementById('tierPreviewClose').addEventListener('click', ()=> closeModal(tierPreviewModal));
document.getElementById('tierPreviewBackdrop').addEventListener('click', ()=> closeModal(tierPreviewModal));
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && tierPreviewModal.classList.contains('open')) closeModal(tierPreviewModal); });

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
  { id:'meat-pie', name:'Meat Pie', desc:'Buttery pastry, seasoned minced meat', unit:'pack of 12', price:1000, icon: ICONS.platter },
  { id:'cake-slices', name:'Cake Slices', desc:'Delicious cake slices for any occasion', unit:'slice', price:3500, icon: ICONS.platter, needsFlavour:true },
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
      <span class="m-icon">${ICONS.platter}</span>
      <div class="m-body">
        <h4>Small Chops</h4>
        <p>Puff puff, spring rolls, samosa & sausage rolls — choose plate or tray</p>
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
  return wrap;
}

/* Chin Chin: option buttons -> Qty */
function buildChinChinItem(){
  const wrap = document.createElement('div');
  wrap.className = 'menu-item has-extra';
  wrap.innerHTML = `
    <div class="m-top">
      <span class="m-icon">${ICONS.platter}</span>
      <div class="m-body">
        <h4>Chin Chin</h4>
        <p>Crunchy, lightly sweetened bites — choose your size</p>
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
  return wrap;
}

ffWidgets.push(buildSmallChopsItem(), buildChinChinItem());
ffWidgets.forEach(w=> fingerFoodList.appendChild(w));

fingerFoodMenu.forEach(item=>{
  const row = document.createElement('div');
  row.className = 'menu-item' + (item.needsFlavour ? ' has-extra' : '');
  row.innerHTML = `
    <div class="m-top">
      <span class="m-icon">${item.icon}</span>
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

document.getElementById('ffSubmit').addEventListener('click', ()=>{
  const name = document.getElementById('ffName').value;
  const phone = document.getElementById('ffPhone').value;
  const addressEl = document.getElementById('ffAddress');
  const address = addressEl.value.trim();
  const date = document.getElementById('ffDate').value;
  const notes = document.getElementById('ffNotes').value;
  if(!name || !phone){ showToast('Please add your name and WhatsApp number.'); return; }
  if(!isValidPhone(phone)){
    showToast('Please enter a valid WhatsApp number.');
    document.getElementById('ffPhone').focus();
    return;
  }
  if(!address){ showToast('Please add your delivery location.'); addressEl.focus(); return; }

  for(const item of ALL_FF_ITEMS){
    if(item.needsFlavour && ffState[item.id] > 0 && !ffFlavours[item.id]){
      showToast(`Please select a flavour for ${item.name}.`);
      document.getElementById(`ff-flavour-${item.id}`).focus();
      return;
    }
  }

  const items = ALL_FF_ITEMS.filter(i=> ffState[i.id] > 0)
    .map(i=>{
      const flavourNote = i.needsFlavour && ffFlavours[i.id] ? ` — Flavour: ${ffFlavours[i.id]}` : '';
      return `• ${i.name} × ${ffState[i.id]} (${fmtNaira(i.price * ffState[i.id])})${flavourNote}`;
    });
  let total = ALL_FF_ITEMS.reduce((sum,i)=> sum + i.price * ffState[i.id], 0);

  const lines = [
    `Hello ${CONFIG.businessName}! I'd like to place a *Finger Food* order.`,
    ``,
    `*Items:*`,
    ...items,
    ``,
    `*Estimated Total:* ${fmtNaira(total)}`,
    `*Delivery Location:* ${address}`,
    date ? `*Date Needed:* ${date}` : null,
    notes ? `*Notes:* ${notes}` : null,
    ``,
    `*Name:* ${name}`,
    `*WhatsApp Number:* ${phone}`,
  ].filter(Boolean).join('\n');

  openWhatsApp(lines);
  showToast('Opening WhatsApp with your order…');
});

/* ============================================================
   CATERING — Soups, Rice, Proteins (liter/qty based)
============================================================ */
const cateringSoups = [
  { id:'afang', name:'Afang Soup', desc:'Waterleaf, afang leaf, assorted meat or fish', icon: ICONS.bowl },
  { id:'edikang-ikong', name:'Edikang Ikong', desc:'Ugu & waterleaf, rich with assorted meat', icon: ICONS.bowl },
  { id:'atama', name:'Atama Soup', desc:'Atama leaf, periwinkle & assorted meat', icon: ICONS.bowl },
  { id:'white-soup', name:'White Soup', desc:'Catfish soup, native spice base', icon: ICONS.bowl },
  { id:'egusi', name:'Egusi Soup', desc:'Melon seed, assorted meat or fish', icon: ICONS.bowl },
];
const literOptions = [
  { label:'3L', price:15000 }, { label:'5L', price:23000 }, { label:'10L', price:42000 },
];
const SOUP_PROTEINS = ['Goat meat', 'Beef', 'Fish', 'Cow Leg'];

const cateringRice = [
  { id:'jollof', name:'Jollof Rice', desc:'Smoky party-style jollof', icon: ICONS.rice },
  { id:'fried-rice', name:'Fried Rice', desc:'Mixed vegetables, Nigerian-style', icon: ICONS.rice },
  { id:'coconut-rice', name:'Coconut Rice', desc:'Rich coconut milk base', icon: ICONS.rice },
];
// Lunchpack = personal portion, Tray = serves 10. Classic adds a side.
const RICE_TYPES = ['Lunchpack', 'Tray'];
const RICE_STYLES = ['Standard', 'Classic'];
const RICE_SIDES = ['Salad', 'Plantain'];
const RICE_PRICING = {
  Lunchpack: { Standard: 2500, Classic: 3000 },
  Tray: { Standard: 20000, Classic: 24000 },
};
const RICE_STYLE_NOTES = {
  Standard: 'Standard has just Rice and Chicken.',
  Classic: 'Classic has Rice, Chicken and Sides (Salad/Plantain).',
};

const cateringProteins = [
  { id:'chicken', name:'Chicken', unit:'per portion', price:2500, icon: ICONS.meat },
  { id:'turkey', name:'Turkey', unit:'per portion', price:3000, icon: ICONS.meat },
  { id:'beef', name:'Beef', unit:'per portion', price:2200, icon: ICONS.meat },
  { id:'fish', name:'Fish (Titus/Croaker)', unit:'per portion', price:3200, icon: ICONS.meat },
];

const catState = { soups:{}, rice:{}, proteins:{} };

/* Soup: pick a litre size, then which protein it should be made
   with — the protein choice doesn't change price, it just specifies
   the order (soup pricing already assumes assorted meat/fish). */
function buildSoupRow(item){
  const row = document.createElement('div');
  row.className = 'menu-item has-extra';
  row.innerHTML = `
    <div class="m-top">
      <span class="m-icon">${item.icon}</span>
      <div class="m-body"><h4>${item.name}</h4><p>${item.desc}</p></div>
    </div>
    <div class="m-extra">
      <span class="m-extra-label">Size</span>
      <div class="liter-chips" data-role="size">
        ${literOptions.map(o=> `<button type="button" class="liter-chip" data-label="${o.label}" data-price="${o.price}">${o.label}</button>`).join('')}
      </div>
    </div>
    <div class="m-extra" data-role="protein-wrap" style="display:none;">
      <span class="m-extra-label">Protein</span>
      <div class="liter-chips" data-role="protein">
        ${SOUP_PROTEINS.map(p=> `<button type="button" class="liter-chip" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>`;

  const sel = { label:'', price:0, protein:'' };
  const sizeWrap = row.querySelector('[data-role="size"]');
  const proteinWrap = row.querySelector('[data-role="protein-wrap"]');
  const proteinChips = row.querySelector('[data-role="protein"]');

  function commit(){
    if(sel.label && sel.protein){
      catState.soups[item.id] = { name:item.name, label:`${sel.label} — ${sel.protein}`, price: sel.price };
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
        sel.label = ''; sel.price = 0; sel.protein = '';
        proteinWrap.style.display = 'none';
      } else {
        chip.classList.add('selected');
        sel.label = chip.dataset.label;
        sel.price = Number(chip.dataset.price);
        sel.protein = '';
        proteinWrap.style.display = 'block';
      }
      commit();
    });
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
  row.innerHTML = `
    <div class="m-top">
      <span class="m-icon">${item.icon}</span>
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
      <p class="form-note sc-note" data-role="style-note" style="display:none;"></p>
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
  const styleNoteEl = row.querySelector('[data-role="style-note"]');
  const sidesWrap = row.querySelector('[data-role="sides-wrap"]');
  const sidesChips = row.querySelector('[data-role="sides"]');

  function commit(){
    if(sel.type && sel.style && (sel.style !== 'Classic' || sel.sides)){
      const price = RICE_PRICING[sel.type][sel.style];
      const labelBits = [sel.type, sel.style];
      if(sel.sides) labelBits.push(`Side: ${sel.sides}`);
      catState.rice[item.id] = { name: item.name, label: labelBits.join(' — '), price };
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
      styleNoteEl.style.display = 'none';
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
        styleNoteEl.style.display = 'none';
      } else {
        chip.classList.add('selected');
        sel.style = chip.dataset.value;
        sidesWrap.style.display = sel.style === 'Classic' ? 'block' : 'none';
        styleNoteEl.textContent = RICE_STYLE_NOTES[sel.style];
        styleNoteEl.style.display = 'block';
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
    <span class="m-icon">${item.icon}</span>
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
    count++; total += s.price;
    const row = document.createElement('div'); row.className = 'summary-row';
    row.innerHTML = `<div><div class="s-name">${s.name} — ${s.label}</div><div class="s-meta">${fmtNaira(s.price)}</div></div>`;
    listEl.appendChild(row);
  });
  Object.values(catState.rice).forEach(r=>{
    count++; total += r.price;
    const row = document.createElement('div'); row.className = 'summary-row';
    row.innerHTML = `<div><div class="s-name">${r.name} — ${r.label}</div><div class="s-meta">${fmtNaira(r.price)}</div></div>`;
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

let catServiceType = '';
document.querySelectorAll('#catServiceType .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#catServiceType .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    catServiceType = c.dataset.value;
  });
});

const catAddressField = document.getElementById('catAddressField');
const catAddressInput = document.getElementById('catAddress');
let catDelivery = '';
document.querySelectorAll('#catDelivery .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#catDelivery .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    catDelivery = c.dataset.value;
    const needsAddress = catDelivery === 'Delivery';
    catAddressField.style.display = needsAddress ? 'block' : 'none';
    if(!needsAddress) catAddressInput.value = '';
  });
});

document.getElementById('catSubmit').addEventListener('click', ()=>{
  const eventType = document.getElementById('catEventType').value;
  const guests = document.getElementById('catGuests').value;
  const date = document.getElementById('catDate').value;
  const name = document.getElementById('catName').value;
  const phone = document.getElementById('catPhone').value;
  const address = catAddressInput.value.trim();
  const notes = document.getElementById('catNotes').value;

  if(!eventType || !catDelivery || !name || !phone){ showToast('Please fill all required fields marked with *'); return; }
  if(!isValidPhone(phone)){
    showToast('Please enter a valid WhatsApp number.');
    document.getElementById('catPhone').focus();
    return;
  }
  if(catDelivery === 'Delivery' && !address){ showToast('Please add your venue/delivery location.'); catAddressInput.focus(); return; }

  const soupLines = Object.values(catState.soups).map(s=> `• ${s.name} — ${s.label} (${fmtNaira(s.price)})`);
  const riceLines = Object.values(catState.rice).map(r=> `• ${r.name} — ${r.label} (${fmtNaira(r.price)})`);
  const proteinLines = cateringProteins.filter(p=> catState.proteins[p.id] > 0)
    .map(p=> `• ${p.name} × ${catState.proteins[p.id]} (${fmtNaira(p.price * catState.proteins[p.id])})`);
  const total = Object.values(catState.soups).reduce((s,x)=>s+x.price,0)
    + Object.values(catState.rice).reduce((s,x)=>s+x.price,0)
    + cateringProteins.reduce((s,p)=> s + p.price * catState.proteins[p.id], 0);

  const lines = [
    `Hello ${CONFIG.businessName}! I'd like to place a *Catering / Bulk Order* request.`,
    ``,
    `*Event Type:* ${eventType}`,
    guests ? `*Guest Count:* ${guests}` : null,
    date ? `*Event Date:* ${date}` : null,
    catServiceType ? `*Service Type:* ${catServiceType}` : null,
    ``,
    soupLines.length ? `*Soups:*` : null, ...soupLines,
    riceLines.length ? `*Rice & Sides:*` : null, ...riceLines,
    proteinLines.length ? `*Proteins:*` : null, ...proteinLines,
    ``,
    `*Estimated Total:* ${fmtNaira(total)}`,
    `*Delivery:* ${catDelivery}`,
    address ? `*Venue/Delivery Location:* ${address}` : null,
    notes ? `*Notes:* ${notes}` : null,
    ``,
    `*Name:* ${name}`,
    `*WhatsApp Number:* ${phone}`,
  ].filter(Boolean).join('\n');

  openWhatsApp(lines);
  showToast('Opening WhatsApp with your catering request…');
});

renderFF();
renderCatering();
/* ============================================================
   MINI CART — context-aware sticky bar + review sheet

   Problem: at <=980px .menu-layout collapses to one column, which
   stacks the order summary below the entire menu list. A customer
   building an order has no idea what their running total is until
   they've scrolled past every item — so they can't tell when to
   stop adding. This keeps the total on screen permanently and
   gives them a sheet to review/adjust mid-order.

   Deliberately NOT a toast per tap: that's noise on mobile. The
   only per-add feedback is in-place (digit pulse, badge pop, and a
   persistent wine rule on cards already in the cart).
============================================================ */
const cartBar        = document.getElementById('cartBar');
const cartSheet      = document.getElementById('cartSheet');
const cartBarBadge   = document.getElementById('cartBarBadge');
const cartBarLabel   = document.getElementById('cartBarLabel');
const cartBarTotal   = document.getElementById('cartBarTotal');
const cartBarCta     = document.getElementById('cartBarCta');
const cartSheetList  = document.getElementById('cartSheetList');
const cartSheetPanel = cartSheet.querySelector('.cart-sheet-panel');

/* Each cart exposes the same shape so the bar/sheet stay generic. */
const CART_SOURCES = {
  ff: {
    sectionId: 'finger-foods',
    title: 'Finger Foods Order',
    checkoutId: 'ffCheckout',
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
    sectionId: 'catering',
    title: 'Catering Order',
    checkoutId: 'catCheckout',
    lines(){
      const out = [];
      // Soups and rice are a single size selection, not a quantity —
      // so they get a remove action rather than a +/- stepper.
      Object.entries(catState.soups).forEach(([key, s])=>
        out.push({ id:`soup:${key}`, name:`${s.name} — ${s.label}`, qty:1, unitPrice:s.price, stepper:false }));
      Object.entries(catState.rice).forEach(([key, r])=>
        out.push({ id:`rice:${key}`, name:`${r.name} — ${r.label}`, qty:1, unitPrice:r.price, stepper:false }));
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
  }
};

/* Which cart the bar is currently showing — decided by whichever
   menu section is crossing the middle of the viewport. */
let activeCart = null;
['finger-foods','catering'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(!e.isIntersecting) return;
      activeCart = e.target.id === 'finger-foods' ? 'ff' : 'cat';
      updateCartBar();
    });
  }, { rootMargin: '-45% 0px -45% 0px' }).observe(el);
});

let lastCartCount = 0;
let cartAnnounceTimer;

function announceCart(count, total){
  // Debounced so rapid +/- taps don't flood a screen reader.
  clearTimeout(cartAnnounceTimer);
  cartAnnounceTimer = setTimeout(()=>{
    document.getElementById('cartLive').textContent =
      `${count} item${count === 1 ? '' : 's'} in your order. Estimated total ${fmtNaira(total)}.`;
  }, 600);
}

function hideCartBar(){
  cartBar.classList.remove('show');
  document.body.classList.remove('cart-bar-visible');
  setTimeout(()=>{ if(!cartBar.classList.contains('show')) cartBar.hidden = true; }, 450);
}

function updateCartBar(){
  if(!activeCart){ hideCartBar(); return; }
  const src = CART_SOURCES[activeCart];
  const lines = src.lines();
  const count = lines.reduce((n,l)=> n + l.qty, 0);
  const total = lines.reduce((n,l)=> n + l.qty * l.unitPrice, 0);

  renderCartSheet();

  if(!count){
    hideCartBar();
    lastCartCount = 0;
    if(cartSheet.classList.contains('open')) closeCartSheet();
    return;
  }

  cartBarBadge.textContent = count;
  cartBarLabel.textContent = `${count} item${count === 1 ? '' : 's'} · tap to review`;
  cartBarTotal.textContent = fmtNaira(total);

  cartBar.hidden = false;
  requestAnimationFrame(()=>{
    cartBar.classList.add('show');
    document.body.classList.add('cart-bar-visible');
  });

  if(count !== lastCartCount){
    cartBarBadge.classList.remove('pop');
    void cartBarBadge.offsetWidth; // force reflow so the animation re-runs
    cartBarBadge.classList.add('pop');
    announceCart(count, total);
  }
  lastCartCount = count;
}

function renderCartSheet(){
  if(!activeCart) return;
  const src = CART_SOURCES[activeCart];
  const lines = src.lines();
  const total = lines.reduce((n,l)=> n + l.qty * l.unitPrice, 0);

  document.getElementById('cartSheetTitle').textContent = src.title;
  document.getElementById('cartSheetTotal').textContent = fmtNaira(total);
  cartSheetList.innerHTML = '';

  if(!lines.length){
    const empty = document.createElement('p');
    empty.className = 'cart-sheet-empty';
    empty.textContent = 'Nothing added yet.';
    cartSheetList.appendChild(empty);
    return;
  }

  lines.forEach(line=>{
    const row = document.createElement('div');
    row.className = 'cart-line';

    const body = document.createElement('div');
    body.className = 'cart-line-body';
    const nameEl = document.createElement('div');
    nameEl.className = 'cart-line-name';
    nameEl.textContent = line.qty > 1 ? `${line.name} × ${line.qty}` : line.name;
    const priceEl = document.createElement('div');
    priceEl.className = 'cart-line-price';
    priceEl.textContent = fmtNaira(line.qty * line.unitPrice);
    body.append(nameEl, priceEl);
    row.appendChild(body);

    const ctrl = document.createElement('div');
    ctrl.className = 'cart-line-qty';
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
    cartSheetList.appendChild(row);
  });
}

function openCartSheet(){
  renderCartSheet();
  openModal(cartSheet);              // reuses the shared focus trap
  document.body.classList.add('sheet-open');
  cartBarCta.setAttribute('aria-expanded', 'true');
}
function closeCartSheet(){
  closeModal(cartSheet);
  document.body.classList.remove('sheet-open');
  cartBarCta.setAttribute('aria-expanded', 'false');
}

cartBarCta.addEventListener('click', openCartSheet);
document.getElementById('cartSheetClose').addEventListener('click', closeCartSheet);
document.getElementById('cartSheetBackdrop').addEventListener('click', closeCartSheet);
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && cartSheet.classList.contains('open')) closeCartSheet();
});

document.getElementById('cartSheetCheckout').addEventListener('click', ()=>{
  const src = CART_SOURCES[activeCart];
  closeCartSheet();
  const target = src && document.getElementById(src.checkoutId);
  // Wait for the sheet's close transition before scrolling, or the
  // browser measures the target while the sheet is still overlaying it.
  if(target) setTimeout(()=> target.scrollIntoView({ behavior:'smooth', block:'start' }), 340);
});

/* Swipe-down-to-dismiss. Only engages when the list is scrolled to
   the top, so it never fights the list's own scrolling. */
let sheetTouchStartY = 0, sheetTouchDeltaY = 0;
cartSheetPanel.addEventListener('touchstart', (e)=>{
  sheetTouchStartY = e.touches[0].clientY;
  sheetTouchDeltaY = 0;
}, { passive: true });
cartSheetPanel.addEventListener('touchmove', (e)=>{
  if(cartSheetList.scrollTop > 0) return;
  sheetTouchDeltaY = e.touches[0].clientY - sheetTouchStartY;
  if(sheetTouchDeltaY > 0) cartSheetPanel.style.transform = `translateY(${sheetTouchDeltaY}px)`;
}, { passive: true });
cartSheetPanel.addEventListener('touchend', ()=>{
  cartSheetPanel.style.transform = '';
  if(sheetTouchDeltaY > 90) closeCartSheet();
});

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

function refreshCartUI(){ syncCartStates(); updateCartBar(); }
refreshCartUI();
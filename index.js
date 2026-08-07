/* ============================================================
   CONFIG
============================================================ */
const CONFIG = {
  // La Crème business WhatsApp number. Digits only, country code
  // first, no + and no leading 0.
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
function fmtNaira(n){ return '₦' + n.toLocaleString('en-NG'); }

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
  { caption: 'Wedding cake beneath the chandeliers', icon: ICONS.cake, tone:'', image: 'img/504807796_9099742323462413_1120354441484283313_n.jpg', cls:'g-1' },
  { caption: 'Small chops platter — cocktail hour', icon: ICONS.platter, tone:'tone-b', image: 'img/123520380_2807744082662300_1396207157575276742_n.jpg', cls:'g-2' },
  { caption: 'Birthday cake, made to order', icon: ICONS.cake, tone:'tone-c', image: 'img/503084596_9068281273275185_5558051441541664408_n.jpg', cls:'g-3' },
  { caption: 'Crystal-base wedding tier', icon: ICONS.flower, tone:'tone-b', image: 'img/504685489_9085240854912560_3651136197304790624_n.jpg', cls:'g-5' },
  { caption: 'The six-tier reveal, red & ivory', icon: ICONS.table, tone:'', image: 'img/503736309_9061189193984393_2635635431881218558_n.jpg', cls:'g-6' },
  { caption: 'Custom novelty cakes, made to order', icon: ICONS.gift, tone:'tone-c', image: 'img/505753228_9109996449103667_9107171079224956350_n.jpg', cls:'g-7' },
];

const galleryGrid = document.getElementById('galleryGrid');
galleryItems.forEach((item, i)=>{
  const el = document.createElement('div');
  el.className = `media-frame ${item.tone} ${item.cls}`;
  el.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.caption}"><div class="ring"></div>`
    : `<div class="ring"></div>${item.icon}<span class="cap">${item.caption}</span>`;
  el.addEventListener('click', ()=> openLightbox(item));
  galleryGrid.appendChild(el);
});

/* ============================================================
   VIDEO TESTIMONIAL REEL
   Add a real video by setting `video: "your-video.mp4"` (or an
   embeddable URL) — the play placeholder is swapped automatically.
============================================================ */
const videoTestimonials = [
  { name: 'Bride, Lekki Wedding', video: null, tone:'' },
  { name: 'Host, 40th Birthday', video: null, tone:'tone-b' },
  { name: 'Corporate Client', video: null, tone:'tone-c' },
  { name: 'Naming Ceremony Family', video: null, tone:'' },
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
    ? `<img src="${item.image}" alt="${item.caption}" style="border-radius:2px;">`
    : `<div class="media-frame ${item.tone}" style="aspect-ratio:4/5; border-radius:2px;"><div class="ring"></div>${item.icon}<span class="cap">${item.caption}</span></div>`;
  lightbox.classList.add('open');
}
document.getElementById('lightboxClose').addEventListener('click', ()=> lightbox.classList.remove('open'));
lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) lightbox.classList.remove('open'); });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') lightbox.classList.remove('open'); });

/* ============================================================
   CAKE FORM
============================================================ */
document.querySelectorAll('#tierSelect .tier-option').forEach(opt=>{
  opt.addEventListener('click', ()=>{
    document.querySelectorAll('#tierSelect .tier-option').forEach(o=> o.classList.remove('selected'));
    opt.classList.add('selected');
    opt.querySelector('input').checked = true;
  });
});
let cakeDelivery = '';
document.querySelectorAll('#cakeDelivery .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#cakeDelivery .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    cakeDelivery = c.dataset.value;
  });
});

document.getElementById('cakeForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const occasion = document.getElementById('cakeOccasion').value;
  const tierEl = document.querySelector('#tierSelect input:checked');
  const servings = document.getElementById('cakeServings').value;
  const date = document.getElementById('cakeDate').value;
  const flavor = document.getElementById('cakeFlavor').value;
  const filling = document.getElementById('cakeFilling').value;
  const finish = document.getElementById('cakeFinish').value;
  const inscription = document.getElementById('cakeInscription').value;
  const design = document.getElementById('cakeDesign').value;
  const name = document.getElementById('cakeName').value;
  const phone = document.getElementById('cakePhone').value;

  if(!occasion || !tierEl || !servings || !date || !flavor || !cakeDelivery || !name || !phone){
    showToast('Please fill all required fields marked with *');
    return;
  }

  const lines = [
    `Hello ${CONFIG.businessName}! I'd like to place a *Custom Cake* request.`,
    ``,
    `*Occasion:* ${occasion}`,
    `*Tiers:* ${tierEl.value}`,
    `*Approx. Servings:* ${servings}`,
    `*Date Needed:* ${date}`,
    `*Flavor:* ${flavor}`,
    filling ? `*Filling:* ${filling}` : null,
    finish ? `*Icing/Finish:* ${finish}` : null,
    inscription ? `*Inscription:* ${inscription}` : null,
    design ? `*Design Inspiration:* ${design}` : null,
    `*Delivery:* ${cakeDelivery}`,
    ``,
    `*Name:* ${name}`,
    `*WhatsApp Number:* ${phone}`,
  ].filter(Boolean).join('\n');

  openWhatsApp(lines);
  showToast('Opening WhatsApp with your cake request…');
});

/* ============================================================
   FINGER FOOD MENU — data-driven
============================================================ */
const fingerFoodMenu = [
  { id:'small-chops', name:'Small Chops Platter', desc:'Puff puff, spring rolls, samosa, sausage rolls & chicken skewers', unit:'tray (30 pcs)', price:18000, icon: ICONS.platter },
  { id:'sausage-rolls', name:'Sausage Rolls', desc:'Flaky pastry, seasoned sausage filling', unit:'pack of 20', price:9000, icon: ICONS.platter },
  { id:'egg-rolls', name:'Egg Rolls', desc:'Boiled egg wrapped in soft dough', unit:'pack of 20', price:8500, icon: ICONS.platter },
  { id:'chin-chin', name:'Chin Chin', desc:'Crunchy, lightly sweetened bites', unit:'1 litre pack', price:4500, icon: ICONS.platter },
  { id:'puff-puff', name:'Puff Puff', desc:'Golden fried dough balls', unit:'pack of 25', price:6500, icon: ICONS.platter },
  { id:'spring-rolls', name:'Spring Rolls', desc:'Crispy, vegetable-filled rolls', unit:'pack of 20', price:8000, icon: ICONS.platter },
  { id:'samosa', name:'Samosa', desc:'Spiced beef or vegetable filling', unit:'pack of 20', price:8500, icon: ICONS.platter },
  { id:'meat-pie', name:'Meat Pie', desc:'Buttery pastry, seasoned minced meat', unit:'pack of 12', price:9500, icon: ICONS.platter },
  { id:'fish-rolls', name:'Fish Rolls', desc:'Flaky pastry, spiced fish filling', unit:'pack of 20', price:9000, icon: ICONS.platter },
  { id:'suya-skewers', name:'Peppered Suya Skewers', desc:'Grilled, spiced to order', unit:'pack of 15', price:12000, icon: ICONS.meat },
];

const ffState = {};
const fingerFoodList = document.getElementById('fingerFoodList');
fingerFoodMenu.forEach(item=>{
  ffState[item.id] = 0;
  const row = document.createElement('div');
  row.className = 'menu-item';
  row.innerHTML = `
    <span class="m-icon">${item.icon}</span>
    <div class="m-body">
      <h4>${item.name}</h4>
      <p>${item.desc}</p>
      <div class="m-price">${fmtNaira(item.price)} / ${item.unit}</div>
    </div>
    <div class="qty-control">
      <button type="button" aria-label="Decrease" data-act="dec">−</button>
      <span class="qty-val" id="ff-qty-${item.id}">0</span>
      <button type="button" aria-label="Increase" data-act="inc">+</button>
    </div>`;
  const dec = row.querySelector('[data-act="dec"]');
  const inc = row.querySelector('[data-act="inc"]');
  dec.addEventListener('click', ()=>{ if(ffState[item.id] > 0){ ffState[item.id]--; renderFF(); } });
  inc.addEventListener('click', ()=>{ ffState[item.id]++; renderFF(); });
  fingerFoodList.appendChild(row);
});

function renderFF(){
  let count = 0, total = 0;
  const listEl = document.getElementById('ffList');
  listEl.innerHTML = '';
  fingerFoodMenu.forEach(item=>{
    const qty = ffState[item.id];
    document.getElementById(`ff-qty-${item.id}`).textContent = qty;
    if(qty > 0){
      count += qty; total += qty * item.price;
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `<div><div class="s-name">${item.name} × ${qty}</div><div class="s-meta">${fmtNaira(item.price * qty)}</div></div>
        <button type="button" class="s-remove" data-id="${item.id}">Remove</button>`;
      row.querySelector('.s-remove').addEventListener('click', ()=>{ ffState[item.id] = 0; renderFF(); });
      listEl.appendChild(row);
    }
  });
  document.getElementById('ffCount').textContent = count;
  document.getElementById('ffTotal').textContent = fmtNaira(total);
  document.getElementById('ffEmpty').style.display = count ? 'none' : 'block';
  document.getElementById('ffCheckout').style.display = count ? 'block' : 'none';
}

document.getElementById('ffSubmit').addEventListener('click', ()=>{
  const name = document.getElementById('ffName').value;
  const phone = document.getElementById('ffPhone').value;
  const date = document.getElementById('ffDate').value;
  const notes = document.getElementById('ffNotes').value;
  if(!name || !phone){ showToast('Please add your name and WhatsApp number.'); return; }

  const items = fingerFoodMenu.filter(i=> ffState[i.id] > 0)
    .map(i=> `• ${i.name} × ${ffState[i.id]} (${fmtNaira(i.price * ffState[i.id])})`);
  let total = fingerFoodMenu.reduce((sum,i)=> sum + i.price * ffState[i.id], 0);

  const lines = [
    `Hello ${CONFIG.businessName}! I'd like to place a *Finger Food* order.`,
    ``,
    `*Items:*`,
    ...items,
    ``,
    `*Estimated Total:* ${fmtNaira(total)}`,
    date ? `*Date Needed:* ${date}` : null,
    notes ? `*Notes/Address:* ${notes}` : null,
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
  { id:'afang', name:'Afang Soup', desc:'Waterleaf, afang leaf, assorted meat & fish', icon: ICONS.bowl },
  { id:'edikang-ikong', name:'Edikang Ikong', desc:'Ugu & waterleaf, rich with assorted meat', icon: ICONS.bowl },
  { id:'atama', name:'Atama Soup', desc:'Atama leaf, periwinkle & assorted meat', icon: ICONS.bowl },
  { id:'white-soup', name:'White Soup (Nsala)', desc:'Peppery catfish soup, native spice base', icon: ICONS.bowl },
  { id:'banga', name:'Banga Soup', desc:'Palm fruit extract, native to the Delta', icon: ICONS.bowl },
  { id:'egusi', name:'Egusi Soup', desc:'Melon seed, assorted meat & fish', icon: ICONS.bowl },
  { id:'ofe-owerri', name:'Ofe Owerri', desc:'Mixed vegetable, assorted meat & fish', icon: ICONS.bowl },
];
const literOptions = [
  { label:'3L', price:15000 }, { label:'5L', price:23000 }, { label:'10L', price:42000 }, { label:'20L', price:78000 },
];

const cateringRice = [
  { id:'jollof', name:'Jollof Rice', desc:'Smoky party-style jollof', icon: ICONS.rice },
  { id:'fried-rice', name:'Fried Rice', desc:'Mixed vegetables, Nigerian-style', icon: ICONS.rice },
  { id:'coconut-rice', name:'Coconut Rice', desc:'Rich coconut milk base', icon: ICONS.rice },
  { id:'ofada', name:'Ofada Rice + Ayamase', desc:'Local rice with pepper sauce', icon: ICONS.rice },
];
const traySizeOptions = [
  { label:'Small (serves 15)', price:20000 }, { label:'Medium (serves 30)', price:36000 }, { label:'Large (serves 50)', price:55000 },
];

const cateringProteins = [
  { id:'chicken', name:'Chicken', unit:'per portion', price:2500, icon: ICONS.meat },
  { id:'turkey', name:'Turkey', unit:'per portion', price:3000, icon: ICONS.meat },
  { id:'beef', name:'Beef', unit:'per portion', price:2200, icon: ICONS.meat },
  { id:'goat-meat', name:'Goat Meat (Assorted)', unit:'per portion', price:2800, icon: ICONS.meat },
  { id:'fish', name:'Fish (Titus/Croaker)', unit:'per portion', price:3200, icon: ICONS.meat },
];

const catState = { soups:{}, rice:{}, proteins:{} };

function buildLiterRow(item, group, options){
  const row = document.createElement('div');
  row.className = 'menu-item';
  row.innerHTML = `
    <span class="m-icon">${item.icon}</span>
    <div class="m-body"><h4>${item.name}</h4><p>${item.desc}</p></div>
    <div class="liter-chips" id="chips-${group}-${item.id}">
      ${options.map(o=> `<button type="button" class="liter-chip" data-label="${o.label}" data-price="${o.price}">${o.label}</button>`).join('')}
    </div>`;
  row.querySelectorAll('.liter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const already = chip.classList.contains('selected');
      row.querySelectorAll('.liter-chip').forEach(c=> c.classList.remove('selected'));
      if(!already){
        chip.classList.add('selected');
        catState[group][item.id] = { name:item.name, label: chip.dataset.label, price: Number(chip.dataset.price) };
      } else {
        delete catState[group][item.id];
      }
      renderCatering();
    });
  });
  return row;
}

const soupList = document.getElementById('soupList');
cateringSoups.forEach(item=> soupList.appendChild(buildLiterRow(item, 'soups', literOptions)));

const riceList = document.getElementById('riceList');
cateringRice.forEach(item=> riceList.appendChild(buildLiterRow(item, 'rice', traySizeOptions)));

const proteinList = document.getElementById('proteinList');
cateringProteins.forEach(item=>{
  catState.proteins[item.id] = 0;
  const row = document.createElement('div');
  row.className = 'menu-item';
  row.innerHTML = `
    <span class="m-icon">${item.icon}</span>
    <div class="m-body"><h4>${item.name}</h4><div class="m-price">${fmtNaira(item.price)} ${item.unit}</div></div>
    <div class="qty-control">
      <button type="button" aria-label="Decrease" data-act="dec">−</button>
      <span class="qty-val" id="cat-qty-${item.id}">0</span>
      <button type="button" aria-label="Increase" data-act="inc">+</button>
    </div>`;
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
}

let catServiceType = '';
document.querySelectorAll('#catServiceType .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#catServiceType .chip').forEach(x=> x.classList.remove('active'));
    c.classList.add('active');
    catServiceType = c.dataset.value;
  });
});

document.getElementById('catSubmit').addEventListener('click', ()=>{
  const eventType = document.getElementById('catEventType').value;
  const guests = document.getElementById('catGuests').value;
  const date = document.getElementById('catDate').value;
  const name = document.getElementById('catName').value;
  const phone = document.getElementById('catPhone').value;
  const notes = document.getElementById('catNotes').value;

  if(!eventType || !name || !phone){ showToast('Please fill all required fields marked with *'); return; }

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
    notes ? `*Venue/Notes:* ${notes}` : null,
    ``,
    `*Name:* ${name}`,
    `*WhatsApp Number:* ${phone}`,
  ].filter(Boolean).join('\n');

  openWhatsApp(lines);
  showToast('Opening WhatsApp with your catering request…');
});

renderFF();
renderCatering();
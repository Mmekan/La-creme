/* ============================================================
   SHARED CONFIG — loaded by BOTH index.html and gallery.html
   (via <script src="config.js" defer> before index.js/gallery.js).

   Change the WhatsApp number or the R2 bucket URL here ONCE —
   every page reads from this single file, so nothing can drift
   out of sync between index.js and gallery.js again.
============================================================ */
const CONFIG = {
  // La Crème business WhatsApp number. Digits only, country code
  // first, no + and no leading 0. e.g. 0803 123 4567 -> "2348031234567"
  whatsappNumber: '2348066556677',
  businessName: 'La Crème',

  // Base URL of the order API Worker (see worker/README.md). Orders are
  // logged to it and the admin page (admin.html) reads from it. Leave ''
  // to disable logging (orders still go to WhatsApp).
  ordersApi: 'https://la-creme-orders.lacreme.workers.dev'
};

/* ============================================================
   MEDIA CATEGORIES — single source of truth for every gallery
   filter tab, the cake modal's tabs, and the upload page's
   dropdown (upload.js). Order matters: it is the on-screen tab
   order in gallery.html and index.html.

   NOTE FOR THE WORKER: worker/index.js carries its own copy of
   this list (it cannot import config.js — that file calls
   document.getElementById at load). The two must stay in sync.
   Task 3 Step 4 verifies the server rejects an unknown category,
   so drift fails loudly rather than silently.
============================================================ */
const MEDIA_CATEGORIES = [
  'Traditional Wedding Cakes',
  'Anniversary',
  'Cakes for Boys',
  'Cakes for Girls',
  'Cakes for Men',
  'Cakes for Women',
  'Wedding Cakes',
  'Catering & Events',
  'Small Chops',
];

// Cake-only subset, derived rather than hand-listed so it can never
// drift from MEDIA_CATEGORIES again (that drift is what stranded 23
// 'Cakes'-tagged photos on no tab at all). Consumers: gallery.js's
// 'Cakes' aggregate count and index.js's cake-design modal.
const CAKE_FILTER_CATEGORIES = MEDIA_CATEGORIES.filter(c => c !== 'Catering & Events' && c !== 'Small Chops');

const contactPhoneDisplayEl = document.getElementById('contactPhoneDisplay');
if(contactPhoneDisplayEl){
  // Shown to visitors in local format (0806 655 6677), not the +234
  // international format waLink()/CONFIG.whatsappNumber need for the
  // wa.me link itself — strip the '234' country code and dial it
  // locally instead, same as everyone already has it saved as.
  const localNumber = '0' + CONFIG.whatsappNumber.replace(/^234/, '');
  contactPhoneDisplayEl.textContent = localNumber.replace(/(\d{4})(\d{3})(\d+)/, '$1 $2 $3');
}

function waLink(message){
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
/* Opens WhatsApp, and survives a blocked popup rather than failing
   silently — which is the common case in the in-app browsers (Instagram,
   Facebook) that most of this traffic arrives from.

   Note the deliberate absence of 'noopener' in the feature string: per
   spec window.open() returns null when noopener is set, so there'd be no
   way to tell "blocked" from "opened fine". We ask for a handle instead
   and sever opener ourselves. If we got no handle the popup was blocked,
   so we navigate this tab to WhatsApp instead — a same-tab navigation
   from inside a user gesture is never blocked. The in-progress cart is
   already saved to localStorage, so coming back restores it. */
function openWhatsApp(message){
  const url = waLink(message);
  let win = null;
  try{ win = window.open(url, '_blank'); }catch(e){ win = null; }
  if(win){
    try{ win.opener = null; }catch(e){ /* cross-origin once it navigates */ }
    return true;
  }
  window.location.href = url;
  return false;
}
function fmtNaira(n){ return '₦' + n.toLocaleString('en-NG'); }

/* ============================================================
   ORDER NUMBERS + ORDER LOG

   Every order gets a reference the customer and the kitchen can both
   quote: date + time down to the millisecond + the customer's initials,
   e.g. 20260921-091533123-GI. The millisecond field is what makes it
   unique; initials just make it human-recognisable in a WhatsApp thread.

   logOrder() posts the same order to the order API so there's a
   record even if the customer never actually sends the WhatsApp message
   (view them in admin.html). It's deliberately fire-and-forget: sendBeacon
   survives the page navigating away to WhatsApp a moment later, and a failed log must
   never block or delay the order itself.
============================================================ */
function orderInitials(name){
  const letters = String(name || '')
    .split(/\s+/)
    .map(word=> (word.match(/[A-Za-z]/) || [''])[0])
    .filter(Boolean)
    .slice(0, 3)
    .join('')
    .toUpperCase();
  return letters || 'XX';
}

function generateOrderNumber(name){
  const d = new Date();
  const p = (n, len = 2)=> String(n).padStart(len, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
  return `${date}-${time}-${orderInitials(name)}`;
}

// Per-device id, so one visitor's orders are counted together rather than
// every visitor sharing an IP or a carrier's NAT. Kept in localStorage so it
// survives a reload. A private window or a script that clears storage gets a
// fresh id each time — the IP half of the limiter's key (rateLimited in
// worker/index.js) is what covers that.
function deviceId(){
  let id = null;
  try{ id = localStorage.getItem('lcDeviceId'); }catch(e){ /* storage blocked */ }
  if(!id){
    id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
      : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try{ localStorage.setItem('lcDeviceId', id); }catch(e){ /* storage blocked */ }
  }
  return id;
}

// onResult(err, info) is how a page learns the order landed, was refused for
// being too frequent, or never reached the server at all.
//
// A rate-limited order has to be sent with fetch, not sendBeacon: the page
// must read the 429 to challenge the visitor, and only fetch gives it a
// response. The order object is kept by the caller, so the same order can be
// resent after the check is solved instead of rebuilding a cleared cart.
function logOrder(order, onResult){
  if(!CONFIG.ordersApi) return;
  const endpoint = CONFIG.ordersApi.replace(/\/+$/, '') + '/api/orders';
  // text/plain keeps this a "simple" request, so the browser doesn't
  // need a CORS preflight before the order is sent.
  // The device id rides in the body, not a header: sendBeacon below cannot
 // set headers, and a beacon-sent order must be counted against the device
 // just like a fetched one. The Worker reads order.deviceId.
 const body = JSON.stringify({ ...order, deviceId: deviceId() });
  const report = (err, info)=>{ if(typeof onResult === 'function') onResult(err || null, info || {}); };
  try{
    // sendBeacon is fire-and-forget: it reports nothing back, so it is only
    // used when the caller does not need an answer. A caller that passes
    // onResult (the challenge gate) needs the 429, so it always uses fetch.
    if(!onResult && navigator.sendBeacon){
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if(navigator.sendBeacon(endpoint, blob)) return;
    }
    fetch(endpoint, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body
    }).then((res)=> report(res.ok ? null : new Error('refused'),
        res.status === 429 ? { limited: true } : { status: res.status }))
      .catch((err)=> report(err));
  }catch(e){ /* logging must never break checkout */ }
}

/* Shapes already-built cart lines into the invoice's line array:
   { d: description, q: quantity, p: unit price in naira, or null }
   p === null means "price on request" — the invoice prints
   "Price via WhatsApp" and leaves it out of the total, matching how
   the cart already shows priceLabel. Capped to the Worker's
   MAX_INVOICE_LINES (100) so a pathological cart can't push the
   order body past the API's 30 KB limit; the Worker re-validates
   everything it receives and drops what it can't trust. */
function invoiceLines(lines){
  return lines
    .filter(l=> l && l.d)
    .slice(0, 100)
    .map(l=>{
      const out = {
        d: String(l.d).slice(0, 160),
        q: Math.max(1, Math.floor(Number(l.q) || 1)),
        p: l.p == null ? null : Math.max(0, Number(l.p) || 0)
      };
      // Only a string key is sent; a cake line has none.
      const k = typeof l.k === 'string' ? l.k.trim().slice(0, 120) : '';
      if(k) out.k = k;
      // A cake line is priced by the order's spec key, not by its
      // description, so the Worker needs to be told which it is.
      if(l.cake === true) out.cake = true;
      return out;
    });
}

/* ============================================================
   MEDIA (R2) — photos/videos are hosted on Cloudflare R2 rather
   than committed to this repo. Update R2_BASE_URL once the
   bucket's public URL (r2.dev or a custom domain) is known.
============================================================ */
const R2_BASE_URL = 'https://pub-a9f72716b1e94d4bb55753e389d9903d.r2.dev';
function mediaUrl(relPath){ return `${R2_BASE_URL}/${relPath}`; }

/* ============================================================
   ESCAPE HELPER — wrap any dynamic string before it goes into an
   innerHTML template, whenever that string isn't a fixed constant
   you typed yourself (e.g. if testimonials/captions ever start
   coming from a CMS, spreadsheet import, or user submission).
============================================================ */
function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   LIVE CATALOGUE PRICES (R3.4b) — the owner edits menu prices from
   Telegram; this fetches them so the menu shows the real numbers.
   Every price on the page is written from these maps, so a failed
   fetch leaves the baked-in prices exactly as they were — the site
   never blanks a price, and never invents one.
============================================================ */
const PRICES = {
  soups: {},      // 'afang:10L' -> 62000
  rice: {},       // 'jollof:Tray-Classic' -> 24000
  items: {},      // 'meat-pie', 'chicken', 'sc-plate-small' -> 2500
  applied: false,
};

// Reads the catalogue and folds it over the baked-in menu. Never throws
// and never blocks the page: the menu is already rendered from the
// constants when this lands, and only matching keys change anything.
function applyPrices(prices){
  if(!prices || typeof prices !== 'object') return false;
  const num = (v)=> (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0
    ? Number(v) : null;
  for(const [key, raw] of Object.entries(prices)){
    const price = num(raw);
    if(price === null) continue;
    const sep = key.indexOf(':');
    if(sep < 0) PRICES.items[key] = price;
    else {
      // Rice keys are '<id>:<type>-<style>'; soup keys are '<id>:<size>'.
      const tail = key.slice(sep + 1);
      if(/^(lunchpack|tray)-(standard|classic)$/i.test(tail)) PRICES.rice[key] = price;
      else PRICES.soups[key] = price;
    }
  }
  PRICES.applied = true;
  return true;
}

async function loadPrices(){
  if(!CONFIG.ordersApi) return false;
  try{
    const res = await fetch(CONFIG.ordersApi.replace(/\/+$/, '') + '/api/prices');
    if(!res.ok) return false;
    const data = await res.json();
    return applyPrices(data && data.prices);
  }catch(e){
    return false;   // offline, blocked, or the Worker is down: keep the constants
  }
}

// One policy for every category: once the catalogue has loaded it is
// authoritative, so a key it lacks is pending (null) rather than the
// baked-in constant — that constant may be a price the owner has since
// changed. A failed fetch leaves the constants in place, so the menu
// still works offline.
function cataloguePrice(map, key, fallback){
  if(!PRICES.applied) return fallback;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}
// The catalogue key for each line shape, built in exactly one place. The
// menu lookup and the key sent with the order both call these, so a
// displayed price and the server's re-price can never disagree about
// which row they are describing.
function soupKey(id, label){ return `${id}:${label}`; }
function riceKey(id, type, style){ return `${id}:${type}-${style}`; }

// Look-ups in one place, so the rows only ask for a price, never for a key.
function priceOf(itemKey, fallback){ return cataloguePrice(PRICES.items, itemKey, fallback); }
function soupPriceOf(id, label, fallback){ return cataloguePrice(PRICES.soups, soupKey(id, label), fallback); }
function ricePriceOf(id, type, style, fallback){ return cataloguePrice(PRICES.rice, riceKey(id, type, style), fallback); }
function proteinPriceOf(item){ return cataloguePrice(PRICES.items, item.id, item.price); }

// A pending price reads as pending — never as NGN 0, never as a stale
// constant. Chips drop the parenthetical instead (see chipLabel).
function fmtPrice(n){ return n == null ? 'Price via WhatsApp' : fmtNaira(n); }
function chipLabel(label, n){ return n == null ? label : `${label} (${fmtNaira(n)})`; }

// A committed soup/rice cart entry re-resolves its price on every read, so
// a catalogue price that lands after the item was added — or a cart
// restored from an older catalogue — is priced at what the menu says now.
// The entry's own unitPrice is only the pre-catalogue fallback.
function soupEntryPrice(s){
  if(!s) return null;
  return s.sel ? soupPriceOf(s.itemId, s.sel.label, s.unitPrice) : (s.unitPrice || null);
}
function riceEntryPrice(r){
  if(!r) return null;
  return r.sel ? ricePriceOf(r.itemId, r.sel.type, r.sel.style, r.unitPrice) : r.unitPrice;
}

// The one place a cart line becomes a displayed price and a summed amount.
// A line with no catalogue price (unitPrice null) is shown as pending,
// never as NGN 0, and contributes nothing to a typed total.
function lineTotal(line){
  return line.unitPrice == null ? 'Price via WhatsApp' : fmtNaira(line.qty * line.unitPrice);
}
function lineAmount(line){
  return line.unitPrice == null ? 0 : line.qty * line.unitPrice;
}

/* ============================================================
   CAKE SPEC KEY (R3.2) — the price-affecting configuration of a
   cake, as one stable string. Two cakes with the same tiers,
   inches/layers, flavour and finish produce the same key, so the
   catalogue can price a repeat order; occasion, date, inscription
   and design are excluded because none of them change the price.
   Mirrored by worker/bot.js: cakeSpecKey(). Custom and Wedding
   cakes return null — they are always quoted by hand.
============================================================ */
function cakeSpecKey(cake){
  const norm = (s)=> String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
  if(/^wedding$/i.test(String(cake.occasion || '').trim())) return null;
  if(/^custom/i.test(String(cake.tiersLabel || '').trim())) return null;
  return [cake.tiersLabel, (cake.tierDetails || []).slice().sort().join(' ; '), cake.flavor, cake.finish || '']
    .map(norm).filter(Boolean).join('|');
}

/* ============================================================
   PHONE VALIDATION — used by every order form's WhatsApp Number
   field before a message is sent.
============================================================ */
function isValidPhone(value){
  const digits = (value || '').replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 14;
}

/* ============================================================
   MEDIA SKELETON — shared shimmer-loading state for any <img>/
   <video> inserted dynamically into a .media-frame. Call right
   after inserting the element; it adds the shimmer (the "skel"
   class, styled in index.css) and clears it once the media has
   actually loaded, or failed, so slow network image loads never
   just show a blank/empty frame.
============================================================ */
function bindMediaSkeleton(frameEl, mediaEl){
  frameEl.classList.add('skel');
  const clear = ()=> frameEl.classList.remove('skel');
  if(mediaEl.tagName === 'IMG' && mediaEl.complete){ clear(); return; }
  mediaEl.addEventListener(mediaEl.tagName === 'VIDEO' ? 'loadeddata' : 'load', clear, { once:true });
  mediaEl.addEventListener('error', clear, { once:true });
}

/* ============================================================
   MODAL FOCUS MANAGEMENT — shared by every overlay on both pages
   (lightbox, cake gallery, tier preview, news popup). openModal()
   moves focus in and traps Tab/Shift+Tab inside the modal;
   closeModal() releases the trap and returns focus to whatever
   was focused before the modal opened.
============================================================ */
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal(modalEl){
  modalEl._lastFocused = document.activeElement;
  modalEl.classList.add('open');
  // Any close control inside the modal marked data-modal-close just
  // works, from any page — the sticky bar a tall panel gains at the
  // bottom is one of these.
  if(!modalEl._closeBound){
    modalEl._closeBound = true;
    modalEl.addEventListener('click', (e)=>{
      if(e.target.closest('[data-modal-close]')) closeModal(modalEl);
    });
  }
  const focusables = modalEl.querySelectorAll(FOCUSABLE_SELECTOR);
  if(focusables.length) focusables[0].focus();
  modalEl._trapHandler = (e)=>{
    if(e.key !== 'Tab') return;
    const items = modalEl.querySelectorAll(FOCUSABLE_SELECTOR);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  modalEl.addEventListener('keydown', modalEl._trapHandler);
}

function closeModal(modalEl){
  modalEl.classList.remove('open');
  if(modalEl._trapHandler){
    modalEl.removeEventListener('keydown', modalEl._trapHandler);
    modalEl._trapHandler = null;
  }
  if(modalEl._lastFocused && typeof modalEl._lastFocused.focus === 'function'){
    modalEl._lastFocused.focus();
  }
}

/* ============================================================
   SCROLLABLE FILTER BARS — on narrow screens the filter tabs turn
   into a horizontal scroller (see .gal-filters in index.css), which
   gave no hint that more tabs exist off-screen. This marks the bar
   (its .filter-bar wrapper, which owns the "Swipe →" pill) as
   scrollable and keeps .can-scroll-left / .can-scroll-right on the
   scroller itself so the CSS edge-fades track the real position.
   Used by gallery.html's tabs and the cake modal's tabs. Returns a
   sync() the caller can re-run after rebuilding the tab list.
============================================================ */
function initScrollableFilters(scroller){
  const bar = scroller && scroller.closest('.filter-bar');
  if(!bar) return ()=>{};
  const sync = ()=>{
    const max = scroller.scrollWidth - scroller.clientWidth;
    const scrollable = max > 8;
    const x = scroller.scrollLeft;
    bar.classList.toggle('is-scrollable', scrollable);
    scroller.classList.toggle('can-scroll-left', scrollable && x > 8);
    scroller.classList.toggle('can-scroll-right', scrollable && x < max - 8);
  };
  scroller.addEventListener('scroll', ()=>{
    // The hint is a one-time nudge: once the bar has moved, it has done
    // its job and stays gone for the rest of this page view.
    if(scroller.scrollLeft > 8) bar.classList.add('filters-scrolled');
    sync();
  }, { passive:true });
  window.addEventListener('resize', sync);
  if(typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(scroller);
  sync();
  return sync;
}
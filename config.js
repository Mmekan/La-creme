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

  // Base URL of the order API Worker (see worker/README.md), e.g.
  // 'https://la-creme-orders.<your-subdomain>.workers.dev'. Orders are
  // logged to it and the admin page (admin.html) reads from it. Leave ''
  // to disable logging (orders still go to WhatsApp).
  ordersApi: ''
};

const contactPhoneDisplayEl = document.getElementById('contactPhoneDisplay');
if(contactPhoneDisplayEl){
  contactPhoneDisplayEl.textContent =
    '+' + CONFIG.whatsappNumber.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1 $2 $3 $4');
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

function logOrder(order){
  if(!CONFIG.ordersApi) return;
  const endpoint = CONFIG.ordersApi.replace(/\/+$/, '') + '/api/orders';
  // text/plain keeps this a "simple" request, so the browser doesn't
  // need a CORS preflight before the order is sent.
  const body = JSON.stringify(order);
  try{
    if(navigator.sendBeacon){
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if(navigator.sendBeacon(endpoint, blob)) return;
    }
    fetch(endpoint, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body
    }).catch(()=>{});
  }catch(e){ /* logging must never break checkout */ }
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
  if(mediaEl.tagName === 'IMG' && mediaEl.complete && mediaEl.naturalWidth > 0){ clear(); return; }
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
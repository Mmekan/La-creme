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
  businessName: 'La Crème'
};

const contactPhoneDisplayEl = document.getElementById('contactPhoneDisplay');
if(contactPhoneDisplayEl){
  contactPhoneDisplayEl.textContent =
    '+' + CONFIG.whatsappNumber.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1 $2 $3 $4');
}

function waLink(message){
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
function openWhatsApp(message){
  // noopener,noreferrer: prevents the new wa.me tab from getting a
  // handle back to this page via window.opener.
  window.open(waLink(message), '_blank', 'noopener,noreferrer');
}
function fmtNaira(n){ return '₦' + n.toLocaleString('en-NG'); }

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
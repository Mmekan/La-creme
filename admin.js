/* ============================================================
   ADMIN — order viewer. Talks to the order Worker (CONFIG.ordersApi).
   Every value from the API is inserted with textContent, never
   innerHTML, so a hostile order can't inject markup into this page.
============================================================ */
const STATUSES = ['New', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];
const TOKEN_KEY = 'lcAdminToken';
const API = (CONFIG.ordersApi || '').replace(/\/+$/, '');

const $ = (id)=> document.getElementById(id);
let orders = [];
let selectedNo = null;
let searchTimer;

function el(tag, props = {}, ...children){
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v])=>{
    if(k === 'class') node.className = v;
    else if(k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach(c=> node.append(c));
  return node;
}

/* ---------- api ---------- */
async function api(path, options = {}){
  const token = sessionStorage.getItem(TOKEN_KEY);
  const res = await fetch(API + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  if(res.status === 401 && path !== '/api/login'){ signOut(); throw new Error('Session expired, please sign in again.'); }
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- auth ---------- */
function showApp(){
  $('loginView').hidden = true;
  $('appView').hidden = false;
  loadOrders();
}
function signOut(){
  sessionStorage.removeItem(TOKEN_KEY);
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('password').value = '';
  $('password').focus();
}

$('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  $('loginErr').textContent = '';
  if(!API){ $('loginErr').textContent = 'ordersApi is not set in config.js yet.'; return; }
  $('loginBtn').disabled = true;
  try{
    const { token } = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
    sessionStorage.setItem(TOKEN_KEY, token);
    showApp();
  }catch(err){
    $('loginErr').textContent = err.message;
  }finally{
    $('loginBtn').disabled = false;
  }
});
$('logoutBtn').addEventListener('click', signOut);
$('refreshBtn').addEventListener('click', ()=> loadOrders());

/* ---------- list ---------- */
STATUSES.forEach(s=> $('statusFilter').append(el('option', { value: s, text: s })));
$('statusFilter').addEventListener('change', ()=> loadOrders());
$('typeFilter').addEventListener('change', ()=> loadOrders());
$('search').addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 300); });

async function loadOrders(){
  const params = new URLSearchParams({ limit: '200' });
  if($('search').value.trim()) params.set('q', $('search').value.trim());
  if($('statusFilter').value) params.set('status', $('statusFilter').value);
  if($('typeFilter').value) params.set('type', $('typeFilter').value);
  try{
    const data = await api('/api/orders?' + params);
    orders = data.orders;
    $('stats').textContent = `${data.total} order${data.total === 1 ? '' : 's'}` + (data.total > orders.length ? `, showing the latest ${orders.length}` : '');
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderList();
    if(selectedNo) renderDetail(orders.find(o=> o.order_number === selectedNo));
  }catch(err){
    $('stats').textContent = err.message;
  }
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ', ' +
         d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function renderList(){
  const list = $('list');
  list.replaceChildren();
  if(!orders.length){ list.append(el('div', { class:'empty', text:'No orders match.' })); return; }
  orders.forEach(o=>{
    const row = el('div', { class: 'row' + (o.order_number === selectedNo ? ' active' : ''), tabindex: '0' },
      el('div', {}, el('div', { class:'no', text:o.order_number }), el('div', { class:'who', text:`${o.name || '(no name)'} · ${o.order_type || ''}` })),
      el('div', { class:'meta' }, el('div', { class:'total', text:o.total || '' }), el('div', { text:fmtDate(o.received_at) }), el('span', { class:`pill ${o.status.replace(/\s/g, '')}`, text:o.status }))
    );
    const open = ()=>{ selectedNo = o.order_number; renderList(); renderDetail(o); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') open(); });
    list.append(row);
  });
}

/* ---------- detail ---------- */
function kvRows(pairs){
  const dl = el('dl', { class:'kv' });
  pairs.filter(([, v])=> v).forEach(([k, v])=> dl.append(el('dt', { text:k }), el('dd', { text:v })));
  return dl;
}

function renderDetail(o){
  const box = $('detail');
  box.replaceChildren();
  if(!o){ box.append(el('div', { class:'none', text:'Select an order to see the full details.' })); return; }

  const status = el('select');
  STATUSES.forEach(s=> status.append(el('option', { value:s, text:s, ...(s === o.status ? { selected:'' } : {}) })));
  status.addEventListener('change', async ()=>{
    try{
      await api(`/api/orders/${encodeURIComponent(o.order_number)}`, { method:'PATCH', body: JSON.stringify({ status: status.value }) });
      o.status = status.value;
      renderList();
    }catch(err){ alert(err.message); status.value = o.status; }
  });

  const print = el('button', { class:'btn', type:'button', text:'Print receipt' });
  print.addEventListener('click', ()=> printReceipt(o));

  const wa = o.phone ? el('a', { class:'btn ghost', target:'_blank', rel:'noopener', text:'WhatsApp customer',
    href:`https://wa.me/${o.phone.replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hello ${o.name || ''}, this is La Crème about your order ${o.order_number}.`)}` }) : null;

  box.append(
    el('h2', { text:o.order_number }),
    el('div', { class:'sub', text:`Received ${fmtDate(o.received_at)}` }),
    kvRows([
      ['Type', o.order_type], ['Customer', o.name], ['Phone', o.phone],
      ['Delivery', o.delivery], ['Address', o.address], ['Date needed', o.date_needed],
      ['Event', o.event_type], ['Guests', o.guests], ['Service', o.service_type],
      ['Total', o.total], ['Notes', o.notes],
    ]),
    el('div', { class:'sub', text:'Items' }),
    el('div', { class:'items', text:o.items || '(none recorded)' }),
    el('div', { class:'actions' }, status, print, ...(wa ? [wa] : []))
  );
}

/* ---------- receipt ---------- */
function printReceipt(o){
  const r = $('receipt');
  r.replaceChildren();
  const line = ()=> el('hr');
  r.append(
    el('h1', { text:'LA CRÈME' }),
    el('div', { class:'c', text:'Bespoke cakes, finger foods & catering' }),
    line(),
    el('div', { text:`Order: ${o.order_number}` }),
    el('div', { text:`Date:  ${fmtDate(o.received_at)}` }),
    el('div', { text:`Name:  ${o.name || ''}` }),
    el('div', { text:`Phone: ${o.phone || ''}` }),
    el('div', { text:`${o.delivery || ''}${o.address ? ': ' + o.address : ''}` }),
    ...(o.date_needed ? [el('div', { text:`Needed: ${o.date_needed}` })] : []),
    line()
  );
  (o.items || '').split('\n').filter(Boolean).forEach(text=>{
    // "3 × Meat Pie — ₦3,000" -> description left, price right
    const m = text.match(/^(.*?)\s+—\s+(₦[\d,]+)$/);
    r.append(m ? el('div', { class:'item' }, el('span', { text:m[1] }), el('span', { text:m[2] })) : el('div', { text }));
  });
  r.append(line());
  if(o.total) r.append(el('div', { class:'tot' }, el('span', { text:'TOTAL' }), el('span', { text:o.total })));
  if(o.notes) r.append(el('div', { text:`Notes: ${o.notes}` }));
  r.append(line(), el('div', { class:'c', text:'Thank you for choosing La Crème' }));
  window.print();
}

/* ---------- boot ---------- */
if(sessionStorage.getItem(TOKEN_KEY)) showApp();
setInterval(()=>{ if(!$('appView').hidden && !document.hidden) loadOrders(); }, 60000);

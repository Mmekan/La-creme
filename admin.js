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
$('tabOrders').addEventListener('click', ()=> switchTab('orders'));
$('tabUploads').addEventListener('click', ()=> switchTab('uploads'));
$('refreshBtn').addEventListener('click', ()=> refreshActive());

function switchTab(which){
  const orders = which === 'orders';
  $('tabOrders').classList.toggle('active', orders);
  $('tabUploads').classList.toggle('active', !orders);
  $('ordersPanel').hidden = !orders;
  $('uploadsPanel').hidden = orders;
  $('pageTitle').textContent = orders ? 'LA CRÈME · ORDERS' : 'LA CRÈME · UPLOADS';
  if(!orders) loadUploads();
}
function refreshActive(){
  if($('uploadsPanel').hidden) loadOrders(); else loadUploads();
}

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

/* ---------- uploads ---------- */
let batches = [];
let selectedBatchId = null;

function fmtBytes(n){
  n = Number(n) || 0;
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function loadUploads(){
  try{
    const data = await api('/api/uploads');
    batches = data.batches;
    $('upStats').textContent = batches.length
      ? `${batches.length} upload${batches.length === 1 ? '' : 's'} · ${batches.reduce((n, b)=> n + b.file_count, 0)} photos`
      : 'No uploads yet.';
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderUploadList();
    if(selectedBatchId) renderBatchDetail();
  }catch(err){
    $('upStats').textContent = err.message;
  }
}

function renderUploadList(){
  const list = $('batchList');
  list.replaceChildren();
  if(!batches.length){
    list.append(el('div', { class:'empty', text:'No uploads yet.' }));
    return;
  }
  batches.forEach(b=>{
    const parts = [];
    if(b.approved) parts.push(`${b.approved} approved`);
    if(b.pending)  parts.push(`${b.pending} pending`);
    if(b.rejected) parts.push(`${b.rejected} rejected`);
    if(b.failed)   parts.push(`${b.failed} failed`);

    const row = el('div', { class:'row' + (b.id === selectedBatchId ? ' active' : ''), tabindex:'0' },
      el('div', {},
        el('div', { class:'no', text:`${b.file_count} photo${b.file_count === 1 ? '' : 's'} · ${b.category}` }),
        el('div', { class:'who', text:parts.join(' · ') })
      ),
      el('div', { class:'meta' },
        el('div', { class:'total', text:fmtBytes(b.total_bytes) }),
        el('div', { text:fmtDate(b.received_at) }),
        el('span', { class:`pill ${b.status}`, text:b.status })
      )
    );
    const open = ()=>{ selectedBatchId = b.id; renderUploadList(); renderBatchDetail(); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') open(); });
    list.append(row);
  });
}

async function renderBatchDetail(){
  const box = $('batchDetail');
  box.replaceChildren();
  if(!selectedBatchId){
    box.append(el('div', { class:'none', text:'Select an upload to see its photos.' }));
    return;
  }
  box.append(el('div', { class:'none', text:'Loading…' }));

  let data;
  try{
    data = await api(`/api/uploads/${selectedBatchId}`);
  }catch(err){
    box.replaceChildren(el('div', { class:'none', text:err.message }));
    return;
  }
  const { batch, items } = data;

  box.replaceChildren(
    el('h2', { text:`${batch.file_count} photo${batch.file_count === 1 ? '' : 's'}` }),
    el('div', { class:'sub', text:`${batch.category} · ${fmtDate(batch.received_at)} · ${fmtBytes(batch.total_bytes)}` })
  );
  const grid = el('div', { class:'up-grid' });
  items.forEach(it=> grid.append(uploadCard(it)));
  box.append(grid);
}

function uploadCard(item){
  const card = el('div', { class:'up-card' });

  if(item.image_url){
    const img = el('img', { alt:'' });
    img.loading = 'lazy';
    img.src = item.image_url;
    // Rejected items keep their object (spec 6.3), so this renders too —
    // only the manifest excludes them.
    img.addEventListener('error', ()=>{
      const broken = el('div', { class:'broken', text:'no preview' });
      img.replaceWith(broken);
    });
    card.append(img);
  } else {
    card.append(el('div', { class:'broken', text:'no preview' }));
  }

  card.append(el('div', { class:'meta' },
    el('div', { class:'fname', text:item.filename || '' }),
    el('div', { text:`${item.width}×${item.height} · ${fmtBytes(item.bytes)}` }),
    el('span', { class:`pill ${item.status}`, text:item.status })
  ));
  if(item.error) card.append(el('div', { class:'msg', text:item.error }));

  const acts = el('div', { class:'acts' });
  if(item.status === 'Pending'){
    acts.append(
      btn('Approve', 'btn', ()=> setUploadStatus(item, 'Approved')),
      btn('Reject', 'btn ghost', ()=> setUploadStatus(item, 'Rejected'))
    );
  } else if(item.status === 'Approved'){
    acts.append(btn('Unpublish', 'btn ghost', ()=> setUploadStatus(item, 'Pending')));
  } else if(item.status === 'Rejected'){
    acts.append(
      btn('Approve', 'btn', ()=> setUploadStatus(item, 'Approved')),
      btn('Restore', 'btn ghost', ()=> setUploadStatus(item, 'Pending'))
    );
  } else if(item.status === 'Failed'){
    acts.append(btn('Retry', 'btn', ()=> retryUpload(item)));
  }
  card.append(acts);
  return card;
}

function btn(label, cls, onClick){
  const b = el('button', { class:cls, type:'button', text:label });
  b.addEventListener('click', onClick);
  return b;
}

async function setUploadStatus(item, status){
  try{
    await api(`/api/uploads/${item.id}`, { method:'PATCH', body: JSON.stringify({ status }) });
  }catch(err){ alert(err.message); return; }
  // Gallery picks this up on its next load — no code edit, no deploy.
  await loadUploads();
  await renderBatchDetail();
}

async function retryUpload(item){
  try{
    await api(`/api/uploads/${item.id}/retry`, { method:'POST' });
  }catch(err){ alert(err.message); return; }
  await loadUploads();
  await renderBatchDetail();
}

/* ---------- boot ---------- */
if(sessionStorage.getItem(TOKEN_KEY)) showApp();
setInterval(()=>{ if(!$('appView').hidden && !document.hidden) refreshActive(); }, 60000);

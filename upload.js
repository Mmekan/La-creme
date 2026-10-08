/* ============================================================
   UPLOAD PAGE — mobile-first intake for the business owner.
   Three moves: pick a category, pick photos, send. No login.

   Each photo is resized on-device (long edge 2400px, JPEG ~0.82) so a
   23-photo batch is ~7MB instead of ~150MB, then uploaded ONE AT A TIME
   with a per-file progress bar — if the connection drops on photo 14 of
   23, only photo 14 retries.

   The Worker writes to R2 and HEAD-verifies before it records anything,
   so a file shown here as "sent" is genuinely in storage.
============================================================ */
const $ = (id)=> document.getElementById(id);
const API = (CONFIG.ordersApi || '').replace(/\/+$/, '');

const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.82;
const MAX_FILES = 200;
const RETRIES = 3;
const RETRY_BACKOFF_MS = 600;

// One id per upload SESSION. Every file in a session carries it so the
// Worker can group them into a single dashboard row and one Telegram
// message instead of N of each (spec 7, Task 2). `reset()` mints a new
// one, so "Send more" after a completed upload starts a fresh batch
// rather than growing the old one — which also keeps file_count honest:
// the Worker stops counting at the total declared by the first file.
let CLIENT_BATCH_ID = '';
function newBatchId(){
  CLIENT_BATCH_ID = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
newBatchId();

let prepared = [];      // [{ blob, width, height, name, status, error, onProgress }]
let sending = false;
let BATCH_TOTAL = 0;    // set in sendAll() — the count the Worker records
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

/* ---------- boot ---------- */
if(!API){
  $('fatal').textContent = 'Uploads are not configured yet.';
} else if(typeof MEDIA_CATEGORIES === 'undefined'){
  $('fatal').textContent = 'Could not load the category list.';
} else {
  MEDIA_CATEGORIES.forEach(cat=>{
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    $('category').append(o);
  });
}

$('category').addEventListener('change', ()=>{ $('catErr').textContent = ''; });
$('pickBtn').addEventListener('click', ()=> $('fileInput').click());
$('fileInput').addEventListener('change', (e)=> onFiles([...e.target.files]));
$('sendBtn').addEventListener('click', sendAll);
$('againBtn').addEventListener('click', reset);

/* ---------- resize ---------- */
async function resizeImage(file){
  // imageOrientation:'from-image' bakes the EXIF orientation in, so a
  // portrait phone photo doesn't land in the gallery rotated 90°.
  let src, w, h;
  try{
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    src = bmp; w = bmp.width; h = bmp.height;
  }catch(err){
    src = await new Promise((res, rej)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>{ URL.revokeObjectURL(url); res(img); };
      img.onerror = (e)=>{ URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext('2d').drawImage(src, 0, 0, outW, outH);
  if(src.close) src.close();

  const blob = await new Promise(res=> canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  if(!blob) throw new Error('Could not re-encode that photo.');
  return { blob, width: outW, height: outH };
}

/* ---------- selection ---------- */
async function onFiles(files){
  if(!files.length) return;
  if(prepared.length + files.length > MAX_FILES){
    $('prepErr').textContent = `You can send up to ${MAX_FILES} photos at a time.`;
    files = files.slice(0, MAX_FILES - prepared.length);
    if(!files.length) return;
  }
  $('catErr').textContent = '';
  $('prepErr').textContent = '';

  // Thumbnails appear as they're chosen (spec 5), so the list grows
  // during the resize loop rather than after it.
  const list = $('thumbs');
  for(const file of files){
    const li = document.createElement('li');
    li.className = 'prep';
    li.textContent = 'Preparing…';
    list.append(li);

    const entry = { blob:null, width:0, height:0, name:file.name || 'photo.jpg', status:'prep', error:null, onProgress:()=>{}, el:li };
    prepared.push(entry);

    try{
      const out = await resizeImage(file);
      entry.blob = out.blob; entry.width = out.width; entry.height = out.height;
      entry.status = 'ready';
      const img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(out.blob);
      li.className = '';
      li.replaceChildren(img);
    }catch(err){
      // 'broken', not 'failed': blob is null, so this photo can never be
      // sent — queueing it would append the literal string "null" as a
      // 4-byte file the Worker happily stores. Excluded from the send
      // queue; only network failures (status 'failed', blob intact) retry.
      entry.status = 'broken';
      entry.error = err && err.message ? err.message : 'Could not prepare that photo.';
      li.className = 'bad';
      li.replaceChildren(Object.assign(document.createElement('span'), { className:'badge', textContent:'failed' }));
      $('prepErr').textContent = entry.error;
    }
  }

  const ready = prepared.filter(p=> p.status === 'ready').length;
  $('pickHint').textContent = `${prepared.length} photo${prepared.length === 1 ? '' : 's'} selected · ${ready} ready`;
  $('pickBtn').textContent = 'Choose more photos';
  $('sendBtn').hidden = ready === 0;
  $('sendBtn').textContent = `Send ${ready} photo${ready === 1 ? '' : 's'}`;
}

/* ---------- upload ---------- */
function uploadOne(entry){
  return new Promise((resolve, reject)=>{
    const fd = new FormData();
    fd.append('category', $('category').value);
    fd.append('clientBatchId', CLIENT_BATCH_ID);
    fd.append('batchTotal', String(BATCH_TOTAL));
    fd.append('clientWidth', String(entry.width));
    fd.append('clientHeight', String(entry.height));
    fd.append('filename', entry.name);
    fd.append('file', entry.blob, entry.name);

    // XHR, not fetch: fetch gives no upload progress event, and the
    // per-file progress bar is the whole point of sending one at a time.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload');
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e)=>{ if(e.lengthComputable) entry.onProgress(e.loaded / e.total); };
    xhr.onload = ()=>{
      if(xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try{ const j = JSON.parse(xhr.responseText); if(j.error) msg = j.error; }catch(e){}
      const err = new Error(msg);
      // 4xx means the server decided this exact request will never work
      // (unknown category, too large, rate limited) — retrying wastes
      // the owner's time and battery. Only network faults and 5xx retry.
      err.retryable = xhr.status >= 500 || xhr.status === 0;
      reject(err);
    };
    xhr.onerror = ()=>{ const e = new Error('Network error — check your connection.'); e.retryable = true; reject(e); };
    xhr.ontimeout = ()=>{ const e = new Error('That took too long.'); e.retryable = true; reject(e); };
    xhr.send(fd);
  });
}

async function sendAll(){
  if(sending) return;
  if(!$('category').value){
    $('catErr').textContent = 'Choose a category first.';
    $('category').focus();
    return;
  }

  const queue = prepared.filter(p=> p.status === 'ready' || p.status === 'failed');
  if(!queue.length) return;
  // A re-send after failures starts a NEW batch. The old row keeps its
  // accurate "N failed" history and the new one counts from zero, so
  // file_count can actually reconcile with stored_count — reusing the id
  // would stack duplicate failed rows inside one batch and leave status
  // stuck on 'Partial' even after every photo eventually stores.
  if(queue.some(p=> p.status === 'failed')) newBatchId();
  queue.forEach(p=>{ p.status = 'ready'; p.error = null; });
  // Declared once, from exactly what we are about to send. Anything else
  // (files still resizing, or already sent) would make file_count exceed
  // stored_count + failed_count, so the batch could never reach Complete.
  BATCH_TOTAL = queue.length;

  sending = true;
  $('sendBtn').disabled = true;
  $('sendErr').textContent = '';
  $('prog').hidden = false;
  updateProgress(0, 0);

  for(let i = 0; i < queue.length; i++){
    const entry = queue[i];
    entry.onProgress = (frac)=> updateProgress(i, frac);

    let attempt = 0, err = null;
    while(attempt < RETRIES){
      try{
        await uploadOne(entry);
        entry.status = 'sent'; entry.error = null; err = null; break;
      }catch(e){
        err = e;
        attempt++;
        if(attempt < RETRIES && e.retryable) await sleep(RETRY_BACKOFF_MS * attempt);
        if(attempt < RETRIES && !e.retryable) break;
      }
    }

    if(err){
      entry.status = 'failed';
      entry.error = err.message;
      markFailed(entry);
    } else {
      entry.status = 'sent';
      entry.error = null;
      clearFailedMark(entry);   // drops a 'retry' badge left by an earlier run
    }
    updateProgress(i + 1, 0);
  }

  sending = false;
  $('sendBtn').disabled = false;
  finish();
}

function updateProgress(done, frac){
  // BATCH_TOTAL, not a recount: during a retry run the other entries are
  // 'sent' or 'failed' and would make the denominator wrong.
  const total = BATCH_TOTAL || 1;
  const pct = Math.min(100, Math.round(((done + frac) / total) * 100));
  $('progFill').style.width = pct + '%';
  $('progText').textContent = done < total ? `Sending ${done + 1} of ${total}…` : 'Finishing…';
}

function markFailed(entry){
  // The entry holds its own <li> — queue index and thumbs index diverge
  // as soon as any earlier photo was skipped or already sent. The image
  // is left in place so a retry doesn't blank her thumbnail.
  const li = entry.el;
  if(!li) return;
  li.className = 'bad';
  if(li.querySelector('.badge')) return;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = 'retry';
  li.append(badge);
}

function clearFailedMark(entry){
  const li = entry.el;
  if(!li) return;
  li.className = '';
  const badge = li.querySelector('.badge');
  if(badge) badge.remove();
}

function finish(){
  const sent = prepared.filter(p=> p.status === 'sent').length;
  const failed = prepared.filter(p=> p.status === 'failed').length;

  $('prog').hidden = true;
  $('sendBtn').hidden = true;

  if(failed === 0){
    $('doneCount').textContent = `${sent} photo${sent === 1 ? '' : 's'} sent ✅`;
    $('done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Never drop a failure silently (spec 5.2). The Worker's own reason —
  // the 429 rate-limit text, "One upload must stay in one category.",
  // "That photo is too large." — is appended so a permanent rejection
  // doesn't read as a flaky network with a Retry that can never succeed.
  const firstError = [...new Set(
    prepared
      .filter(p=> p.status === 'failed')
      .map(p=> (p.error || '').trim())
      .filter(Boolean)
  )][0] || '';
  $('sendErr').textContent =
    `${sent} sent, ${failed} not sent. ` +
    `Those ${failed} are still on your phone — tap Retry to send them again.` +
    (firstError ? ` ${firstError}${/[.!?]$/.test(firstError) ? '' : '.'}` : '');
  $('sendBtn').hidden = false;
  const retryable = prepared.filter(p=> p.status === 'failed').length;
  $('sendBtn').textContent = `Retry ${retryable} photo${retryable === 1 ? '' : 's'}`;
}

function reset(){
  prepared = [];
  $('thumbs').replaceChildren();
  $('fileInput').value = '';
  $('pickHint').textContent = '';
  $('pickBtn').textContent = 'Choose photos';
  $('sendBtn').hidden = true;
  $('sendBtn').disabled = false;
  $('prog').hidden = true;
  $('progFill').style.width = '0%';
  $('sendErr').textContent = '';
  $('prepErr').textContent = '';
  $('catErr').textContent = '';
  $('done').hidden = true;
  // Fresh CLIENT_BATCH_ID: a re-send from this new session declares its
  // own batchTotal, so file_count can reconcile instead of freezing at
  // the first session's total while stored_count keeps climbing — and
  // switching category for the next batch can't collide with the old
  // row (the Worker would 400 "one upload must stay in one category").
  newBatchId();
}

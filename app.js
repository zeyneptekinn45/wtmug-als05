/* ===================== Durum ===================== */
const state = {
  products: [],
  cart: [],          // sepet: {barcode, qty}
  bulk: [],          // toplu okumada bulunan ürünler: {barcode, qty}
  singleReader: null,
  bulkReader: null,
  singleRunning: false,
  bulkRunning: false,
};

/* ===================== Yardımcılar ===================== */
const $ = (sel) => document.querySelector(sel);
const fmtTL = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const findProduct = (barcode) => state.products.find(p => p.barcode === barcode);

/* ===================== JSON Yükleme ===================== */
async function loadProducts() {
  const res = await fetch('products.json', { cache: 'no-cache' });
  state.products = await res.json();
}

/* ===================== Sekme Yönetimi ===================== */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#' + btn.dataset.tab).classList.add('active');
    // Sekme değişince kameraları kapat
    stopSingle();
    stopBulk();
  });
});

/* ===================== Barkod Okuyucu (ZXing) ===================== */
function createReader(videoEl, onResult) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.QR_CODE,
  ]);
  return new ZXing.BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
}

async function startScanner(reader, videoEl, boxEl, onDetected) {
  try {
    await reader.decodeFromVideoDevice(null, videoEl, (result, err) => {
      if (result) onDetected(result.getText());
    });
    boxEl.classList.add('scanning');
  } catch (e) {
    alert('Kamera açılamadı. HTTPS ve kamera izni gerekli.\n' + e.message);
    throw e;
  }
}

function stopScanner(reader, boxEl) {
  if (!reader) return;
  try { reader.reset(); } catch {}
  boxEl.classList.remove('scanning');
}

/* ===================== Tekli Okuma ===================== */
function renderProduct(p) {
  const el = $('#singleResult');
  if (!p) {
    el.className = 'card empty';
    el.textContent = 'Bu barkod ürün veritabanında bulunamadı.';
    return;
  }
  el.className = 'card product-info';
  el.innerHTML = `
    <span class="badge">${p.category}</span>
    <h3>${p.name}</h3>
    <p><strong>Marka:</strong> ${p.brand}</p>
    <p><strong>Miktar:</strong> ${p.quantity}</p>
    <p><strong>Barkod:</strong> ${p.barcode}</p>
    <p class="price">${fmtTL(p.price)}</p>
    <button class="btn success" id="addSingleToCart">🛒 Sepete Ekle</button>
  `;
  $('#addSingleToCart').addEventListener('click', () => addToCart(p.barcode));
}

async function startSingle() {
  if (state.singleRunning) return;
  state.singleRunning = true;
  $('#singleStart').disabled = true;
  $('#singleStop').disabled = false;

  if (!state.singleReader) state.singleReader = createReader();

  await startScanner(
    state.singleReader,
    $('#singleVideo'),
    $('#singleVideo').parentElement,
    (barcode) => {
      const product = findProduct(barcode);
      renderProduct(product);
      // Kısa titreşim geri bildirimi (Pixel 7 destekler)
      if (navigator.vibrate) navigator.vibrate(80);
      stopSingle();
    }
  );
}

function stopSingle() {
  state.singleRunning = false;
  $('#singleStart').disabled = false;
  $('#singleStop').disabled = true;
  stopScanner(state.singleReader, $('#singleVideo')?.parentElement);
}

/* ===================== Toplu Okuma ===================== */
function addToBulk(barcode) {
  const existing = state.bulk.find(i => i.barcode === barcode);
  if (existing) {
    existing.qty += 1;
  } else {
    const p = findProduct(barcode);
    state.bulk.push({ barcode, qty: 1, found: !!p, product: p });
  }
  renderBulk();
}

function renderBulk() {
  const list = $('#bulkList');
  const totalEl = $('#bulkTotal');
  const btn = $('#bulkToCart');

  if (state.bulk.length === 0) {
    list.innerHTML = '<li class="muted">Barkod okutulmadı.</li>';
    totalEl.textContent = fmtTL(0);
    btn.disabled = true;
    return;
  }

  list.innerHTML = state.bulk.map(item => {
    const p = item.product;
    const name = p ? p.name : '❓ Bilinmeyen ürün';
    const sub  = p ? `${p.brand} · ${item.qty} adet` : `Barkod: ${item.barcode}`;
    const price = p ? fmtTL(p.price * item.qty) : '—';
    return `<li>
      <div>
        <div class="item-name">${name}</div>
        <div class="item-sub">${sub}</div>
      </div>
      <div class="item-price">${price}</div>
    </li>`;
  }).join('');

  const total = state.bulk.reduce((s, i) => s + (i.product ? i.product.price * i.qty : 0), 0);
  totalEl.textContent = fmtTL(total);
  btn.disabled = false;
}

async function startBulk() {
  if (state.bulkRunning) return;
  state.bulkRunning = true;
  $('#bulkStart').disabled = true;
  $('#bulkStop').disabled = false;

  if (!state.bulkReader) state.bulkReader = createReader();

  await startScanner(
    state.bulkReader,
    $('#bulkVideo'),
    $('#bulkVideo').parentElement,
    (barcode) => {
      // Aynı barkodun sürekli okunmasını kısa süreli engelle
      if (state._lastBulk === barcode) return;
      state._lastBulk = barcode;
      setTimeout(() => { state._lastBulk = null; }, 1200);

      addToBulk(barcode);
      if (navigator.vibrate) navigator.vibrate(60);
    }
  );
}

function stopBulk() {
  state.bulkRunning = false;
  $('#bulkStart').disabled = false;
  $('#bulkStop').disabled = true;
  stopScanner(state.bulkReader, $('#bulkVideo')?.parentElement);
}

/* ===================== Sepet ===================== */
function addToCart(barcode) {
  const existing = state.cart.find(i => i.barcode === barcode);
  if (existing) existing.qty += 1;
  else {
    const p = findProduct(barcode);
    if (!p) { alert('Bilinmeyen ürün sepete eklenemez.'); return; }
    state.cart.push({ barcode, qty: 1, product: p });
  }
  renderCart();
  if (navigator.vibrate) navigator.vibrate(100);
}

function renderCart() {
  const list = $('#cartList');
  const totalEl = $('#cartTotal');
  const countEl = $('#cartCount');

  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  countEl.textContent = count;

  if (state.cart.length === 0) {
    list.innerHTML = '<li class="muted">Sepet boş.</li>';
    totalEl.textContent = fmtTL(0);
    return;
  }

  list.innerHTML = state.cart.map(item => `
    <li>
      <div>
        <div class="item-name">${item.product.name}</div>
        <div class="item-sub">${item.product.brand} · ${item.qty} adet</div>
      </div>
      <div class="item-price">${fmtTL(item.product.price * item.qty)}</div>
    </li>
  `).join('');

  const total = state.cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  totalEl.textContent = fmtTL(total);
}

/* ===================== Olaylar ===================== */
$('#singleStart').addEventListener('click', startSingle);
$('#singleStop').addEventListener('click', stopSingle);
$('#bulkStart').addEventListener('click', startBulk);
$('#bulkStop').addEventListener('click', stopBulk);

$('#bulkToCart').addEventListener('click', () => {
  state.bulk.forEach(item => {
    if (item.product) {
      for (let i = 0; i < item.qty; i++) {
        // addToCart'ta bulunamayanları atla
        const existing = state.cart.find(c => c.barcode === item.barcode);
        if (existing) existing.qty += 1;
        else state.cart.push({ barcode: item.barcode, qty: 1, product: item.product });
      }
    }
  });
  state.bulk = [];
  renderBulk();
  renderCart();
  document.querySelector('.tab[data-tab="cart"]').click();
});

$('#clearCart').addEventListener('click', () => {
  if (state.cart.length && confirm('Sepet temizlensin mi?')) {
    state.cart = [];
    renderCart();
  }
});

/* ===================== PWA Kayıt ===================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}

/* ===================== Başlat ===================== */
(async () => {
  try {
    await loadProducts();
    renderBulk();
    renderCart();
  } catch (e) {
    console.error('Ürünler yüklenemedi:', e);
    $('#singleResult').textContent = 'Ürün veritabanı yüklenemedi.';
  }
})();
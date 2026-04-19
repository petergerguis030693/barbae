(function () {
  const appData = window.__STORE_DATA__ || {};
  const searchToggle = document.getElementById('searchToggle');
  const searchPanel = document.getElementById('searchPanel');
  const searchInput = document.getElementById('searchInput');
  const suggestionsNode = document.getElementById('searchSuggestions');
  const cartToggle = document.getElementById('cartToggle');
  const cartClose = document.getElementById('cartClose');
  const cartPanel = document.getElementById('cartPanel');
  const cartBackdrop = document.getElementById('cartBackdrop');
  const cartItemsNode = document.getElementById('cartItems');
  const cartCountNode = document.getElementById('cartCount');
  const cartNetNode = document.getElementById('cartNet');
  const cartTaxNode = document.getElementById('cartTax');
  const cartTotalNode = document.getElementById('cartTotal');
  const addToCartButtons = Array.from(document.querySelectorAll('.add-to-cart'));
  const productCards = Array.from(document.querySelectorAll('.product-card'));
  const heroCards = Array.from(document.querySelectorAll('.hero-card'));
  const highlightsTrack = document.getElementById('highlightsTrack');
  const highlightsPrev = document.querySelector('.highlights-prev');
  const highlightsNext = document.querySelector('.highlights-next');
  const magazineTrack = document.getElementById('magazineTrack');
  const magazinePrev = document.querySelector('.magazine-prev');
  const magazineNext = document.querySelector('.magazine-next');
  const productMainImage = document.getElementById('productMainImage');
  const thumbButtons = Array.from(document.querySelectorAll('.thumb-btn'));
  const qtyInput = document.getElementById('qtyInput');
  const qtyMinus = document.getElementById('qtyMinus');
  const qtyPlus = document.getElementById('qtyPlus');
  const buyTotal = document.getElementById('buyTotal');
  const header = document.querySelector('.store-header');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutCartJson = document.getElementById('checkoutCartJson');
  const checkoutItems = document.getElementById('checkoutItems');
  const checkoutNet = document.getElementById('checkoutNet');
  const checkoutDiscount = document.getElementById('checkoutDiscount');
  const checkoutTax = document.getElementById('checkoutTax');
  const checkoutShipping = document.getElementById('checkoutShipping');
  const checkoutGross = document.getElementById('checkoutGross');
  const checkoutDiscountCode = document.getElementById('checkoutDiscountCode');
  const checkoutCouponApply = document.getElementById('checkoutCouponApply');
  const checkoutCouponInfo = document.getElementById('checkoutCouponInfo');
  const cartStorageKey = 'barbae-cart-v1';
  const vatRate = 0.2;
  let cartToastTimer = null;
  let serverCartAuthenticated = false;
  let serverCartBootstrapped = false;
  let serverCartSyncPending = false;
  let serverCartItems = [];
  let checkoutSummaryRequestId = 0;
  let appliedCouponCode = '';

  // Keep the cart drawer outside the header stacking context.
  if (cartBackdrop && cartBackdrop.parentElement !== document.body) document.body.appendChild(cartBackdrop);
  if (cartPanel && cartPanel.parentElement !== document.body) document.body.appendChild(cartPanel);

  function isMobileCartMode() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function loadCart() {
    if (serverCartAuthenticated) {
      return Array.isArray(serverCartItems) ? [...serverCartItems] : [];
    }
    try {
      return JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
    } catch (_error) {
      return [];
    }
  }

  function saveCart(items) {
    if (serverCartAuthenticated) {
      serverCartItems = Array.isArray(items) ? [...items] : [];
      return;
    }
    localStorage.setItem(cartStorageKey, JSON.stringify(items));
  }

  function normalizeSelectedOptions(selectedOptions) {
    const source = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {};
    return Object.keys(source)
      .sort()
      .reduce((acc, key) => {
        const value = String(source[key] || '').trim();
        if (!value) return acc;
        acc[key] = value;
        return acc;
      }, {});
  }

  function makeOptionKey(selectedOptions) {
    const normalized = normalizeSelectedOptions(selectedOptions);
    const parts = Object.entries(normalized).map(([key, value]) => `${key}:${value}`);
    return parts.join('|');
  }

  function formatOptionSummary(selectedOptions) {
    const labels = { color: 'Farbe', size: 'Größe', personalization: 'Personalisierung' };
    const normalized = normalizeSelectedOptions(selectedOptions);
    return Object.entries(normalized)
      .map(([key, value]) => `${labels[key] || key}: ${value}`)
      .join(' | ');
  }

  function normalizeCartForCompare(items) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((raw) => {
      const productId = Number(raw.productId);
      const qty = Math.max(0, Math.floor(Number(raw.qty || 0)));
      if (!productId || qty <= 0) return;
      const selectedOptions = normalizeSelectedOptions(raw.selectedOptions);
      const optionKey = String(raw.optionKey || makeOptionKey(selectedOptions) || '');
      const lineKey = `${productId}::${optionKey}`;
      const prev = map.get(lineKey);
      if (!prev || qty > prev.qty) {
        map.set(lineKey, {
          productId,
          qty,
          title: raw.title || prev?.title || 'Produkt',
          price: Number(raw.price || prev?.price || 0),
          image: raw.image || prev?.image || '',
          weightGrams: normalizeWeightGrams(raw.weightGrams || raw.weight_grams || prev?.weightGrams || 0),
          selectedOptions,
          optionKey
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => `${a.productId}::${a.optionKey}`.localeCompare(`${b.productId}::${b.optionKey}`));
  }

  function cartsEqual(a, b) {
    const left = normalizeCartForCompare(a);
    const right = normalizeCartForCompare(b);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i].productId !== right[i].productId || left[i].qty !== right[i].qty || String(left[i].optionKey || '') !== String(right[i].optionKey || '')) return false;
    }
    return true;
  }

  function mergeCartsPreferHigherQty(localItems, serverItems) {
    return normalizeCartForCompare([...(serverItems || []), ...(localItems || [])]);
  }

  async function postServerCartSync(items, mode) {
    const response = await fetch('/api/cart/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: mode || 'replace', items: normalizeCartForCompare(items) })
    });
    if (!response.ok) throw new Error(`cart-sync-${response.status}`);
    return response.json();
  }

  async function syncServerCartFromLocal() {
    if (!serverCartAuthenticated || serverCartSyncPending) return;
    serverCartSyncPending = true;
    try {
      const payload = await postServerCartSync(loadCart(), 'replace');
      if (payload?.authenticated && Array.isArray(payload.items)) {
        serverCartItems = [...payload.items];
        renderCart();
      }
    } catch (_error) {
      // Keep local cart as fallback if server sync fails.
    } finally {
      serverCartSyncPending = false;
    }
  }

  async function bootstrapServerCart() {
    if (serverCartBootstrapped) return;
    serverCartBootstrapped = true;
    try {
      const response = await fetch('/api/cart', { credentials: 'same-origin' });
      if (!response.ok) return;
      const payload = await response.json();
      serverCartAuthenticated = Boolean(payload?.authenticated);
      if (!serverCartAuthenticated) return;

      const localItems = loadCart();
      const serverItems = Array.isArray(payload.items) ? payload.items : [];
      const merged = mergeCartsPreferHigherQty(localItems, serverItems);

      if (!cartsEqual(merged, serverItems)) {
        const synced = await postServerCartSync(merged, 'replace');
        if (synced?.authenticated && Array.isArray(synced.items)) {
          serverCartItems = [...synced.items];
          try {
            localStorage.removeItem(cartStorageKey);
          } catch (_error) {
            // ignore storage cleanup errors
          }
          renderCart();
          return;
        }
      }

      serverCartItems = [...serverItems];
      try {
        localStorage.removeItem(cartStorageKey);
      } catch (_error) {
        // ignore storage cleanup errors
      }
      renderCart();
    } catch (_error) {
      serverCartAuthenticated = false;
    }
  }

  function money(value) {
    return `${Number(value || 0).toFixed(2)} EUR`;
  }

  function calcTotals(cart) {
    const gross = Number(cart.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0).toFixed(2));
    const net = Number((gross / (1 + vatRate)).toFixed(2));
    const tax = Number((gross - net).toFixed(2));
    return { gross, net, tax };
  }

  function normalizeWeightGrams(value) {
    const grams = Number(value || 0);
    if (!Number.isFinite(grams) || grams < 0) return 0;
    return Math.round(grams);
  }

  function calcCartWeightGrams(cart) {
    return (Array.isArray(cart) ? cart : []).reduce((sum, item) => {
      const qty = Math.max(1, Number(item.qty || 1));
      return sum + qty * normalizeWeightGrams(item.weightGrams || item.weight_grams);
    }, 0);
  }

  function calcCheckoutShipping(cart) {
    const weightGrams = calcCartWeightGrams(cart);
    if (weightGrams <= 0) return { gross: 0, net: 0, tax: 0, vatRate: 0, isAvailable: true };
    const brackets = [
      { maxWeightGrams: 1000, basePrice: 6.11, surcharge: 0.27, vatRate: 0 },
      { maxWeightGrams: 2000, basePrice: 7.39, surcharge: 0.27, vatRate: 0 },
      { maxWeightGrams: 4000, basePrice: 8.66, surcharge: 0.27, vatRate: 0 },
      { maxWeightGrams: 10000, basePrice: 12.48, surcharge: 0.27, vatRate: 0 },
      { maxWeightGrams: 31500, basePrice: 20.08, surcharge: 0.32, vatRate: 0.2 }
    ];
    const bracket = brackets.find((b) => weightGrams <= b.maxWeightGrams);
    if (!bracket) return { gross: 0, net: 0, tax: 0, vatRate: 0, isAvailable: false };
    const gross = Number((Number(bracket.basePrice) + Number(bracket.surcharge)).toFixed(2));
    const net = Number((gross / (1 + Number(bracket.vatRate || 0))).toFixed(2));
    const tax = Number((gross - net).toFixed(2));
    return { gross, net, tax, vatRate: Number(bracket.vatRate || 0), isAvailable: true };
  }

  function calcExpressShipping() {
    const gross = Number(Number(appData.expressShippingPrice || 0).toFixed(2));
    const net = Number((gross / (1 + vatRate)).toFixed(2));
    const tax = Number((gross - net).toFixed(2));
    return { gross, net, tax, vatRate, isAvailable: gross >= 0 };
  }

  function getSelectedFulfillmentMethod() {
    const checked = document.querySelector('input[name="fulfillment_method"]:checked');
    return String(checked?.value || 'delivery');
  }

  function syncCouponApplyUi(state) {
    if (!checkoutCouponApply) return;
    const currentCode = String(checkoutDiscountCode?.value || '').trim().toUpperCase();
    const isApplied = state === 'applied' && currentCode && currentCode === appliedCouponCode;
    checkoutCouponApply.disabled = Boolean(isApplied);
    checkoutCouponApply.textContent = isApplied ? 'Aktiv' : 'Anwenden';
  }

  function openCart() {
    if (!cartPanel) return;
    const isMobile = isMobileCartMode();
    cartPanel.classList.add('open');
    if (isMobile) cartBackdrop?.classList.add('open');
    else cartBackdrop?.classList.remove('open');
    cartPanel.setAttribute('aria-hidden', 'false');
    cartBackdrop?.setAttribute('aria-hidden', isMobile ? 'false' : 'true');
    if (isMobile) {
      document.documentElement.classList.add('cart-open');
      document.body.classList.add('cart-open');
      header?.classList.add('cart-open');
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.classList.remove('cart-open');
      document.body.classList.remove('cart-open');
      header?.classList.remove('cart-open');
      document.body.style.overflow = '';
    }
  }

  function closeCart() {
    if (!cartPanel) return;
    cartPanel.classList.remove('open');
    cartBackdrop?.classList.remove('open');
    cartPanel.setAttribute('aria-hidden', 'true');
    cartBackdrop?.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('cart-open');
    document.body.classList.remove('cart-open');
    header?.classList.remove('cart-open');
    document.body.style.overflow = '';
  }

  function showCartToast(message) {
    if (!message) return;
    let node = document.getElementById('cartToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'cartToast';
      node.className = 'cart-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(cartToastTimer);
    cartToastTimer = window.setTimeout(() => {
      node.classList.remove('show');
    }, 2200);
  }

  function updateQty(productId, delta, optionKey) {
    const cart = loadCart();
    const item = cart.find((x) => Number(x.productId) === Number(productId) && String(x.optionKey || '') === String(optionKey || ''));
    if (!item) return;
    const nextQty = Number(item.qty || 1) + delta;
    if (nextQty <= 0) {
      removeItem(productId, optionKey);
      return;
    }
    item.qty = nextQty;
    saveCart(cart);
    renderCart();
    syncServerCartFromLocal();
  }

  function removeItem(productId, optionKey) {
    const next = loadCart().filter((x) => !(Number(x.productId) === Number(productId) && String(x.optionKey || '') === String(optionKey || '')));
    saveCart(next);
    renderCart();
    syncServerCartFromLocal();
  }

  async function renderCheckoutSummary() {
    if (!checkoutForm || !checkoutCartJson || !checkoutItems) return;
    const cart = loadCart();
    checkoutCartJson.value = JSON.stringify(cart);
    const goodsTotals = calcTotals(cart);
    const fulfillmentMethod = getSelectedFulfillmentMethod();
    const fallbackShipping =
      fulfillmentMethod === 'click_collect'
        ? { gross: 0, net: 0, tax: 0, vatRate: 0, isAvailable: true }
        : fulfillmentMethod === 'delivery_express'
          ? calcExpressShipping()
          : calcCheckoutShipping(cart);
    let totals = {
      net: Number((goodsTotals.net + fallbackShipping.net).toFixed(2)),
      tax: Number((goodsTotals.tax + fallbackShipping.tax).toFixed(2)),
      discountNet: 0,
      gross: Number((goodsTotals.gross + fallbackShipping.gross).toFixed(2))
    };
    let shipping = fallbackShipping;
    checkoutItems.innerHTML = '';

    if (!cart.length) {
      checkoutItems.innerHTML = '<div class="checkout-item"><span>Warenkorb leer</span><strong>0.00 EUR</strong></div>';
    } else {
      cart.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'checkout-item';
        const optionSummary = formatOptionSummary(item.selectedOptions);
        row.innerHTML = `<span>${item.qty}x ${item.title}${optionSummary ? `<br><small>${optionSummary}</small>` : ''}</span><strong>${money(Number(item.qty || 0) * Number(item.price || 0))}</strong>`;
        checkoutItems.appendChild(row);
      });
    }

    const requestId = ++checkoutSummaryRequestId;
    if (checkoutCouponInfo) checkoutCouponInfo.textContent = '';
    syncCouponApplyUi();
    try {
      const response = await fetch('/checkout/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cart_json: checkoutCartJson.value,
          fulfillment_method: fulfillmentMethod,
          discount_code: String(checkoutDiscountCode?.value || '').trim()
        })
      });
      if (response.ok) {
        const payload = await response.json();
        if (requestId === checkoutSummaryRequestId && payload?.ok && payload.totals) {
          totals = {
            net: Number(payload.totals.net || 0),
            tax: Number(payload.totals.tax || 0),
            discountNet: Number(payload.totals.discountNet || 0),
            gross: Number(payload.totals.gross || 0)
          };
          shipping = {
            ...shipping,
            gross: Number(payload.totals.shipping || 0),
            isAvailable: Boolean(payload.totals.shippingAvailable)
          };
          if (checkoutCouponInfo) {
            if (payload.coupon?.applied && payload.coupon?.code) {
              appliedCouponCode = String(payload.coupon.code || '').trim().toUpperCase();
              checkoutCouponInfo.textContent = `Rabattcode aktiv: ${payload.coupon.code}`;
              syncCouponApplyUi('applied');
            } else if (String(checkoutDiscountCode?.value || '').trim() && payload.coupon?.invalid) {
              appliedCouponCode = '';
              checkoutCouponInfo.textContent = 'Rabattcode ungültig oder abgelaufen.';
              syncCouponApplyUi();
            } else if (!String(checkoutDiscountCode?.value || '').trim()) {
              appliedCouponCode = '';
              syncCouponApplyUi();
            }
          }
        }
      }
    } catch (_error) {
      // Fallback to client-side totals if summary API is unavailable.
    }

    if (checkoutNet) checkoutNet.textContent = money(totals.net);
    if (checkoutDiscount) checkoutDiscount.textContent = totals.discountNet > 0 ? `- ${money(totals.discountNet)}` : money(0);
    if (checkoutTax) checkoutTax.textContent = money(totals.tax);
    if (checkoutShipping) {
      if (fulfillmentMethod === 'click_collect') checkoutShipping.textContent = '0.00 EUR (Abholung)';
      else if (fulfillmentMethod === 'delivery_express') checkoutShipping.textContent = `${money(shipping.gross)} (Express)`;
      else checkoutShipping.textContent = shipping.isAvailable ? money(shipping.gross) : 'Auf Anfrage';
    }
    if (checkoutGross) checkoutGross.textContent = money(totals.gross);
  }

  function renderCart() {
    const cart = loadCart();
    const totalQty = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const totals = calcTotals(cart);

    if (cartCountNode) {
      cartCountNode.textContent = String(totalQty);
      cartCountNode.classList.toggle('is-empty', totalQty <= 0);
      cartCountNode.setAttribute('aria-hidden', totalQty <= 0 ? 'true' : 'false');
    }
    if (cartNetNode) cartNetNode.textContent = money(totals.net);
    if (cartTaxNode) cartTaxNode.textContent = money(totals.tax);
    if (cartTotalNode) cartTotalNode.textContent = money(totals.gross);

    if (!cartItemsNode) return;
    if (!cart.length) {
      cartItemsNode.innerHTML = '<p>Dein Warenkorb ist leer.</p>';
      return;
    }

    cartItemsNode.innerHTML = '';
      cart.forEach((item) => {
      const line = document.createElement('article');
      line.className = 'cart-item';
      const imgSrc = item.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="88"><rect width="100%" height="100%" fill="%23f0f0f0"/></svg>';
      line.innerHTML = `
        <img src="${imgSrc}" alt="${item.title}" />
        <div class="cart-item-content">
          <p>${item.title}</p>
          ${formatOptionSummary(item.selectedOptions) ? `<small>${formatOptionSummary(item.selectedOptions)}</small>` : ''}
          <small>${money(item.price)}</small>
          <div class="cart-qty">
            <button type="button" data-act="minus">-</button>
            <span>${item.qty}</span>
            <button type="button" data-act="plus">+</button>
            <button type="button" data-act="remove"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      `;

      line.querySelector('[data-act="minus"]').addEventListener('click', () => updateQty(item.productId, -1, item.optionKey || ''));
      line.querySelector('[data-act="plus"]').addEventListener('click', () => updateQty(item.productId, 1, item.optionKey || ''));
      line.querySelector('[data-act="remove"]').addEventListener('click', () => removeItem(item.productId, item.optionKey || ''));
      cartItemsNode.appendChild(line);
    });

    renderCheckoutSummary();
  }

  function addToCart(data) {
    const productId = Number(data.productId);
    if (!productId) return;
    const qty = Math.max(1, Number(data.qty || 1));
    const selectedOptions = normalizeSelectedOptions(data.selectedOptions);
    const optionKey = makeOptionKey(selectedOptions);
    const cart = loadCart();
    const existing = cart.find((item) => Number(item.productId) === productId && String(item.optionKey || '') === optionKey);
    if (existing) {
      existing.qty += qty;
      if (data.image && !existing.image) existing.image = data.image;
      if (data.weightGrams != null) existing.weightGrams = normalizeWeightGrams(data.weightGrams);
      existing.selectedOptions = selectedOptions;
      existing.optionKey = optionKey;
    } else {
      cart.push({
        productId,
        title: data.title || 'Produkt',
        price: Number(data.price || 0),
        qty,
        image: data.image || '',
        weightGrams: normalizeWeightGrams(data.weightGrams),
        selectedOptions,
        optionKey
      });
    }
    saveCart(cart);
    renderCart();
    syncServerCartFromLocal();
    showCartToast(`${data.title || 'Produkt'} wurde zum Warenkorb hinzugefuegt.`);
  }

  function renderSuggestions(queryText) {
    if (!suggestionsNode) return;
    const query = String(queryText || '').trim().toLowerCase();
    suggestionsNode.innerHTML = '';
    if (!query) return;
    const items = (appData.searchItems || []).filter((item) => item.keywords.includes(query)).slice(0, 8);
    items.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.label}</span><small>${item.type}</small>`;
      li.addEventListener('click', () => {
        window.location.href = item.url;
      });
      suggestionsNode.appendChild(li);
    });
  }

  if (searchToggle) {
    searchToggle.addEventListener('click', function () {
      if (header && header.classList.contains('hide-on-top')) header.classList.add('header-visible');
      searchPanel.classList.toggle('open');
      if (searchPanel.classList.contains('open')) searchInput.focus();
    });
  }

  searchInput?.addEventListener('input', (event) => renderSuggestions(event.target.value));

  cartToggle?.addEventListener('click', function () {
    if (header && header.classList.contains('hide-on-top')) header.classList.add('header-visible');
    if (cartPanel.classList.contains('open')) closeCart();
    else openCart();
  });
  cartClose?.addEventListener('click', closeCart);
  cartBackdrop?.addEventListener('click', closeCart);

  document.addEventListener('click', function (event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const clickedInsideSearch = path.length
      ? (searchPanel && path.includes(searchPanel)) || (searchToggle && path.includes(searchToggle))
      : (searchPanel && searchPanel.contains(event.target)) || (searchToggle && searchToggle.contains(event.target));
    const clickedInsideCart = path.length
      ? (cartPanel && path.includes(cartPanel)) || (cartToggle && path.includes(cartToggle))
      : (cartPanel && cartPanel.contains(event.target)) || (cartToggle && cartToggle.contains(event.target));

    if (searchPanel && searchToggle && !clickedInsideSearch) {
      searchPanel.classList.remove('open');
    }
    if (cartPanel && cartToggle && !clickedInsideCart) {
      closeCart();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeCart();
  });

  function buildProductPageSelectedOptions() {
    const selectedOptions = {};
    const activeColor = document.querySelector('.color-chip.active');
    const activeSize = document.querySelector('.size-chip.active');
    if (activeColor) selectedOptions.color = String(activeColor.dataset.optionColor || activeColor.textContent || '').trim();
    if (activeSize) selectedOptions.size = String(activeSize.dataset.optionSize || activeSize.textContent || '').trim();
    const pText = collectPersonalizationText();
    if (pText) selectedOptions.personalization = pText;
    return selectedOptions;
  }

  function isProductBuyboxButton(button) {
    return button && (button.id === 'addProductToCart' || button.id === 'productQuickBuy');
  }

  addToCartButtons.forEach((button) => {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      const selectedOptions = isProductBuyboxButton(button) ? buildProductPageSelectedOptions() : {};
      addToCart({
        productId: button.dataset.productId,
        title: button.dataset.productTitle,
        price: button.dataset.productPrice,
        image: button.dataset.productImage,
        weightGrams: button.dataset.productWeight,
        qty: isProductBuyboxButton(button) && qtyInput ? Number(qtyInput.value || 1) : 1,
        selectedOptions
      });
      if (button.id === 'productQuickBuy') {
        window.location.href = '/checkout';
      }
    });
  });

  document.querySelectorAll('input[name="fulfillment_method"]').forEach((input) => {
    input.addEventListener('change', renderCheckoutSummary);
  });
  checkoutCouponApply?.addEventListener('click', renderCheckoutSummary);
  checkoutDiscountCode?.addEventListener('input', () => {
    if (checkoutCouponInfo) checkoutCouponInfo.textContent = '';
    const currentCode = String(checkoutDiscountCode.value || '').trim().toUpperCase();
    if (!currentCode || currentCode !== appliedCouponCode) {
      syncCouponApplyUi();
    }
  });
  checkoutDiscountCode?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renderCheckoutSummary();
    }
  });

  productCards.forEach((card) => {
    card.addEventListener('click', function (event) {
      if (event.target.closest('a,button,input,label,select,textarea')) return;
      const productLink = card.querySelector('h4 a[href], .product-media a[href], a[href]');
      const href = productLink?.getAttribute('href');
      if (href) {
        window.location.href = href;
      }
    });
  });

  heroCards.forEach((card) => {
    card.addEventListener('click', function () {
      heroCards.forEach((item) => item.classList.remove('is-selected'));
      card.classList.add('is-selected');
    });
  });

  const initSnapSlider = function (track, prevButton, nextButton, itemSelector) {
    if (!track || !prevButton || !nextButton) return;

    const getSnapPoints = function () {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const rawPoints = Array.from(track.querySelectorAll(itemSelector)).map((card) => {
        const left = card.offsetLeft - track.offsetLeft;
        return Math.max(0, Math.min(maxScroll, Math.round(left)));
      });
      const unique = Array.from(new Set(rawPoints)).sort((a, b) => a - b);
      if (!unique.length) unique.push(0);
      if (unique[unique.length - 1] !== maxScroll) unique.push(maxScroll);
      return unique;
    };

    const getNearestSnapIndex = function (points, current) {
      let nearestIndex = 0;
      let nearestDelta = Infinity;
      points.forEach((point, index) => {
        const delta = Math.abs(point - current);
        if (delta < nearestDelta) {
          nearestDelta = delta;
          nearestIndex = index;
        }
      });
      return nearestIndex;
    };

    let currentSnapIndex = 0;

    const syncSnapIndexFromScroll = function () {
      const points = getSnapPoints();
      if (!points.length) return;
      currentSnapIndex = getNearestSnapIndex(points, track.scrollLeft);
    };

    const goToSnapIndex = function (nextIndex) {
      const points = getSnapPoints();
      if (!points.length) return;
      const maxIndex = points.length - 1;
      if (nextIndex < 0) currentSnapIndex = maxIndex;
      else if (nextIndex > maxIndex) currentSnapIndex = 0;
      else currentSnapIndex = nextIndex;
      track.scrollTo({ left: points[currentSnapIndex], behavior: 'smooth' });
    };

    prevButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      syncSnapIndexFromScroll();
      goToSnapIndex(currentSnapIndex - 1);
    });

    nextButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      syncSnapIndexFromScroll();
      goToSnapIndex(currentSnapIndex + 1);
    });

    track.addEventListener('scroll', syncSnapIndexFromScroll, { passive: true });
    window.addEventListener('resize', syncSnapIndexFromScroll);
    syncSnapIndexFromScroll();
  };

  initSnapSlider(highlightsTrack, highlightsPrev, highlightsNext, '.highlight-card');
  initSnapSlider(magazineTrack, magazinePrev, magazineNext, '.magazine-slide');

  if (productMainImage && thumbButtons.length) {
    const setActiveProductImageByIndex = function (index) {
      if (!thumbButtons.length) return;
      const normalizedIndex = Math.max(0, Math.min(thumbButtons.length - 1, Number(index || 0)));
      const btn = thumbButtons[normalizedIndex];
      const image = btn?.dataset.image;
      if (!btn || !image) return;
      productMainImage.src = image;
      thumbButtons.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      if (window.matchMedia('(max-width: 980px)').matches) {
        const thumbsContainer = btn.closest('.product-thumbs');
        if (thumbsContainer) {
          const targetLeft = btn.offsetLeft - Math.max(0, (thumbsContainer.clientWidth - btn.offsetWidth) / 2);
          thumbsContainer.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        }
      }
    };

    const getActiveProductImageIndex = function () {
      const activeIndex = thumbButtons.findIndex((btn) => btn.classList.contains('active'));
      return activeIndex >= 0 ? activeIndex : 0;
    };

    thumbButtons.forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveProductImageByIndex(thumbButtons.indexOf(btn));
      });
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchTracking = false;
    productMainImage.addEventListener(
      'touchstart',
      (event) => {
        if (!window.matchMedia('(max-width: 980px)').matches) return;
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchTracking = true;
      },
      { passive: true }
    );
    productMainImage.addEventListener(
      'touchend',
      (event) => {
        if (!touchTracking || !window.matchMedia('(max-width: 980px)').matches) return;
        touchTracking = false;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
        const activeIndex = getActiveProductImageIndex();
        if (deltaX < 0) {
          setActiveProductImageByIndex((activeIndex + 1) % thumbButtons.length);
        } else {
          setActiveProductImageByIndex((activeIndex - 1 + thumbButtons.length) % thumbButtons.length);
        }
      },
      { passive: true }
    );
  }

  if (qtyInput && buyTotal) {
    const unitPrice = Number(appData.productPage?.unitPrice || 0);
    const recalc = function () {
      const qty = Math.max(1, Number(qtyInput.value || 1));
      qtyInput.value = String(qty);
      buyTotal.textContent = money(unitPrice * qty);
    };
    qtyMinus?.addEventListener('click', () => {
      qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) - 1));
      recalc();
    });
    qtyPlus?.addEventListener('click', () => {
      qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) + 1));
      recalc();
    });
    qtyInput.addEventListener('input', recalc);
    recalc();
  }

  const activateChoice = function (buttons, current) {
    buttons.forEach((item) => item.classList.remove('active'));
    current.classList.add('active');
  };
  const colorChips = Array.from(document.querySelectorAll('.color-chip'));
  const sizeChips = Array.from(document.querySelectorAll('.size-chip'));
  const personalizeRoot = document.getElementById('productPersonalize');
  const personalizeNoneBtn = document.getElementById('personalizeNoneBtn');
  const personalizeTextInputs = Array.from(document.querySelectorAll('.personalize-text-input'));
  const colorStock = appData.productPage?.colorStock || {};

  function collectPersonalizationText() {
    if (!personalizeRoot || !personalizeTextInputs.length) return '';
    if (personalizeNoneBtn && personalizeNoneBtn.classList.contains('active')) return '';
    const parts = [];
    personalizeTextInputs.forEach((input) => {
      const label = String(input.dataset.personalizeField || input.placeholder || '').trim();
      const value = String(input.value || '').trim();
      if (value) parts.push(`${label}: ${value}`);
    });
    return parts.join(' | ');
  }

  function syncPersonalizeNoneState() {
    if (!personalizeRoot || !personalizeNoneBtn) return;
    const hasText = personalizeTextInputs.some((input) => String(input.value || '').trim());
    if (hasText) {
      personalizeNoneBtn.classList.remove('active');
      personalizeNoneBtn.setAttribute('aria-pressed', 'false');
      personalizeRoot.classList.remove('is-none-selected');
    } else {
      personalizeNoneBtn.classList.add('active');
      personalizeNoneBtn.setAttribute('aria-pressed', 'true');
      personalizeRoot.classList.add('is-none-selected');
    }
  }

  const namedColors = {
    schwarz: '#2a211b',
    black: '#2a211b',
    weiss: '#f7f4ef',
    white: '#f7f4ef',
    gold: '#c9a24f',
    silber: '#c8c8c8',
    silver: '#c8c8c8',
    rosa: '#c5a1aa',
    rose: '#c5a1aa',
    nude: '#d3c7b8',
    beige: '#d3c7b8',
    braun: '#6d5142',
    brown: '#6d5142'
  };

  const toColor = function (name) {
    const normalized = String(name || '').trim().toLowerCase();
    if (namedColors[normalized]) return namedColors[normalized];
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return `#${'00000'.substring(0, 6 - c.length)}${c}`;
  };

  colorChips.forEach((chip) => {
    const label = chip.dataset.optionColor || chip.textContent;
    chip.style.background = toColor(label);
    chip.style.color = 'transparent';
    chip.addEventListener('click', function () {
      activateChoice(colorChips, chip);
      const stock = Number(colorStock[label] || 0);
      if (qtyInput && stock > 0 && Number(qtyInput.value || 1) > stock) qtyInput.value = String(stock);
      if (qtyInput) qtyInput.max = stock > 0 ? String(stock) : '';
      qtyInput?.dispatchEvent(new Event('input'));
    });
  });
  sizeChips.forEach((chip) => chip.addEventListener('click', () => activateChoice(sizeChips, chip)));
  if (personalizeNoneBtn && personalizeTextInputs.length) {
    personalizeRoot?.classList.add('is-none-selected');
    personalizeNoneBtn.addEventListener('click', function () {
      personalizeTextInputs.forEach((input) => {
        input.value = '';
      });
      personalizeNoneBtn.classList.add('active');
      personalizeNoneBtn.setAttribute('aria-pressed', 'true');
      personalizeRoot?.classList.add('is-none-selected');
    });
    personalizeTextInputs.forEach((input) => {
      input.addEventListener('input', function () {
        syncPersonalizeNoneState();
      });
      input.addEventListener('focus', function () {
        if (personalizeNoneBtn && personalizeNoneBtn.classList.contains('active')) {
          personalizeNoneBtn.classList.remove('active');
          personalizeNoneBtn.setAttribute('aria-pressed', 'false');
          personalizeRoot?.classList.remove('is-none-selected');
        }
      });
    });
  }

  renderCheckoutSummary();

  if (header && header.classList.contains('hide-on-top')) {
    const onScroll = function () {
      if (window.innerWidth <= 980) {
        header.classList.add('header-visible');
        return;
      }
      header.classList.toggle('header-visible', window.scrollY > 70);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  if (window.location.pathname.startsWith('/checkout/success/')) {
    localStorage.removeItem(cartStorageKey);
  }

  if (appData.initialQuery) renderSuggestions(appData.initialQuery);
  renderCart();
  bootstrapServerCart();
})();

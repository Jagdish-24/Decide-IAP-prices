/**
 * PlayPrice Engine • Core Application Logic
 * Comprehensive IAP & App Pricing Calculator for Google Play Store
 */

(function () {
  'use strict';

  // 1. Initial State
  const state = {
    baseCurrency: 'USD',
    appPrice: 1.99,
    appName: 'mygame',
    playFeeRate: 0.15,
    bufferRate: 0.02,
    pppStrength: 1.0,
    charmRounding: true,
    discountEnabled: false,
    discountRate: 25,
    discountCharm: true,
    activeProductId: 'iap_1', // default selected product
    searchQuery: '',
    visibleColumns: {
      country: true,
      currency: true,
      retail: true,
      discount: true,
      tax: true,
      playcut: true,
      buffercut: true,
      netlocal: true,
      netusd: true,
      netinr: true,
      mindset: true,
      action: true
    },
    exchangeRates: window.FALLBACK_EXCHANGE_RATES || {},
    countries: window.PLAY_STORE_COUNTRIES || [],
    catalogueItems: [
      { id: 'iap_1', name: 'No Ads', price: 1.50 },
      { id: 'iap_2', name: 'Starter Pack', price: 1.99 },
      { id: 'iap_3', name: 'Gold 1', price: 0.99 },
      { id: 'iap_4', name: 'Gold 2', price: 2.99 },
      { id: 'iap_5', name: 'Gold 3', price: 4.99 },
      { id: 'iap_6', name: 'Gold 4', price: 9.99 },
      { id: 'iap_7', name: 'Gold 5', price: 19.99 },
      { id: 'iap_8', name: 'Gold 6', price: 49.99 }
    ]
  };

  // Table Column Definitions & Presets
  const COLUMN_DEFINITIONS = [
    { id: 'country', name: 'Country & Tier', category: 'general' },
    { id: 'currency', name: 'Currency (ISO)', category: 'general' },
    { id: 'retail', name: 'End-User Retail Price', category: 'pricing' },
    { id: 'discount', name: 'Discounted Price', category: 'pricing', isPromo: true },
    { id: 'tax', name: 'Tax / VAT Cut', category: 'deductions' },
    { id: 'playcut', name: 'Google Play Fee', category: 'deductions' },
    { id: 'buffercut', name: 'Buffer Cut (FX/TDS)', category: 'deductions' },
    { id: 'netlocal', name: 'Developer Net (Local)', category: 'earnings' },
    { id: 'netusd', name: 'Developer Net (USD)', category: 'earnings' },
    { id: 'netinr', name: 'Developer Net (INR)', category: 'earnings' },
    { id: 'mindset', name: 'Gamer Profile', category: 'insights' },
    { id: 'action', name: 'Action (Strategy)', category: 'insights' }
  ];

  const COLUMN_PRESETS = {
    all: {
      country: true, currency: true, retail: true, discount: true,
      tax: true, playcut: true, buffercut: true,
      netlocal: true, netusd: true, netinr: true, mindset: true, action: true
    },
    essential: {
      country: true, currency: true, retail: true, discount: true,
      tax: false, playcut: false, buffercut: false,
      netlocal: false, netusd: true, netinr: true, mindset: false, action: true
    },
    earnings: {
      country: true, currency: true, retail: true, discount: true,
      tax: false, playcut: false, buffercut: false,
      netlocal: true, netusd: true, netinr: true, mindset: false, action: false
    },
    cuts: {
      country: true, currency: true, retail: true, discount: false,
      tax: true, playcut: true, buffercut: true,
      netlocal: false, netusd: true, netinr: false, mindset: false, action: false
    }
  };

  // Vector SVG Icons for Copy & Checkmark (Strictly no emojis)
  const COPY_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  const CHECK_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="check-svg"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  // Slug & IAP Identifier Sanitizer
  function sanitizeSlug(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-');
  }

  // Generate Google Play IAP Product ID & Offer IDs
  function generateIapIds(appName, prodName, discountRate) {
    const cleanApp = sanitizeSlug(appName || 'mygame') || 'mygame';
    const cleanProd = sanitizeSlug(prodName || 'item') || 'item';

    // Product ID: com.{app}.shop.{product}
    const productId = `com.${cleanApp}.shop.${cleanProd}`;

    // Default Offer ID: com-{app}-shop-{product} (uses - instead of .)
    const offerId = `com-${cleanApp}-shop-${cleanProd}`;

    // Promotional Offer ID (with discount suffix)
    const discountOfferId = `com-${cleanApp}-shop-${cleanProd}-${discountRate}-percent-discount`;

    return { productId, offerId, discountOfferId };
  }

  // Standard Indian charm price points for mobile gaming
  const INR_LADDER = [
    9, 19, 29, 39, 49, 79, 89, 99, 110, 149, 199, 249, 299, 399, 499,
    599, 799, 899, 999, 1199, 1499, 1999, 2499, 2999, 3999, 4999
  ];

  // DOM Elements Cache
  const elements = {};

  function initDOMElements() {
    elements.baseCurrencyBtns = document.querySelectorAll('#baseCurrencySelector .currency-btn');
    elements.appPriceInput = document.getElementById('appPriceInput');
    elements.appPriceSymbol = document.getElementById('appPriceSymbol');
    elements.googlePlayFeeBtns = document.querySelectorAll('#googlePlayFeeToggle .toggle-btn');
    elements.bufferFeeRange = document.getElementById('bufferFeeRange');
    elements.bufferFeeDisplay = document.getElementById('bufferFeeDisplay');
    elements.pppStrengthRange = document.getElementById('pppStrengthRange');
    elements.pppStrengthDisplay = document.getElementById('pppStrengthDisplay');
    elements.charmRoundingToggle = document.getElementById('charmRoundingToggle');

    // App Identifier & ID Generator elements
    elements.appNameInput = document.getElementById('appNameInput');
    elements.previewProdId = document.getElementById('previewProdId');
    elements.previewOfferId = document.getElementById('previewOfferId');
    elements.discountOfferSyntaxBadge = document.getElementById('discountOfferSyntaxBadge');
    elements.promoBadgeCode = document.getElementById('promoBadgeCode');

    // Discount elements
    elements.discountEnableToggle = document.getElementById('discountEnableToggle');
    elements.discountControlsRow = document.getElementById('discountControlsRow');
    elements.discountRateRange = document.getElementById('discountRateRange');
    elements.discountRateDisplay = document.getElementById('discountRateDisplay');
    elements.discountCharmToggle = document.getElementById('discountCharmToggle');

    elements.catalogueItemsList = document.getElementById('catalogueItemsList');
    elements.skuCountPill = document.getElementById('skuCountPill');
    elements.promoStatusPill = document.getElementById('promoStatusPill');
    elements.addItemForm = document.getElementById('addItemForm');
    elements.newItemName = document.getElementById('newItemName');
    elements.newItemPrice = document.getElementById('newItemPrice');
    elements.btnResetCatalogue = document.getElementById('btnResetCatalogue');
    elements.btnQuickAdd = document.getElementById('btnQuickAdd');
    elements.btnGenerate = document.getElementById('btnGenerate');
    elements.btnExportAllCsv = document.getElementById('btnExportAllCsv');
    elements.btnCopyPlayConsole = document.getElementById('btnCopyPlayConsole');
    elements.columnPickerContainer = document.getElementById('columnPickerContainer');
    elements.btnColumnToggle = document.getElementById('btnColumnToggle');
    elements.columnPickerMenu = document.getElementById('columnPickerMenu');
    elements.btnCloseColMenu = document.getElementById('btnCloseColMenu');
    elements.visibleColumnsCount = document.getElementById('visibleColumnsCount');
    elements.columnCheckboxGrid = document.getElementById('columnCheckboxGrid');
    elements.presetBtns = document.querySelectorAll('.column-presets-bar .btn-preset-pill');
    elements.btnHelpModal = document.getElementById('btnHelpModal');
    elements.fxStatusPill = document.getElementById('fxStatusPill');
    elements.fxStatusText = document.getElementById('fxStatusText');
    elements.activeProductSelector = document.getElementById('activeProductSelector');
    elements.globalCountrySearch = document.getElementById('globalCountrySearch');
    elements.btnClearSearch = document.getElementById('btnClearSearch');

    // KPI Elements
    elements.kpiActiveItemName = document.getElementById('kpiActiveItemName');
    elements.kpiActiveItemPrice = document.getElementById('kpiActiveItemPrice');
    elements.kpiTier1Net = document.getElementById('kpiTier1Net');
    elements.kpiTier2Net = document.getElementById('kpiTier2Net');
    elements.kpiTier3Net = document.getElementById('kpiTier3Net');

    // Section headers & counts
    elements.masterCount = document.getElementById('masterCount');
    elements.tier1Count = document.getElementById('tier1Count');
    elements.tier2Count = document.getElementById('tier2Count');
    elements.tier3Count = document.getElementById('tier3Count');

    // Table bodies
    elements.tbodyMaster = document.getElementById('tbodyMaster');
    elements.tbodyTier1 = document.getElementById('tbodyTier1');
    elements.tbodyTier2 = document.getElementById('tbodyTier2');
    elements.tbodyTier3 = document.getElementById('tbodyTier3');

    // Modals
    elements.countryModalBackdrop = document.getElementById('countryModalBackdrop');
    elements.btnCloseModal = document.getElementById('btnCloseModal');
    elements.btnModalCloseAction = document.getElementById('btnModalCloseAction');
    elements.logicModalBackdrop = document.getElementById('logicModalBackdrop');
    elements.btnCloseLogicModal = document.getElementById('btnCloseLogicModal');
    elements.btnAcceptLogic = document.getElementById('btnAcceptLogic');

    // Modal Details elements
    elements.modalFlag = document.getElementById('modalFlag');
    elements.modalCountryName = document.getElementById('modalCountryName');
    elements.modalTierBadge = document.getElementById('modalTierBadge');
    elements.modalIsoCode = document.getElementById('modalIsoCode');
    elements.modalCurrencyInfo = document.getElementById('modalCurrencyInfo');
    elements.modalItemName = document.getElementById('modalItemName');
    elements.modalRetailPrice = document.getElementById('modalRetailPrice');
    elements.modalBaseEquiv = document.getElementById('modalBaseEquiv');
    elements.modalPppDiscount = document.getElementById('modalPppDiscount');
    elements.modalWaterfallBars = document.getElementById('modalWaterfallBars');
    elements.modalWillingness = document.getElementById('modalWillingness');
    elements.modalPaymentMethods = document.getElementById('modalPaymentMethods');
    elements.modalMindset = document.getElementById('modalMindset');
    elements.modalRecommendation = document.getElementById('modalRecommendation');

    elements.toastContainer = document.getElementById('toastContainer');
  }

  // 2. Fetch Live Currency Rates
  async function fetchLiveExchangeRates() {
    try {
      elements.fxStatusText.textContent = 'Connecting Rates...';
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      if (data && data.rates) {
        state.exchangeRates = data.rates;
        elements.fxStatusText.textContent = 'Live FX Active (Synced)';
        showToast('Live exchange rates synchronized', 'success');
      }
    } catch (err) {
      console.warn('Using cached exchange rates fallback:', err);
      elements.fxStatusText.textContent = 'Cached Rates (Offline Mode)';
      showToast('Operating on verified cached exchange rates', 'info');
    }
  }

  // 3. Mathematical & Pricing Engine
  function getRate(currCode) {
    if (currCode === 'USD') return 1.0;
    return state.exchangeRates[currCode] || 1.0;
  }

  function getActiveProduct() {
    if (state.activeProductId === 'app_price') {
      return { id: 'app_price', name: 'App Price (Download)', price: state.appPrice };
    }
    const item = state.catalogueItems.find(i => i.id === state.activeProductId);
    return item || { id: 'app_price', name: 'App Price', price: state.appPrice };
  }

  // Apply psychological charm pricing
  function applyCharmPricing(rawPrice, currencyCode) {
    if (currencyCode === 'INR') {
      let closest = INR_LADDER[0];
      let minDiff = Math.abs(rawPrice - closest);
      for (const step of INR_LADDER) {
        const diff = Math.abs(rawPrice - step);
        if (diff < minDiff) {
          minDiff = diff;
          closest = step;
        }
      }
      return closest;
    }

    if (currencyCode === 'JPY') {
      return Math.max(10, Math.round(rawPrice / 10) * 10);
    }

    if (currencyCode === 'KRW') {
      return Math.max(100, Math.round(rawPrice / 100) * 100);
    }

    if (currencyCode === 'IDR' || currencyCode === 'VND') {
      return Math.max(1000, Math.round(rawPrice / 1000) * 1000);
    }

    if (['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'].includes(currencyCode)) {
      if (rawPrice < 0.70) return 0.49;
      if (rawPrice < 1.25) return 0.99;
      const floor = Math.floor(rawPrice);
      const frac = rawPrice - floor;
      if (frac < 0.35) return Math.max(0.49, floor - 0.01);
      if (frac < 0.75) return floor + 0.49;
      return floor + 0.99;
    }

    if (currencyCode === 'BRL') {
      const floor = Math.floor(rawPrice);
      const frac = rawPrice - floor;
      if (frac < 0.5) return floor + 0.49;
      return floor + 0.90;
    }

    if (rawPrice >= 100) {
      return Math.round(rawPrice);
    }
    return Math.round(rawPrice * 100) / 100;
  }

  // Calculate pricing breakdown for a single country and product price
  function calculateCountryPricing(country, basePrice, baseCurr) {
    const baseToUsdRate = getRate(baseCurr);
    const usdPrice = baseCurr === 'USD' ? basePrice : (basePrice / baseToUsdRate);

    // PPP Adjustment
    const effectivePpp = 1.0 + (country.pppRatio - 1.0) * state.pppStrength;
    const targetUsd = usdPrice * effectivePpp;

    // Converted to local currency
    const localRate = getRate(country.currency);
    const rawLocalPrice = targetUsd * localRate;

    // Determine gross retail price with optional charm rounding
    let retailPrice = rawLocalPrice;
    if (state.charmRounding) {
      retailPrice = applyCharmPricing(rawLocalPrice, country.currency);
    } else {
      retailPrice = Math.round(rawLocalPrice * 100) / 100;
    }

    // Promotional Discount Calculation (if enabled)
    let discountedPrice = retailPrice;
    if (state.discountEnabled) {
      const rawDiscounted = retailPrice * (1 - state.discountRate / 100);
      if (state.discountCharm) {
        discountedPrice = applyCharmPricing(rawDiscounted, country.currency);
      } else {
        discountedPrice = Math.round(rawDiscounted * 100) / 100;
      }
    }

    // Pricing base to use for tax and cuts (discounted if enabled and active)
    const effectiveRetail = retailPrice;

    // VAT / Tax Cut
    let taxAmount = 0;
    let netRevenueBase = effectiveRetail;

    if (country.taxType === 'included' && country.taxRate > 0) {
      taxAmount = effectiveRetail * (country.taxRate / (100 + country.taxRate));
      netRevenueBase = effectiveRetail - taxAmount;
    } else {
      taxAmount = 0;
      netRevenueBase = effectiveRetail;
    }

    // Google Play Cut (15% or 30% of Net Revenue Base)
    const playStoreCut = netRevenueBase * state.playFeeRate;

    // Buffer Cut (e.g. 2% of Net Revenue Base)
    const bufferCut = netRevenueBase * state.bufferRate;

    // Developer Net Proceeds in Local Currency
    const developerNetLocal = netRevenueBase - playStoreCut - bufferCut;

    // Converted Developer Net in USD
    const developerNetInUsd = country.currency === 'USD' ? developerNetLocal : (developerNetLocal / localRate);
    
    // Converted Developer Net in INR
    const inrRate = getRate('INR');
    const developerNetInInr = developerNetInUsd * inrRate;

    // Converted Developer Net in Selected Base Currency
    const developerNetInBase = baseCurr === 'USD' ? developerNetInUsd : (developerNetInUsd * baseToUsdRate);

    // Retail in Base Currency equivalent
    const retailInUsd = country.currency === 'USD' ? retailPrice : (retailPrice / localRate);
    const retailInBase = baseCurr === 'USD' ? retailInUsd : (retailInUsd * baseToUsdRate);

    // Percentage of retail price
    const taxPct = retailPrice > 0 ? (taxAmount / retailPrice) * 100 : 0;
    const playCutPct = retailPrice > 0 ? (playStoreCut / retailPrice) * 100 : 0;
    const bufferPct = retailPrice > 0 ? (bufferCut / retailPrice) * 100 : 0;
    const developerNetPct = retailPrice > 0 ? (developerNetLocal / retailPrice) * 100 : 0;

    return {
      country,
      retailPrice,
      discountedPrice,
      retailInBase,
      taxAmount,
      taxPct,
      netRevenueBase,
      playStoreCut,
      playCutPct,
      bufferCut,
      bufferPct,
      developerNetLocal,
      developerNetInBase,
      developerNetInUsd,
      developerNetInInr,
      developerNetPct,
      effectivePpp
    };
  }

  // 4. Formatting Helpers (Strictly ISO Currency Codes, No Symbols)
  function formatMoney(amount, currencyCode) {
    if (isNaN(amount)) return `${currencyCode} 0.00`;
    let formatted = '';
    if (['INR', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP'].includes(currencyCode)) {
      formatted = Math.round(amount).toLocaleString('en-US');
    } else {
      formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return `${currencyCode} ${formatted}`;
  }

  function formatCleanNumber(amount, currencyCode) {
    if (isNaN(amount)) return '0.00';
    if (['INR', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP'].includes(currencyCode)) {
      return String(Math.round(amount));
    }
    return amount.toFixed(2);
  }

  function formatPct(val) {
    return `${val.toFixed(1)}%`;
  }

  // 5. Catalogue Items Persistence & Seamless Editing
  function saveCatalogueItems() {
    try {
      localStorage.setItem('playprice_catalogue', JSON.stringify({
        items: state.catalogueItems,
        activeProductId: state.activeProductId
      }));
    } catch (e) {
      console.warn('Could not save catalogue to localStorage', e);
    }
  }

  function loadCatalogueItems() {
    try {
      const saved = localStorage.getItem('playprice_catalogue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          state.catalogueItems = parsed.items;
          if (parsed.activeProductId && (parsed.activeProductId === 'app_price' || state.catalogueItems.some(i => i.id === parsed.activeProductId))) {
            state.activeProductId = parsed.activeProductId;
          }
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          state.catalogueItems = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load catalogue from localStorage', e);
    }
  }

  function renderCatalogueItems() {
    elements.catalogueItemsList.innerHTML = '';
    const baseCode = state.baseCurrency;

    // Update live previews in App Identifier card
    const firstItem = state.catalogueItems[0] || { name: 'no-ads' };
    const sampleIds = generateIapIds(state.appName, firstItem.name, state.discountRate);
    if (elements.previewProdId) elements.previewProdId.textContent = sampleIds.productId;
    if (elements.previewOfferId) elements.previewOfferId.textContent = sampleIds.offerId;
    if (elements.promoBadgeCode) elements.promoBadgeCode.textContent = `...-${state.discountRate}-percent-discount`;
    if (elements.discountOfferSyntaxBadge) {
      elements.discountOfferSyntaxBadge.style.display = state.discountEnabled ? 'inline-flex' : 'none';
    }
    if (elements.skuCountPill) {
      const count = state.catalogueItems.length;
      elements.skuCountPill.textContent = `${count} ${count === 1 ? 'Product' : 'Products'}`;
    }
    if (elements.promoStatusPill) {
      elements.promoStatusPill.style.display = state.discountEnabled ? 'inline-flex' : 'none';
      elements.promoStatusPill.textContent = `Promo Offer (-${state.discountRate}%) Active`;
    }

    if (state.catalogueItems.length === 0) {
      elements.catalogueItemsList.innerHTML = `
        <div class="empty-catalogue-box">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-muted"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          <p>No products in catalogue.</p>
          <button class="btn btn-secondary btn-sm" id="btnEmptyReset">Restore Default SKUs</button>
        </div>
      `;
      const btnEmptyReset = document.getElementById('btnEmptyReset');
      if (btnEmptyReset) {
        btnEmptyReset.addEventListener('click', () => {
          elements.btnResetCatalogue.click();
        });
      }
      updateActiveProductSelector();
      return;
    }

    state.catalogueItems.forEach((item) => {
      const isActive = state.activeProductId === item.id;
      const ids = generateIapIds(state.appName, item.name, state.discountRate);
      const card = document.createElement('div');
      card.className = `sku-card ${isActive ? 'is-active-sku' : ''}`;
      card.setAttribute('data-id', item.id);

      let discountOfferRowHtml = '';
      if (state.discountEnabled) {
        discountOfferRowHtml = `
          <div class="sku-id-row">
            <div class="sku-id-left">
              <span class="sku-id-label label-discount">OFFER (-${state.discountRate}%)</span>
              <span class="sku-id-code discount-offer-code" title="${escapeHTML(ids.discountOfferId)}">${escapeHTML(ids.discountOfferId)}</span>
            </div>
            <button class="btn-icon-copy" data-copy-val="${escapeHTML(ids.discountOfferId)}" data-type="Discount Offer ID" title="Copy Discount Offer ID to clipboard">
              ${COPY_ICON_SVG}
            </button>
          </div>
        `;
      }

      card.innerHTML = `
        <!-- View Mode Top Bar -->
        <div class="sku-card-top view-mode">
          <div class="sku-info" title="Click to preview this item in pricing tables">
            <span class="sku-name">${escapeHTML(item.name)}</span>
            <span class="sku-price">${baseCode} ${item.price.toFixed(2)}</span>
            ${isActive ? '<span class="sku-active-tag">PREVIEW</span>' : ''}
          </div>
          <div class="sku-top-actions">
            <button class="sku-action-btn sku-edit-btn" title="Edit product name &amp; price" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="sku-action-btn sku-delete-btn" title="Delete product SKU" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>

        <!-- Inline Edit Mode Bar -->
        <div class="sku-card-top edit-mode" style="display: none;">
          <div class="sku-inline-edit-fields">
            <input type="text" class="sku-edit-name-input" value="${escapeHTML(item.name)}" placeholder="Product Name" spellcheck="false" autocomplete="off" required>
            <div class="sku-edit-price-box">
              <span class="sku-edit-curr-tag">${baseCode}</span>
              <input type="number" step="0.01" min="0.01" class="sku-edit-price-input" value="${item.price.toFixed(2)}" placeholder="1.50" required>
            </div>
          </div>
          <div class="sku-edit-actions">
            <button type="button" class="sku-btn-save" title="Save changes (Enter)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Save</span>
            </button>
            <button type="button" class="sku-btn-cancel" title="Cancel (Esc)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>Cancel</span>
            </button>
          </div>
        </div>

        <div class="sku-ids-group">
          <div class="sku-id-row">
            <div class="sku-id-left">
              <span class="sku-id-label label-product">PRODUCT ID</span>
              <span class="sku-id-code product-code" title="${escapeHTML(ids.productId)}">${escapeHTML(ids.productId)}</span>
            </div>
            <button class="btn-icon-copy" data-copy-val="${escapeHTML(ids.productId)}" data-type="Product ID" title="Copy Product ID to clipboard">
              ${COPY_ICON_SVG}
            </button>
          </div>
          <div class="sku-id-row">
            <div class="sku-id-left">
              <span class="sku-id-label label-offer">OFFER ID</span>
              <span class="sku-id-code offer-code" title="${escapeHTML(ids.offerId)}">${escapeHTML(ids.offerId)}</span>
            </div>
            <button class="btn-icon-copy" data-copy-val="${escapeHTML(ids.offerId)}" data-type="Offer ID" title="Copy Offer ID to clipboard">
              ${COPY_ICON_SVG}
            </button>
          </div>
          ${discountOfferRowHtml}
        </div>
      `;

      const viewMode = card.querySelector('.view-mode');
      const editMode = card.querySelector('.edit-mode');
      const editBtn = card.querySelector('.sku-edit-btn');
      const deleteBtn = card.querySelector('.sku-delete-btn');
      const saveBtn = card.querySelector('.sku-btn-save');
      const cancelBtn = card.querySelector('.sku-btn-cancel');
      const nameInput = card.querySelector('.sku-edit-name-input');
      const priceInput = card.querySelector('.sku-edit-price-input');
      const skuInfo = card.querySelector('.sku-info');

      // Click on sku-info selects this item as active preview
      skuInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        state.activeProductId = item.id;
        saveCatalogueItems();
        renderCatalogueItems();
        renderAllTables();
        showToast(`Selected "${item.name}" for global pricing preview`, 'info');
      });

      // Enter edit mode
      function startEditing() {
        card.classList.add('is-editing');
        viewMode.style.display = 'none';
        editMode.style.display = 'flex';
        nameInput.focus();
        nameInput.select();
      }

      // Exit edit mode
      function stopEditing() {
        card.classList.remove('is-editing');
        editMode.style.display = 'none';
        viewMode.style.display = 'flex';
        nameInput.value = item.name;
        priceInput.value = item.price.toFixed(2);
        updateCardIds(item.name);
      }

      // Real-time dynamic sync of IDs while typing
      function updateCardIds(liveName) {
        const liveIds = generateIapIds(state.appName, liveName, state.discountRate);
        const prodCodeEl = card.querySelector('.product-code');
        const offerCodeEl = card.querySelector('.offer-code');
        const discountOfferCodeEl = card.querySelector('.discount-offer-code');
        if (prodCodeEl) {
          prodCodeEl.textContent = liveIds.productId;
          prodCodeEl.title = liveIds.productId;
          const copyBtn = prodCodeEl.closest('.sku-id-row')?.querySelector('.btn-icon-copy');
          if (copyBtn) copyBtn.setAttribute('data-copy-val', liveIds.productId);
        }
        if (offerCodeEl) {
          offerCodeEl.textContent = liveIds.offerId;
          offerCodeEl.title = liveIds.offerId;
          const copyBtn = offerCodeEl.closest('.sku-id-row')?.querySelector('.btn-icon-copy');
          if (copyBtn) copyBtn.setAttribute('data-copy-val', liveIds.offerId);
        }
        if (discountOfferCodeEl) {
          discountOfferCodeEl.textContent = liveIds.discountOfferId;
          discountOfferCodeEl.title = liveIds.discountOfferId;
          const copyBtn = discountOfferCodeEl.closest('.sku-id-row')?.querySelector('.btn-icon-copy');
          if (copyBtn) copyBtn.setAttribute('data-copy-val', liveIds.discountOfferId);
        }
      }

      nameInput.addEventListener('input', () => {
        updateCardIds(nameInput.value);
      });

      // Save changes
      function commitEdit() {
        const newName = nameInput.value.trim();
        const newPrice = parseFloat(priceInput.value);
        if (!newName) {
          showToast('Product name cannot be empty', 'warning');
          nameInput.focus();
          return;
        }
        if (isNaN(newPrice) || newPrice <= 0) {
          showToast('Please enter a valid price greater than 0', 'warning');
          priceInput.focus();
          return;
        }

        item.name = newName;
        item.price = newPrice;
        saveCatalogueItems();

        renderCatalogueItems();
        renderAllTables();
        showToast(`Updated "${newName}" (${state.baseCurrency} ${newPrice.toFixed(2)})`, 'success');
      }

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditing();
      });

      // Double-click on info also opens edit mode
      skuInfo.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startEditing();
      });

      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        commitEdit();
      });

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopEditing();
      });

      [nameInput, priceInput].forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            stopEditing();
          }
        });
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCatalogueItem(item.id);
      });

      card.querySelectorAll('.btn-icon-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const copyVal = btn.getAttribute('data-copy-val');
          const type = btn.getAttribute('data-type');
          navigator.clipboard.writeText(copyVal).then(() => {
            btn.innerHTML = CHECK_ICON_SVG;
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = COPY_ICON_SVG;
              btn.classList.remove('copied');
            }, 1200);
            showToast(`Copied ${type}: ${copyVal}`, 'success');
          }).catch(err => {
            console.error(err);
            showToast('Could not copy to clipboard', 'warning');
          });
        });
      });

      elements.catalogueItemsList.appendChild(card);
    });

    updateActiveProductSelector();
  }

  function updateActiveProductSelector() {
    elements.activeProductSelector.innerHTML = '';

    // Option 1: App Price
    const optApp = document.createElement('option');
    optApp.value = 'app_price';
    optApp.textContent = `App Price (${state.baseCurrency} ${state.appPrice.toFixed(2)})`;
    elements.activeProductSelector.appendChild(optApp);

    // Options for each catalogue item
    state.catalogueItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${state.baseCurrency} ${item.price.toFixed(2)})`;
      elements.activeProductSelector.appendChild(opt);
    });

    elements.activeProductSelector.value = state.activeProductId;
  }

  function deleteCatalogueItem(id) {
    if (state.catalogueItems.length <= 1) {
      showToast('Catalogue must contain at least 1 item', 'warning');
      return;
    }
    state.catalogueItems = state.catalogueItems.filter(item => item.id !== id);
    if (state.activeProductId === id) {
      state.activeProductId = state.catalogueItems[0].id;
    }
    saveCatalogueItems();
    renderCatalogueItems();
    renderAllTables();
    showToast('Product removed', 'info');
  }

  // 5b. Table Column Visibility Management
  function loadColumnPreferences() {
    try {
      const saved = localStorage.getItem('playprice_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.assign(state.visibleColumns, parsed);
        }
      }
    } catch (e) {
      console.warn('Could not load column preferences', e);
    }
  }

  function saveColumnPreferences() {
    try {
      localStorage.setItem('playprice_columns', JSON.stringify(state.visibleColumns));
    } catch (e) {
      console.warn('Could not save column preferences', e);
    }
  }

  function applyColumnVisibility() {
    let visibleCount = 0;
    let totalCount = 0;

    COLUMN_DEFINITIONS.forEach(col => {
      // If promo-only and discount is disabled, skip from counting
      if (col.isPromo && !state.discountEnabled) {
        document.body.classList.remove('hide-col-' + col.id);
        return;
      }

      totalCount++;
      const isVisible = state.visibleColumns[col.id] !== false;
      if (isVisible) {
        visibleCount++;
        document.body.classList.remove('hide-col-' + col.id);
      } else {
        document.body.classList.add('hide-col-' + col.id);
      }

      // Sync checkbox state in dropdown menu
      const cb = document.getElementById(`col-cb-${col.id}`);
      if (cb) {
        cb.checked = isVisible;
        const parentLabel = cb.closest('.col-checkbox-label');
        if (parentLabel) parentLabel.classList.toggle('is-checked', isVisible);
      }
    });

    if (elements.visibleColumnsCount) {
      elements.visibleColumnsCount.textContent = `${visibleCount}/${totalCount}`;
    }

    saveColumnPreferences();
  }

  function renderColumnCheckboxes() {
    if (!elements.columnCheckboxGrid) return;
    elements.columnCheckboxGrid.innerHTML = '';

    COLUMN_DEFINITIONS.forEach(col => {
      // Don't show discount column checkbox if discount section is disabled
      if (col.isPromo && !state.discountEnabled) return;

      const isChecked = state.visibleColumns[col.id] !== false;
      const label = document.createElement('label');
      label.className = `col-checkbox-label ${isChecked ? 'is-checked' : ''}`;
      label.innerHTML = `
        <input type="checkbox" id="col-cb-${col.id}" data-col="${col.id}" ${isChecked ? 'checked' : ''}>
        <span class="col-indicator indicator-${col.category}"></span>
        <span>${escapeHTML(col.name)}</span>
      `;

      label.querySelector('input').addEventListener('change', (e) => {
        state.visibleColumns[col.id] = e.target.checked;
        applyColumnVisibility();
      });

      elements.columnCheckboxGrid.appendChild(label);
    });
  }

  function setupColumnPicker() {
    loadColumnPreferences();
    renderColumnCheckboxes();
    applyColumnVisibility();

    // Toggle dropdown menu
    if (elements.btnColumnToggle && elements.columnPickerMenu) {
      elements.btnColumnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = elements.columnPickerMenu.style.display !== 'none';
        elements.columnPickerMenu.style.display = isOpen ? 'none' : 'flex';
        elements.columnPickerContainer.classList.toggle('open', !isOpen);
        elements.btnColumnToggle.setAttribute('aria-expanded', !isOpen);
      });
    }

    // Close menu button
    if (elements.btnCloseColMenu && elements.columnPickerMenu) {
      elements.btnCloseColMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.columnPickerMenu.style.display = 'none';
        elements.columnPickerContainer.classList.remove('open');
        elements.btnColumnToggle.setAttribute('aria-expanded', 'false');
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (elements.columnPickerContainer && !elements.columnPickerContainer.contains(e.target)) {
        if (elements.columnPickerMenu && elements.columnPickerMenu.style.display !== 'none') {
          elements.columnPickerMenu.style.display = 'none';
          elements.columnPickerContainer.classList.remove('open');
          elements.btnColumnToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Preset buttons
    if (elements.presetBtns) {
      elements.presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const presetKey = btn.getAttribute('data-preset');
          const preset = COLUMN_PRESETS[presetKey];
          if (preset) {
            elements.presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            Object.keys(preset).forEach(colId => {
              state.visibleColumns[colId] = preset[colId];
            });

            applyColumnVisibility();
            showToast(`Applied "${btn.textContent.trim()}" columns preset`, 'info');
          }
        });
      });
    }
  }

  // 6. Table Rendering Engine
  function renderAllTables() {
    const activeProd = getActiveProduct();
    const query = state.searchQuery.toLowerCase().trim();
    const baseCode = state.baseCurrency;

    // Toggle visibility of the discount header in all tables
    document.querySelectorAll('.col-discount-header').forEach(th => {
      th.style.display = state.discountEnabled ? 'table-cell' : 'none';
    });

    // Update KPI Header
    elements.kpiActiveItemName.textContent = activeProd.name;
    elements.kpiActiveItemPrice.textContent = `${baseCode} ${activeProd.price.toFixed(2)} Base`;

    // Filter countries based on search query
    const filteredCountries = state.countries.filter(c => {
      if (!query) return true;
      return (
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query) ||
        c.currency.toLowerCase().includes(query)
      );
    });

    const masterRows = [];
    const tier1Rows = [];
    const tier2Rows = [];
    const tier3Rows = [];

    let t1NetSum = 0, t1Count = 0;
    let t2NetSum = 0, t2Count = 0;
    let t3NetSum = 0, t3Count = 0;

    filteredCountries.forEach(country => {
      const calc = calculateCountryPricing(country, activeProd.price, state.baseCurrency);
      const rowHtml = buildTableRow(calc);

      masterRows.push(rowHtml);
      if (country.tier === 1) {
        tier1Rows.push(rowHtml);
        t1NetSum += calc.developerNetInBase;
        t1Count++;
      } else if (country.tier === 2) {
        tier2Rows.push(rowHtml);
        t2NetSum += calc.developerNetInBase;
        t2Count++;
      } else {
        tier3Rows.push(rowHtml);
        t3NetSum += calc.developerNetInBase;
        t3Count++;
      }
    });

    elements.tbodyMaster.innerHTML = masterRows.join('') || getEmptyTableNotice();
    elements.tbodyTier1.innerHTML = tier1Rows.join('') || getEmptyTableNotice();
    elements.tbodyTier2.innerHTML = tier2Rows.join('') || getEmptyTableNotice();
    elements.tbodyTier3.innerHTML = tier3Rows.join('') || getEmptyTableNotice();

    // Trigger subtle flash animation on tables
    document.querySelectorAll('.pricing-table').forEach(tbl => {
      tbl.classList.remove('table-updated');
      void tbl.offsetWidth; // trigger reflow
      tbl.classList.add('table-updated');
    });

    // Update counts
    elements.masterCount.textContent = `${masterRows.length} Locations`;
    elements.tier1Count.textContent = `${tier1Rows.length} Locations`;
    elements.tier2Count.textContent = `${tier2Rows.length} Locations`;
    elements.tier3Count.textContent = `${tier3Rows.length} Locations`;

    // Update KPI Averages
    elements.kpiTier1Net.textContent = t1Count > 0 ? `${baseCode} ${(t1NetSum / t1Count).toFixed(2)}` : `${baseCode} 0.00`;
    elements.kpiTier2Net.textContent = t2Count > 0 ? `${baseCode} ${(t2NetSum / t2Count).toFixed(2)}` : `${baseCode} 0.00`;
    elements.kpiTier3Net.textContent = t3Count > 0 ? `${baseCode} ${(t3NetSum / t3Count).toFixed(2)}` : `${baseCode} 0.00`;

    // Reattach listeners
    attachTableRowListeners();
  }

  function getEmptyTableNotice() {
    const colSpan = state.discountEnabled ? 12 : 11;
    return `<tr><td colspan="${colSpan}" style="text-align: center; padding: 28px; color: var(--text-muted);">No matching countries found for query "${escapeHTML(state.searchQuery)}".</td></tr>`;
  }

  function buildTableRow(calc) {
    const c = calc.country;
    const baseCode = state.baseCurrency;

    let mindsetClass = 'mindset-volume';
    if (c.tier === 1) mindsetClass = 'mindset-high';
    else if (c.tier === 2) mindsetClass = 'mindset-medium';

    const cleanRetailNum = formatCleanNumber(calc.retailPrice, c.currency);
    const cleanDiscountNum = formatCleanNumber(calc.discountedPrice, c.currency);

    const discountCellHtml = state.discountEnabled ? `
      <td class="mono-cell col-discount-cell" data-col="discount">
        <div class="price-box">
          <span class="discount-price-val">${c.currency} ${cleanDiscountNum}</span>
          <button class="btn-copy" data-copy-val="${cleanDiscountNum}" data-country="${escapeHTML(c.name)}" data-currency="${c.currency}" title="Copy promo price to clipboard">
            ${COPY_ICON_SVG}
          </button>
        </div>
        <div>
          <span class="original-price-strike">${cleanRetailNum}</span>
          <span class="discount-badge">-${state.discountRate}%</span>
        </div>
      </td>
    ` : '';

    return `
      <tr data-country-name="${escapeHTML(c.name)}">
        <td data-col="country">
          <div class="col-country">
            <span class="table-flag">${c.flag}</span>
            <div class="country-meta">
              <span class="country-name">${escapeHTML(c.name)}</span>
              <span class="country-iso">${c.code} • Tier ${c.tier}</span>
            </div>
          </div>
        </td>
        <td class="mono-cell" data-col="currency">
          <strong>${c.currency}</strong>
        </td>
        <td class="mono-cell" data-col="retail">
          <div class="price-box">
            <span class="retail-price-val">${c.currency} ${cleanRetailNum}</span>
            <button class="btn-copy" data-copy-val="${cleanRetailNum}" data-country="${escapeHTML(c.name)}" data-currency="${c.currency}" title="Copy retail price to clipboard">
              ${COPY_ICON_SVG}
            </button>
          </div>
          <div class="base-price-val">≈ ${baseCode} ${calc.retailInBase.toFixed(2)}</div>
        </td>
        ${discountCellHtml}
        <td class="mono-cell" data-col="tax">
          <div class="cut-val">${formatPct(calc.taxPct)}</div>
          <div class="cut-sub">${formatMoney(calc.taxAmount, c.currency)}</div>
        </td>
        <td class="mono-cell" data-col="playcut">
          <div class="cut-val">${formatPct(calc.playCutPct)}</div>
          <div class="cut-sub">${formatMoney(calc.playStoreCut, c.currency)}</div>
        </td>
        <td class="mono-cell" data-col="buffercut">
          <div class="cut-val">${formatPct(calc.bufferPct)}</div>
          <div class="cut-sub">${formatMoney(calc.bufferCut, c.currency)}</div>
        </td>
        <td class="mono-cell" data-col="netlocal">
          <div class="net-highlight">${formatMoney(calc.developerNetLocal, c.currency)}</div>
          <span class="net-pct-badge">${formatPct(calc.developerNetPct)} margin</span>
        </td>
        <td class="mono-cell" data-col="netusd">
          <div class="net-highlight">USD ${calc.developerNetInUsd.toFixed(2)}</div>
          <div class="cut-sub">take-home</div>
        </td>
        <td class="mono-cell" data-col="netinr">
          <div class="net-highlight">INR ${calc.developerNetInInr.toFixed(2)}</div>
          <div class="cut-sub">take-home</div>
        </td>
        <td data-col="mindset">
          <span class="mindset-pill ${mindsetClass}">${c.behavior ? escapeHTML(c.behavior.willingness) : 'Normal'}</span>
        </td>
        <td data-col="action">
          <button class="btn-detail" data-country="${escapeHTML(c.name)}">
            Strategy
          </button>
        </td>
      </tr>
    `;
  }

  function attachTableRowListeners() {
    // Quick copy button (uses SVG icons)
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const valToCopy = btn.getAttribute('data-copy-val');
        const country = btn.getAttribute('data-country');
        const currency = btn.getAttribute('data-currency');

        navigator.clipboard.writeText(valToCopy).then(() => {
          btn.innerHTML = CHECK_ICON_SVG;
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = COPY_ICON_SVG;
            btn.classList.remove('copied');
          }, 1200);
          showToast(`Copied ${currency} ${valToCopy} (${country}) for Google Play!`, 'success');
        }).catch(err => {
          console.error(err);
          showToast('Could not copy to clipboard', 'warning');
        });
      });
    });

    // Strategy button
    document.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const countryName = btn.getAttribute('data-country');
        openCountryStrategyModal(countryName);
      });
    });

    // Row click
    document.querySelectorAll('.pricing-table tbody tr').forEach(row => {
      row.addEventListener('click', () => {
        const countryName = row.getAttribute('data-country-name');
        if (countryName) openCountryStrategyModal(countryName);
      });
    });
  }

  // 7. Country Detail & Strategy Modal
  function openCountryStrategyModal(countryName) {
    const country = state.countries.find(c => c.name === countryName);
    if (!country) return;

    const activeProd = getActiveProduct();
    const calc = calculateCountryPricing(country, activeProd.price, state.baseCurrency);
    const baseCode = state.baseCurrency;

    elements.modalFlag.textContent = country.flag;
    elements.modalCountryName.textContent = country.name;
    elements.modalTierBadge.textContent = `Tier ${country.tier}`;
    elements.modalTierBadge.className = `modal-tier-badge badge-t${country.tier}`;
    elements.modalIsoCode.textContent = country.code;
    elements.modalCurrencyInfo.textContent = `Currency: ${country.currency} • Tax: ${country.taxLabel}`;

    elements.modalItemName.textContent = `${activeProd.name} (${baseCode} ${activeProd.price.toFixed(2)})`;
    elements.modalRetailPrice.textContent = formatMoney(calc.retailPrice, country.currency);
    elements.modalBaseEquiv.textContent = `${baseCode} ${calc.retailInBase.toFixed(2)}`;

    const pppDiscountPct = Math.round((1 - country.pppRatio) * state.pppStrength * 100);
    elements.modalPppDiscount.textContent = pppDiscountPct > 0 ? `-${pppDiscountPct}% Regional Value Adjustment` : 'Standard Tier 1 Benchmark';

    // Waterfall Breakdown
    elements.modalWaterfallBars.innerHTML = `
      <div class="waterfall-row gross">
        <span>1. Customer Pays (Gross Retail)</span>
        <span>${formatMoney(calc.retailPrice, country.currency)} (100%)</span>
      </div>
      <div class="waterfall-row cut">
        <span>2. Minus Local VAT / Sales Tax (${formatPct(calc.taxPct)})</span>
        <span>-${formatMoney(calc.taxAmount, country.currency)}</span>
      </div>
      <div class="waterfall-row net-base">
        <span>3. Net Revenue Base</span>
        <span>${formatMoney(calc.netRevenueBase, country.currency)}</span>
      </div>
      <div class="waterfall-row cut">
        <span>4. Minus Google Play Fee (${(state.playFeeRate * 100).toFixed(0)}% of Net Base)</span>
        <span>-${formatMoney(calc.playStoreCut, country.currency)}</span>
      </div>
      <div class="waterfall-row cut">
        <span>5. Minus Buffer (Indian 0.1% TDS / FX spread / Fees: ${(state.bufferRate * 100).toFixed(1)}%)</span>
        <span>-${formatMoney(calc.bufferCut, country.currency)}</span>
      </div>
      <div class="waterfall-row final-net">
        <span>6. Developer Net Proceeds</span>
        <span>${formatMoney(calc.developerNetLocal, country.currency)} (${formatPct(calc.developerNetPct)}) ≈ USD ${calc.developerNetInUsd.toFixed(2)} | INR ${calc.developerNetInInr.toFixed(2)}</span>
      </div>
    `;

    // Strategy & Gamer Mindset
    if (country.behavior) {
      elements.modalWillingness.textContent = country.behavior.willingness;
      elements.modalPaymentMethods.textContent = country.behavior.popularPayment;
      elements.modalMindset.textContent = country.behavior.gamersMindset;
      elements.modalRecommendation.textContent = country.behavior.pricingStrategy;
    }

    elements.countryModalBackdrop.classList.add('active');
  }

  function closeCountryStrategyModal() {
    elements.countryModalBackdrop.classList.remove('active');
  }

  // 8. Logic Guide Modal
  function openLogicModal() {
    elements.logicModalBackdrop.classList.add('active');
  }

  function closeLogicModal() {
    elements.logicModalBackdrop.classList.remove('active');
  }

  // 9. Export to CSV Engine
  function exportFullMatrixCsv() {
    showToast('Compiling comprehensive pricing matrix...', 'info');

    const headers = [
      'Country Name',
      'Country Code (ISO)',
      'Country Tier',
      'Product Name',
      'Base Currency',
      'Base Input Price',
      'Local Currency Code',
      'Local Retail Price',
      'Retail Price In Base Currency',
      'Promotional Discount %',
      'Discounted Price (Local)',
      'VAT / Tax Rate %',
      'Tax Amount (Local)',
      'Net Revenue Base (Local)',
      'Google Play Fee %',
      'Google Play Cut (Local)',
      'Buffer %',
      'Buffer Cut (Local)',
      'Developer Net Take-Home (Local)',
      'Developer Net Take-Home (USD)',
      'Developer Net Take-Home (INR)',
      'Developer Net Margin %',
      'Willingness To Pay',
      'Popular Payment Methods',
      'Pricing Strategy'
    ];

    const rows = [headers];

    const productsToExport = [
      { id: 'app_price', name: 'App Price (Download)', price: state.appPrice },
      ...state.catalogueItems
    ];

    productsToExport.forEach(prod => {
      state.countries.forEach(country => {
        const calc = calculateCountryPricing(country, prod.price, state.baseCurrency);
        rows.push([
          `"${country.name}"`,
          `"${country.code}"`,
          `"Tier ${country.tier}"`,
          `"${prod.name}"`,
          `"${state.baseCurrency}"`,
          prod.price.toFixed(2),
          `"${country.currency}"`,
          calc.retailPrice.toFixed(2),
          calc.retailInBase.toFixed(2),
          state.discountEnabled ? `${state.discountRate}%` : 'None',
          state.discountEnabled ? calc.discountedPrice.toFixed(2) : calc.retailPrice.toFixed(2),
          calc.taxPct.toFixed(1),
          calc.taxAmount.toFixed(2),
          calc.netRevenueBase.toFixed(2),
          (state.playFeeRate * 100).toFixed(0),
          calc.playStoreCut.toFixed(2),
          (state.bufferRate * 100).toFixed(1),
          calc.bufferCut.toFixed(2),
          calc.developerNetLocal.toFixed(2),
          calc.developerNetInUsd.toFixed(2),
          calc.developerNetInInr.toFixed(2),
          calc.developerNetPct.toFixed(1),
          `"${country.behavior ? country.behavior.willingness : ''}"`,
          `"${country.behavior ? country.behavior.popularPayment : ''}"`,
          `"${country.behavior ? country.behavior.pricingStrategy : ''}"`
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PlayPrice_Global_Matrix_${state.baseCurrency}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Export complete! Download started.', 'success');
  }

  // Copy Google Play Console Pricing table
  function copyPlayConsoleFormat() {
    const activeProd = getActiveProduct();
    const lines = ['Country/Region,Currency,Default Price'];
    state.countries.forEach(country => {
      const calc = calculateCountryPricing(country, activeProd.price, state.baseCurrency);
      const priceVal = state.discountEnabled ? calc.discountedPrice : calc.retailPrice;
      lines.push(`${country.code},${country.currency},${priceVal.toFixed(2)}`);
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied Google Play Console format for ${activeProd.name}!`, 'success');
    }).catch(err => {
      console.error(err);
      showToast('Could not copy to clipboard', 'warning');
    });
  }

  // 10. Toast Notification System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHTML(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // 11. Event Listeners Setup
  function setupEventListeners() {
    // Base Currency selection
    elements.baseCurrencyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.baseCurrencyBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.baseCurrency = btn.getAttribute('data-currency');

        // Update adornment ISO codes
        elements.appPriceSymbol.textContent = state.baseCurrency;
        document.querySelectorAll('.baseCurrCode').forEach(el => el.textContent = state.baseCurrency);

        renderCatalogueItems();
        renderAllTables();
        showToast(`Base currency set to ${state.baseCurrency}`, 'info');
      });
    });

    // App Price input
    elements.appPriceInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.appPrice = isNaN(val) ? 0 : Math.max(0, val);
      updateActiveProductSelector();
      renderAllTables();
    });

    // Play fee toggle
    elements.googlePlayFeeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.googlePlayFeeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.playFeeRate = parseFloat(btn.getAttribute('data-fee'));
        renderAllTables();
        showToast(`Google Play fee set to ${(state.playFeeRate * 100).toFixed(0)}%`, 'info');
      });
    });

    // Buffer fee slider
    elements.bufferFeeRange.addEventListener('input', (e) => {
      state.bufferRate = parseFloat(e.target.value) / 100;
      elements.bufferFeeDisplay.textContent = `${e.target.value}%`;
      renderAllTables();
    });

    // PPP strength slider
    elements.pppStrengthRange.addEventListener('input', (e) => {
      state.pppStrength = parseFloat(e.target.value) / 100;
      elements.pppStrengthDisplay.textContent = `${e.target.value}%`;
      renderAllTables();
    });

    // Charm rounding toggle
    elements.charmRoundingToggle.addEventListener('change', (e) => {
      state.charmRounding = e.target.checked;
      renderAllTables();
      showToast(`Charm rounding ${state.charmRounding ? 'Enabled' : 'Disabled'}`, 'info');
    });

    // App Name / Package Identifier Input
    if (elements.appNameInput) {
      elements.appNameInput.addEventListener('input', (e) => {
        state.appName = e.target.value;
        renderCatalogueItems();
      });
    }

    // Discount Toggle
    elements.discountEnableToggle.addEventListener('change', (e) => {
      state.discountEnabled = e.target.checked;
      elements.discountControlsRow.style.opacity = state.discountEnabled ? '1' : '0.4';
      elements.discountControlsRow.style.pointerEvents = state.discountEnabled ? 'auto' : 'none';
      if (elements.discountOfferSyntaxBadge) {
        elements.discountOfferSyntaxBadge.style.display = state.discountEnabled ? 'inline-flex' : 'none';
      }
      renderColumnCheckboxes();
      applyColumnVisibility();
      renderCatalogueItems();
      renderAllTables();
      showToast(`Promotional discount ${state.discountEnabled ? 'Enabled (' + state.discountRate + '% OFF)' : 'Disabled'}`, 'info');
    });

    // Discount Rate Slider
    elements.discountRateRange.addEventListener('input', (e) => {
      state.discountRate = parseInt(e.target.value, 10);
      elements.discountRateDisplay.textContent = `${state.discountRate}% OFF`;
      if (elements.promoBadgeCode) {
        elements.promoBadgeCode.textContent = `...-${state.discountRate}-percent-discount`;
      }
      if (state.discountEnabled) {
        renderCatalogueItems();
        renderAllTables();
      }
    });

    // Discount Charm Toggle
    elements.discountCharmToggle.addEventListener('change', (e) => {
      state.discountCharm = e.target.checked;
      if (state.discountEnabled) {
        renderAllTables();
      }
    });

    // Add Item Form
    elements.addItemForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = elements.newItemName.value.trim();
      const price = parseFloat(elements.newItemPrice.value);
      if (!name || isNaN(price) || price <= 0) {
        showToast('Please provide valid product name and price', 'warning');
        return;
      }

      const newItem = {
        id: 'iap_' + Date.now(),
        name,
        price
      };

      state.catalogueItems.push(newItem);
      state.activeProductId = newItem.id;
      saveCatalogueItems();

      elements.newItemName.value = '';
      elements.newItemPrice.value = '';

      renderCatalogueItems();
      renderAllTables();
      showToast(`Added product "${name}" (${state.baseCurrency} ${price.toFixed(2)})`, 'success');
    });

    // Reset Catalogue to Default Template (with distinct prices)
    elements.btnResetCatalogue.addEventListener('click', () => {
      state.catalogueItems = [
        { id: 'iap_1', name: 'No Ads', price: 1.50 },
        { id: 'iap_2', name: 'Starter Pack', price: 1.99 },
        { id: 'iap_3', name: 'Gold 1', price: 0.99 },
        { id: 'iap_4', name: 'Gold 2', price: 2.99 },
        { id: 'iap_5', name: 'Gold 3', price: 4.99 },
        { id: 'iap_6', name: 'Gold 4', price: 9.99 },
        { id: 'iap_7', name: 'Gold 5', price: 19.99 },
        { id: 'iap_8', name: 'Gold 6', price: 49.99 }
      ];
      state.activeProductId = 'iap_1';
      saveCatalogueItems();
      renderCatalogueItems();
      renderAllTables();
      showToast('Reset catalogue to staggered game IAP tiers', 'info');
    });

    elements.btnQuickAdd.addEventListener('click', () => {
      elements.newItemName.focus();
    });

    elements.btnGenerate.addEventListener('click', () => {
      renderAllTables();
      showToast('Pricing Matrix recalculation complete across all 176 locations!', 'success');
      document.querySelector('.table-control-bar').scrollIntoView({ behavior: 'smooth' });
    });

    // Active product selector dropdown
    elements.activeProductSelector.addEventListener('change', (e) => {
      state.activeProductId = e.target.value;
      const active = getActiveProduct();
      renderAllTables();
      showToast(`Switched preview to "${active.name}" (${state.baseCurrency} ${active.price.toFixed(2)})`, 'info');
    });

    // Search bar
    elements.globalCountrySearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
      renderAllTables();
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.globalCountrySearch.value = '';
      state.searchQuery = '';
      elements.btnClearSearch.style.display = 'none';
      renderAllTables();
    });

    // 4 Accordion collapsible toggles
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.accordion-section');
        section.classList.toggle('active');
      });
    });

    // Export CSV
    elements.btnExportAllCsv.addEventListener('click', exportFullMatrixCsv);

    // Copy Play Console
    elements.btnCopyPlayConsole.addEventListener('click', copyPlayConsoleFormat);

    // Modals
    elements.btnCloseModal.addEventListener('click', closeCountryStrategyModal);
    elements.btnModalCloseAction.addEventListener('click', closeCountryStrategyModal);
    elements.countryModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.countryModalBackdrop) closeCountryStrategyModal();
    });

    elements.btnHelpModal.addEventListener('click', openLogicModal);
    elements.btnCloseLogicModal.addEventListener('click', closeLogicModal);
    elements.btnAcceptLogic.addEventListener('click', closeLogicModal);
    elements.logicModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.logicModalBackdrop) closeLogicModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCountryStrategyModal();
        closeLogicModal();
      }
    });
  }

  // 12. Application Initialization
  async function init() {
    initDOMElements();
    loadCatalogueItems();
    setupEventListeners();
    setupColumnPicker();
    renderCatalogueItems();
    renderAllTables();

    await fetchLiveExchangeRates();
    renderAllTables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

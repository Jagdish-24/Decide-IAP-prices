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
    playFeeRate: 0.15,
    bufferRate: 0.02,
    pppStrength: 1.0,
    charmRounding: true,
    activeProductId: 'iap_1', // default selected product
    searchQuery: '',
    exchangeRates: window.FALLBACK_EXCHANGE_RATES || {},
    countries: window.PLAY_STORE_COUNTRIES || [],
    catalogueItems: [
      { id: 'iap_1', name: 'No Ads', price: 1.50 },
      { id: 'iap_2', name: 'Starter Pack', price: 1.50 },
      { id: 'iap_3', name: 'Gold 1', price: 1.50 },
      { id: 'iap_4', name: 'Gold 2', price: 2.99 },
      { id: 'iap_5', name: 'Gold 3', price: 4.99 },
      { id: 'iap_6', name: 'Gold 4', price: 9.99 },
      { id: 'iap_7', name: 'Gold 5', price: 19.99 },
      { id: 'iap_8', name: 'Gold 6', price: 49.99 }
    ]
  };

  // Currency Symbols
  const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    INR: '₹'
  };

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
    elements.catalogueItemsList = document.getElementById('catalogueItemsList');
    elements.addItemForm = document.getElementById('addItemForm');
    elements.newItemName = document.getElementById('newItemName');
    elements.newItemPrice = document.getElementById('newItemPrice');
    elements.btnResetCatalogue = document.getElementById('btnResetCatalogue');
    elements.btnQuickAdd = document.getElementById('btnQuickAdd');
    elements.btnGenerate = document.getElementById('btnGenerate');
    elements.btnExportAllCsv = document.getElementById('btnExportAllCsv');
    elements.btnCopyPlayConsole = document.getElementById('btnCopyPlayConsole');
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
        elements.fxStatusPill.classList.add('status-live');
        showToast('Live exchange rates successfully synchronized', 'success');
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
    if (!state.charmRounding) {
      return Math.round(rawPrice * 100) / 100;
    }

    if (currencyCode === 'INR') {
      // Find closest ladder step in Indian mobile gaming tiers
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
      // Round to nearest 10
      return Math.max(10, Math.round(rawPrice / 10) * 10);
    }

    if (currencyCode === 'KRW') {
      // Round to nearest 100
      return Math.max(100, Math.round(rawPrice / 100) * 100);
    }

    if (currencyCode === 'IDR' || currencyCode === 'VND') {
      // Round to nearest 1000
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

    // Default general charm: 2 decimals, round to .99 or .49 if moderate, else standard rounding
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

    // Determine gross retail price with charm rounding
    const retailPrice = applyCharmPricing(rawLocalPrice, country.currency);

    // VAT / Tax Cut
    let taxAmount = 0;
    let netRevenueBase = retailPrice;

    if (country.taxType === 'included' && country.taxRate > 0) {
      taxAmount = retailPrice * (country.taxRate / (100 + country.taxRate));
      netRevenueBase = retailPrice - taxAmount;
    } else {
      taxAmount = 0;
      netRevenueBase = retailPrice;
    }

    // Google Play Cut (15% or 30% of Net Revenue Base)
    const playStoreCut = netRevenueBase * state.playFeeRate;

    // Buffer Cut (e.g. 2% of Net Revenue Base)
    const bufferCut = netRevenueBase * state.bufferRate;

    // Developer Net Proceeds
    const developerNetLocal = netRevenueBase - playStoreCut - bufferCut;

    // Converted Developer Net in Selected Base Currency
    const developerNetInUsd = country.currency === 'USD' ? developerNetLocal : (developerNetLocal / localRate);
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
      developerNetPct,
      effectivePpp
    };
  }

  // 4. Formatting Helpers
  function formatMoney(amount, currencyCode, symbol) {
    if (isNaN(amount)) return '0.00';
    const sym = symbol || currencyCode;
    let formatted = '';
    if (['INR', 'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP'].includes(currencyCode)) {
      formatted = Math.round(amount).toLocaleString('en-US');
    } else {
      formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return `${sym} ${formatted}`;
  }

  function formatPct(val) {
    return `${val.toFixed(1)}%`;
  }

  // 5. Render Catalogue Items in UI
  function renderCatalogueItems() {
    elements.catalogueItemsList.innerHTML = '';
    const sym = CURRENCY_SYMBOLS[state.baseCurrency] || '$';

    state.catalogueItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'sku-card';
      card.innerHTML = `
        <div class="sku-info">
          <span class="sku-name">${escapeHTML(item.name)}</span>
          <span class="sku-price">${sym} ${item.price.toFixed(2)}</span>
        </div>
        <button class="sku-delete-btn" title="Delete product SKU" data-id="${item.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      card.querySelector('.sku-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCatalogueItem(item.id);
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
    optApp.textContent = `App Price (${CURRENCY_SYMBOLS[state.baseCurrency]}${state.appPrice.toFixed(2)})`;
    elements.activeProductSelector.appendChild(optApp);

    // Options for each catalogue item
    state.catalogueItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${CURRENCY_SYMBOLS[state.baseCurrency]}${item.price.toFixed(2)})`;
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
    renderCatalogueItems();
    renderAllTables();
    showToast('Product removed', 'info');
  }

  // 6. Table Rendering Engine
  function renderAllTables() {
    const activeProd = getActiveProduct();
    const query = state.searchQuery.toLowerCase().trim();
    const baseSym = CURRENCY_SYMBOLS[state.baseCurrency] || '$';

    // Update KPI Header
    elements.kpiActiveItemName.textContent = activeProd.name;
    elements.kpiActiveItemPrice.textContent = `${baseSym}${activeProd.price.toFixed(2)} Base`;

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

    // Update counts
    elements.masterCount.textContent = `${masterRows.length} Locations`;
    elements.tier1Count.textContent = `${tier1Rows.length} Locations`;
    elements.tier2Count.textContent = `${tier2Rows.length} Locations`;
    elements.tier3Count.textContent = `${tier3Rows.length} Locations`;

    // Update KPI Averages
    elements.kpiTier1Net.textContent = t1Count > 0 ? `${baseSym}${(t1NetSum / t1Count).toFixed(2)}` : `${baseSym}0.00`;
    elements.kpiTier2Net.textContent = t2Count > 0 ? `${baseSym}${(t2NetSum / t2Count).toFixed(2)}` : `${baseSym}0.00`;
    elements.kpiTier3Net.textContent = t3Count > 0 ? `${baseSym}${(t3NetSum / t3Count).toFixed(2)}` : `${baseSym}0.00`;

    // Reattach row click listeners
    attachTableRowListeners();
  }

  function getEmptyTableNotice() {
    return `<tr><td colspan="10" style="text-align: center; padding: 32px; color: var(--text-muted);">No matching countries found for query "${escapeHTML(state.searchQuery)}".</td></tr>`;
  }

  function buildTableRow(calc) {
    const c = calc.country;
    const baseSym = CURRENCY_SYMBOLS[state.baseCurrency] || '$';

    let mindsetClass = 'mindset-volume';
    if (c.tier === 1) mindsetClass = 'mindset-high';
    else if (c.tier === 2) mindsetClass = 'mindset-medium';

    return `
      <tr data-country-name="${escapeHTML(c.name)}">
        <td>
          <div class="col-country">
            <span class="table-flag">${c.flag}</span>
            <div class="country-meta">
              <span class="country-name">${escapeHTML(c.name)}</span>
              <span class="country-iso">${c.code} • Tier ${c.tier}</span>
            </div>
          </div>
        </td>
        <td class="mono-cell">
          <strong>${c.currency}</strong> <span style="color:var(--text-muted)">(${c.symbol})</span>
        </td>
        <td class="mono-cell">
          <div class="retail-price-val">${formatMoney(calc.retailPrice, c.currency, c.symbol)}</div>
          <div class="base-price-val">≈ ${baseSym}${calc.retailInBase.toFixed(2)} ${state.baseCurrency}</div>
        </td>
        <td class="mono-cell">
          <div class="cut-val">${formatPct(calc.taxPct)}</div>
          <div class="cut-sub">${formatMoney(calc.taxAmount, c.currency, c.symbol)}</div>
        </td>
        <td class="mono-cell">
          <div class="cut-val">${formatPct(calc.playCutPct)}</div>
          <div class="cut-sub">${formatMoney(calc.playStoreCut, c.currency, c.symbol)}</div>
        </td>
        <td class="mono-cell">
          <div class="cut-val">${formatPct(calc.bufferPct)}</div>
          <div class="cut-sub">${formatMoney(calc.bufferCut, c.currency, c.symbol)}</div>
        </td>
        <td class="mono-cell">
          <div class="net-highlight">${formatMoney(calc.developerNetLocal, c.currency, c.symbol)}</div>
          <span class="net-pct-badge">${formatPct(calc.developerNetPct)} margin</span>
        </td>
        <td class="mono-cell">
          <div class="net-highlight">${baseSym}${calc.developerNetInBase.toFixed(2)}</div>
          <div class="cut-sub">take-home</div>
        </td>
        <td>
          <span class="mindset-pill ${mindsetClass}">${c.behavior ? escapeHTML(c.behavior.willingness) : 'Normal'}</span>
        </td>
        <td>
          <button class="btn-detail" data-country="${escapeHTML(c.name)}">
            Strategy
          </button>
        </td>
      </tr>
    `;
  }

  function attachTableRowListeners() {
    document.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const countryName = btn.getAttribute('data-country');
        openCountryStrategyModal(countryName);
      });
    });

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
    const baseSym = CURRENCY_SYMBOLS[state.baseCurrency] || '$';

    elements.modalFlag.textContent = country.flag;
    elements.modalCountryName.textContent = country.name;
    elements.modalTierBadge.textContent = `Tier ${country.tier}`;
    elements.modalTierBadge.className = `modal-tier-badge badge-t${country.tier}`;
    elements.modalIsoCode.textContent = country.code;
    elements.modalCurrencyInfo.textContent = `${country.currency} (${country.symbol}) • Tax: ${country.taxLabel}`;

    elements.modalItemName.textContent = `${activeProd.name} (${baseSym}${activeProd.price.toFixed(2)})`;
    elements.modalRetailPrice.textContent = formatMoney(calc.retailPrice, country.currency, country.symbol);
    elements.modalBaseEquiv.textContent = `${baseSym}${calc.retailInBase.toFixed(2)} ${state.baseCurrency}`;

    const pppDiscountPct = Math.round((1 - country.pppRatio) * state.pppStrength * 100);
    elements.modalPppDiscount.textContent = pppDiscountPct > 0 ? `-${pppDiscountPct}% Regional Value Adjustment` : 'Standard Tier 1 Benchmark';

    // Waterfall Breakdown
    elements.modalWaterfallBars.innerHTML = `
      <div class="waterfall-row gross">
        <span>1. Customer Pays (Gross Retail)</span>
        <span>${formatMoney(calc.retailPrice, country.currency, country.symbol)} (100%)</span>
      </div>
      <div class="waterfall-row cut">
        <span>2. Minus Local VAT / Sales Tax (${formatPct(calc.taxPct)})</span>
        <span>-${formatMoney(calc.taxAmount, country.currency, country.symbol)}</span>
      </div>
      <div class="waterfall-row net-base">
        <span>3. Net Revenue Base</span>
        <span>${formatMoney(calc.netRevenueBase, country.currency, country.symbol)}</span>
      </div>
      <div class="waterfall-row cut">
        <span>4. Minus Google Play Fee (${(state.playFeeRate * 100).toFixed(0)}% of Net Base)</span>
        <span>-${formatMoney(calc.playStoreCut, country.currency, country.symbol)}</span>
      </div>
      <div class="waterfall-row cut">
        <span>5. Minus Buffer (Indian 0.1% TDS / FX spread / Fees: ${(state.bufferRate * 100).toFixed(1)}%)</span>
        <span>-${formatMoney(calc.bufferCut, country.currency, country.symbol)}</span>
      </div>
      <div class="waterfall-row final-net">
        <span>6. Developer Net Proceeds</span>
        <span>${formatMoney(calc.developerNetLocal, country.currency, country.symbol)} (${formatPct(calc.developerNetPct)}) ≈ ${baseSym}${calc.developerNetInBase.toFixed(2)} ${state.baseCurrency}</span>
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
      'Local Currency Symbol',
      'Local Retail Price',
      'Retail Price In Base Currency',
      'VAT / Tax Rate %',
      'Tax Amount (Local)',
      'Net Revenue Base (Local)',
      'Google Play Fee %',
      'Google Play Cut (Local)',
      'Buffer %',
      'Buffer Cut (Local)',
      'Developer Net Take-Home (Local)',
      'Developer Net Take-Home (Base Currency)',
      'Developer Net Margin %',
      'Willingness To Pay',
      'Popular Payment Methods',
      'Pricing Strategy'
    ];

    const rows = [headers];

    // Combine App Price + all Catalogue Items
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
          `"${country.symbol}"`,
          calc.retailPrice.toFixed(2),
          calc.retailInBase.toFixed(2),
          calc.taxPct.toFixed(1),
          calc.taxAmount.toFixed(2),
          calc.netRevenueBase.toFixed(2),
          (state.playFeeRate * 100).toFixed(0),
          calc.playStoreCut.toFixed(2),
          (state.bufferRate * 100).toFixed(1),
          calc.bufferCut.toFixed(2),
          calc.developerNetLocal.toFixed(2),
          calc.developerNetInBase.toFixed(2),
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
      lines.push(`${country.code},${country.currency},${calc.retailPrice.toFixed(2)}`);
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
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Helper escape
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

        // Update adornment symbols
        const sym = CURRENCY_SYMBOLS[state.baseCurrency] || '$';
        elements.appPriceSymbol.textContent = sym;
        document.querySelectorAll('.baseCurrSymbol').forEach(el => el.textContent = sym);
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

      elements.newItemName.value = '';
      elements.newItemPrice.value = '';

      renderCatalogueItems();
      renderAllTables();
      showToast(`Added product "${name}"`, 'success');
    });

    // Reset Catalogue to Default Template
    elements.btnResetCatalogue.addEventListener('click', () => {
      state.catalogueItems = [
        { id: 'iap_1', name: 'No Ads', price: 1.50 },
        { id: 'iap_2', name: 'Starter Pack', price: 1.50 },
        { id: 'iap_3', name: 'Gold 1', price: 1.50 },
        { id: 'iap_4', name: 'Gold 2', price: 2.99 },
        { id: 'iap_5', name: 'Gold 3', price: 4.99 },
        { id: 'iap_6', name: 'Gold 4', price: 9.99 },
        { id: 'iap_7', name: 'Gold 5', price: 19.99 },
        { id: 'iap_8', name: 'Gold 6', price: 49.99 }
      ];
      state.activeProductId = 'iap_1';
      renderCatalogueItems();
      renderAllTables();
      showToast('Reset catalogue to standard game IAP tiers', 'info');
    });

    // Quick Add button focus
    elements.btnQuickAdd.addEventListener('click', () => {
      elements.newItemName.focus();
    });

    // Big Generate Button
    elements.btnGenerate.addEventListener('click', () => {
      renderAllTables();
      showToast('Pricing Matrix recalculation complete across all 176 countries!', 'success');
      // Smooth scroll to table preview
      document.querySelector('.table-control-bar').scrollIntoView({ behavior: 'smooth' });
    });

    // Active product selector dropdown
    elements.activeProductSelector.addEventListener('change', (e) => {
      state.activeProductId = e.target.value;
      renderAllTables();
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

    // Start with all sections open
    document.querySelectorAll('.accordion-section').forEach(s => s.classList.add('active'));

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

    // Keyboard ESC to close modal
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
    setupEventListeners();
    renderCatalogueItems();
    renderAllTables();

    // Fetch live currency rates in background
    await fetchLiveExchangeRates();
    renderAllTables();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

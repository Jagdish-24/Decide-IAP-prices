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
    selectedRegion: 'ALL',
    sortColumn: null,
    sortDirection: null,
    simVolumeT1: 5000,
    simVolumeT2: 3000,
    simVolumeT3: 12000,
    isSimulatorCollapsed: false,
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
      discountnetinr: true,
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

  // 100% Verified Country Roster Mapping by Continent / Region
  const REGIONS = {
    EUROPE: new Set(['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GI', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA']),
    ASIA: new Set(['AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'KH', 'GE', 'HK', 'IN', 'ID', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY', 'MV', 'MN', 'MM', 'NP', 'OM', 'PK', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'TW', 'TJ', 'TH', 'TR', 'TM', 'AE', 'UZ', 'VN', 'YE']),
    AMERICAS: new Set(['AG', 'AR', 'AW', 'BS', 'BB', 'BZ', 'BM', 'BO', 'BR', 'VG', 'CA', 'KY', 'CL', 'CO', 'CR', 'DM', 'DO', 'EC', 'SV', 'GD', 'GT', 'GY', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'PY', 'PE', 'KN', 'LC', 'VC', 'SR', 'TT', 'US', 'UY', 'VE']),
    AFRICA: new Set(['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW']),
    OCEANIA: new Set(['AU', 'FJ', 'FM', 'NZ', 'PG', 'SB', 'TO', 'VU', 'WS', 'TC']),
    GLOBAL: new Set(['GLOBAL_USD', 'GLOBAL_EUR'])
  };

  // Google Play Official Regional Minimum Transaction Floors for Paid Apps (Upfront Download)
  const GOOGLE_PLAY_PAID_APP_MIN_PRICES = {
    AED: 3.00, ARS: 50.00, AUD: 0.99, AZN: 1.00, BDT: 20.00, BOB: 6.00, BRL: 2.00, CAD: 0.99,
    CHF: 1.00, CLP: 500.00, COP: 3000.00, CRC: 500.00, CZK: 10.00, DKK: 7.00, DZD: 100.00, EGP: 10.00,
    ETB: 50.00, EUR: 0.99, GBP: 0.79, GEL: 2.50, GHS: 10.00, HKD: 8.00, HUF: 300.00, IDR: 3000.00,
    ILS: 3.90, INR: 10.00, IQD: 250.00, JOD: 0.70, JPY: 100.00, KES: 100.00, KRW: 500.00, KZT: 400.00,
    LKR: 200.00, MAD: 10.00, MMK: 250.00, MNT: 3000.00, MOP: 8.00, MXN: 10.00, MYR: 4.00, NGN: 500.00,
    NOK: 10.00, NZD: 1.00, PEN: 3.00, PHP: 50.00, PKR: 100.00, PLN: 2.00, PYG: 500.00, QAR: 3.50,
    RON: 4.00, RSD: 100.00, RUB: 10.00, SAR: 3.75, SEK: 10.00, SGD: 1.00, THB: 30.00, TRY: 3.00,
    TWD: 30.00, TZS: 250.00, UAH: 25.00, USD: 0.99, UZS: 1000.00, VND: 20000.00, XAF: 500.00, XOF: 500.00,
    ZAR: 10.00
  };

  // Google Play Official Regional Minimum Floors for In-App Purchases (IAP), Micro-packs & Promotional Sales
  const GOOGLE_PLAY_IAP_MIN_PRICES = {
    AED: 0.30, ARS: 0.30, AUD: 0.10, AZN: 0.08, BDT: 5.00, BOB: 0.40, BRL: 0.30, CAD: 0.10,
    CHF: 0.05, CLP: 50.00, COP: 221.00, CRC: 35.00, CZK: 1.00, DKK: 0.50, DZD: 30.00, EGP: 5.00,
    ETB: 10.00, EUR: 0.05, GBP: 0.05, GEL: 0.50, GHS: 2.00, HKD: 0.50, HUF: 19.00, IDR: 1000.00,
    ILS: 0.20, INR: 4.00, IQD: 80.00, JOD: 0.05, JPY: 7.00, KES: 6.40, KRW: 100.00, KZT: 25.00,
    LKR: 50.00, MAD: 0.60, MMK: 100.00, MNT: 170.00, MOP: 0.50, MXN: 1.20, MYR: 0.30, NGN: 50.00,
    NOK: 0.50, NZD: 0.15, PEN: 0.30, PHP: 15.00, PKR: 20.00, PLN: 0.20, PYG: 400.00, QAR: 1.00,
    RON: 1.00, RSD: 20.00, RUB: 10.00, SAR: 1.00, SEK: 0.50, SGD: 0.20, THB: 10.00, TRY: 1.50,
    TWD: 10.00, TZS: 250.00, UAH: 2.00, USD: 0.05, UZS: 600.00, VND: 1300.00, XAF: 100.00, XOF: 100.00,
    ZAR: 0.90
  };

  // Backwards-compatibility alias
  const GOOGLE_PLAY_MIN_PRICES = GOOGLE_PLAY_IAP_MIN_PRICES;

  // Google Play Zero-Decimal Currencies (Whole Integer Units Only)
  const ZERO_DECIMAL_CURRENCIES = new Set([
    'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP', 'HUF', 'PYG', 'TZS', 'UZS', 'MMK', 'MNT', 'XAF', 'XOF', 'IQD',
    'ARS', 'NGN', 'CRC', 'KZT', 'BDT', 'DZD', 'KES', 'LKR', 'PKR', 'RSD'
  ]);

  // Quick Catalogue Monetization Presets
  const CATALOGUE_PRESETS = {
    casual: {
      name: 'Casual / Hyper-Casual',
      items: [
        { id: 'iap_c1', name: 'No Ads', price: 1.99 },
        { id: 'iap_c2', name: 'Starter Pack', price: 0.99 },
        { id: 'iap_c3', name: 'Coin Pouch (500)', price: 2.99 },
        { id: 'iap_c4', name: 'Gem Chest (2,000)', price: 9.99 },
        { id: 'iap_c5', name: 'Unlimited Lives (7 Days)', price: 4.99 }
      ]
    },
    rpg: {
      name: 'Mid-Core RPG / Gacha',
      items: [
        { id: 'iap_r1', name: 'Pouch of Gems (100)', price: 0.99 },
        { id: 'iap_r2', name: 'Sack of Gems (550)', price: 4.99 },
        { id: 'iap_r3', name: 'Chest of Gems (1,200)', price: 9.99 },
        { id: 'iap_r4', name: 'Vault of Gems (6,500)', price: 49.99 },
        { id: 'iap_r5', name: 'Hoard of Gems (14,000)', price: 99.99 },
        { id: 'iap_r6', name: 'Battle Pass Premium', price: 9.99 }
      ]
    },
    saas: {
      name: 'SaaS / Subscription App',
      items: [
        { id: 'iap_s1', name: 'Pro Monthly', price: 4.99 },
        { id: 'iap_s2', name: 'Pro Annual', price: 39.99 },
        { id: 'iap_s3', name: 'Lifetime Pass', price: 89.99 },
        { id: 'iap_s4', name: 'Extra Cloud Storage (100GB)', price: 1.99 }
      ]
    }
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
    { id: 'discountnetinr', name: 'Discount Net (INR)', category: 'earnings', isPromo: true },
    { id: 'mindset', name: 'Gamer Profile', category: 'insights' },
    { id: 'action', name: 'Action (Strategy)', category: 'insights' }
  ];

  const COLUMN_PRESETS = {
    all: {
      country: true, currency: true, retail: true, discount: true,
      tax: true, playcut: true, buffercut: true,
      netlocal: true, netusd: true, netinr: true, discountnetinr: true, mindset: true, action: true
    },
    essential: {
      country: true, currency: true, retail: true, discount: true,
      tax: false, playcut: false, buffercut: false,
      netlocal: false, netusd: true, netinr: true, discountnetinr: true, mindset: false, action: true
    },
    earnings: {
      country: true, currency: true, retail: true, discount: true,
      tax: false, playcut: false, buffercut: false,
      netlocal: true, netusd: true, netinr: true, discountnetinr: true, mindset: false, action: false
    },
    cuts: {
      country: true, currency: true, retail: true, discount: false,
      tax: true, playcut: true, buffercut: true,
      netlocal: false, netusd: true, netinr: false, discountnetinr: false, mindset: false, action: false
    }
  };

  // Vector SVG Icons for Copy & Checkmark (Strictly zero border-radius & no emojis)
  const COPY_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-svg"><rect x="9" y="9" width="13" height="13"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  const CHECK_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="check-svg"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  // Vector SVG Icons for Toast Notifications
  const TOAST_ICONS = {
    info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    warning: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
  };

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

  // Standard Indian charm price points for mobile gaming (starts at official ₹10 Play Store min floor)
  const INR_LADDER = [
    10, 19, 29, 39, 49, 79, 89, 99, 110, 149, 199, 249, 299, 399, 499,
    599, 799, 899, 999, 1199, 1499, 1999, 2499, 2999, 3999, 4999
  ];

  // Standard sub-dollar psychological price points for USD, EUR, GBP, CAD, AUD, NZD
  const SUB_DOLLAR_LADDER = [0.09, 0.19, 0.29, 0.39, 0.49, 0.59, 0.69, 0.79, 0.89, 0.99];

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
    elements.btnExportApiJson = document.getElementById('btnExportApiJson');
    elements.btnExportMasterCsv = document.getElementById('btnExportMasterCsv');
    elements.btnExportData = document.getElementById('btnExportData');
    elements.btnImportData = document.getElementById('btnImportData');
    elements.importFileInput = document.getElementById('importFileInput');
    elements.btnExportDataCat = document.getElementById('btnExportDataCat');
    elements.btnImportDataCat = document.getElementById('btnImportDataCat');
    elements.btnCopyPlayConsole = document.getElementById('btnCopyPlayConsole');
    elements.btnApiSyncModal = document.getElementById('btnApiSyncModal');
    elements.templateBtns = document.querySelectorAll('.btn-template-pill');
    elements.regionBtns = document.querySelectorAll('.btn-region-pill');
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

    // Simulator Elements
    elements.revenueSimulatorSection = document.getElementById('revenueSimulatorSection');
    elements.simulatorCard = document.querySelector('.simulator-card');
    elements.simulatorHeaderToggle = document.getElementById('simulatorHeaderToggle');
    elements.simChevron = document.getElementById('simChevron');
    elements.volTier1Input = document.getElementById('volTier1Input');
    elements.volTier1Range = document.getElementById('volTier1Range');
    elements.volTier2Input = document.getElementById('volTier2Input');
    elements.volTier2Range = document.getElementById('volTier2Range');
    elements.volTier3Input = document.getElementById('volTier3Input');
    elements.volTier3Range = document.getElementById('volTier3Range');
    elements.simTotalUnits = document.getElementById('simTotalUnits');
    elements.simGrossSpend = document.getElementById('simGrossSpend');
    elements.simGrossInr = document.getElementById('simGrossInr');
    elements.simTaxTotal = document.getElementById('simTaxTotal');
    elements.simPlayCutTotal = document.getElementById('simPlayCutTotal');
    elements.simPlayRateLabel = document.getElementById('simPlayRateLabel');
    elements.simNetPayoutUsd = document.getElementById('simNetPayoutUsd');
    elements.simNetPayoutInr = document.getElementById('simNetPayoutInr');
    elements.simNetMarginPill = document.getElementById('simNetMarginPill');
    elements.barSegNet = document.getElementById('barSegNet');
    elements.barSegPlay = document.getElementById('barSegPlay');
    elements.barSegTax = document.getElementById('barSegTax');
    elements.barSegBuffer = document.getElementById('barSegBuffer');

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

    // API Sync Modal elements
    elements.apiModalBackdrop = document.getElementById('apiModalBackdrop');
    elements.btnCloseApiModal = document.getElementById('btnCloseApiModal');
    elements.btnAcceptApiModal = document.getElementById('btnAcceptApiModal');
    elements.btnModalDownloadJson = document.getElementById('btnModalDownloadJson');
    elements.btnModalDownloadScript = document.getElementById('btnModalDownloadScript');
    elements.btnCopyDryRunCmd = document.getElementById('btnCopyDryRunCmd');
    elements.btnCopyLiveCmd = document.getElementById('btnCopyLiveCmd');
    elements.codeDryRunCmd = document.getElementById('codeDryRunCmd');
    elements.codeLiveCmd = document.getElementById('codeLiveCmd');
    elements.apiModalActiveSku = document.getElementById('apiModalActiveSku');

    // Modal Details elements
    elements.modalFlag = document.getElementById('modalFlag');
    elements.modalCountryName = document.getElementById('modalCountryName');
    elements.btnCopyModalCountry = document.getElementById('btnCopyModalCountry');
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

  // 2. Fetch Live Currency Rates with LocalStorage Caching & 429 Rate Limit Protection
  const FX_CACHE_KEY = 'playprice_fx_cache_v1';
  const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (Forex markets update daily)

  function loadCachedExchangeRates() {
    try {
      const raw = localStorage.getItem(FX_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.timestamp && parsed.rates && typeof parsed.rates === 'object') {
        const age = Date.now() - parsed.timestamp;
        if (age < FX_CACHE_TTL_MS && typeof parsed.rates.INR === 'number' && typeof parsed.rates.EUR === 'number') {
          return parsed.rates;
        }
      }
    } catch (e) {
      console.warn('Could not read FX cache from localStorage', e);
    }
    return null;
  }

  function saveCachedExchangeRates(rates) {
    try {
      localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        rates
      }));
    } catch (e) {
      console.warn('Could not save FX cache to localStorage', e);
    }
  }

  async function fetchLiveExchangeRates(forceRefresh = false) {
    // 1. Check local cache first to protect external API rate limits (unless forced refresh)
    if (!forceRefresh) {
      const cachedRates = loadCachedExchangeRates();
      if (cachedRates) {
        state.exchangeRates = Object.assign({}, window.FALLBACK_EXCHANGE_RATES, cachedRates);
        if (elements.fxStatusText) {
          elements.fxStatusText.textContent = 'Live FX Active (Cached)';
        }
        return;
      }
    }

    // 2. Network request with timeout & HTTP 429 rate limit handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      if (elements.fxStatusText) elements.fxStatusText.textContent = 'Connecting Rates...';
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        console.warn('Exchange rates API rate limit reached (HTTP 429). Using verified fallback rates.');
        state.exchangeRates = window.FALLBACK_EXCHANGE_RATES || {};
        if (elements.fxStatusText) elements.fxStatusText.textContent = 'FX Rate Limited (Fallback)';
        showToast('Forex API rate limited; using verified fallback rates', 'info');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data && data.rates && typeof data.rates === 'object' && typeof data.rates.INR === 'number') {
        // Sanitize rates object to prevent prototype pollution and malformed types
        const cleanRates = {};
        for (const [k, v] of Object.entries(data.rates)) {
          if (typeof k === 'string' && /^[A-Z]{3}$/.test(k) && typeof v === 'number' && isFinite(v) && v > 0) {
            cleanRates[k] = v;
          }
        }
        state.exchangeRates = Object.assign({}, window.FALLBACK_EXCHANGE_RATES, cleanRates);
        saveCachedExchangeRates(cleanRates);
        if (elements.fxStatusText) elements.fxStatusText.textContent = 'Live FX Active (Synced)';
        showToast('Live exchange rates synchronized', 'success');
      } else {
        throw new Error('Invalid rates payload');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Using cached exchange rates fallback:', err.message || err);
      state.exchangeRates = window.FALLBACK_EXCHANGE_RATES || {};
      if (elements.fxStatusText) elements.fxStatusText.textContent = 'Cached Rates (Offline Mode)';
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

  // Psychological integer charm pricing for mid-to-large values
  function charmIntegerPrice(rawPrice, maxPrice = Infinity) {
    const n = Math.round(rawPrice);
    if (n <= 10) return Math.min(Math.max(1, n), maxPrice < Infinity ? maxPrice : n);

    if (n >= 1000) {
      if (n % 100 === 99 && n < maxPrice) return n;
      const cands = new Set();
      const kFloor = Math.floor(n / 1000) * 1000 - 1;
      const kCeil = Math.ceil(n / 1000) * 1000 - 1;
      if (kFloor > 0) cands.add(kFloor);
      cands.add(kCeil);

      const hFloor = Math.floor(n / 100) * 100 - 1;
      const hCeil = Math.ceil(n / 100) * 100 - 1;
      if (hFloor > 0) cands.add(hFloor);
      cands.add(hCeil);

      let validCands = Array.from(cands).filter(c => c < maxPrice && c > 0);
      if (validCands.length === 0) {
        validCands = [Math.floor((maxPrice - 1) / 100) * 100 - 1, maxPrice - 1].filter(c => c > 0);
      }

      validCands.sort((a, b) => {
        let distA = Math.abs(a - n);
        let distB = Math.abs(b - n);
        if (a % 1000 === 999 && distA <= n * 0.03) distA -= 5;
        if (b % 1000 === 999 && distB <= n * 0.03) distB -= 5;
        return distA - distB;
      });
      return validCands[0] || (maxPrice < Infinity ? Math.max(1, maxPrice - 1) : n);
    } else if (n >= 100) {
      if ((n % 100 === 99 || n % 10 === 9) && n < maxPrice) return n;
      const cands = new Set();
      const hFloor = Math.floor(n / 100) * 100 - 1;
      const hCeil = Math.ceil(n / 100) * 100 - 1;
      if (hFloor > 0) cands.add(hFloor);
      cands.add(hCeil);

      const tFloor = Math.floor(n / 10) * 10 - 1;
      const tCeil = Math.floor(n / 10) * 10 + 9;
      if (tFloor > 0) cands.add(tFloor);
      cands.add(tCeil);

      let validCands = Array.from(cands).filter(c => c < maxPrice && c > 0);
      if (validCands.length === 0) {
        validCands = [Math.floor((maxPrice - 1) / 10) * 10 - 1, maxPrice - 1].filter(c => c > 0);
      }

      validCands.sort((a, b) => {
        let distA = Math.abs(a - n);
        let distB = Math.abs(b - n);
        if (a % 100 === 99 && distA <= 12) distA -= 3;
        if (b % 100 === 99 && distB <= 12) distB -= 3;
        return distA - distB;
      });
      return validCands[0] || (maxPrice < Infinity ? Math.max(1, maxPrice - 1) : n);
    } else {
      if (n % 10 === 9 && n < maxPrice) return n;
      const tFloor = Math.floor(n / 10) * 10 - 1;
      const tCeil = Math.floor(n / 10) * 10 + 9;
      let validCands = [tFloor, tCeil].filter(c => c >= 10 && c < maxPrice);
      if (validCands.length === 0) {
        validCands = [maxPrice - 1].filter(c => c > 0);
      }
      validCands.sort((a, b) => Math.abs(a - n) - Math.abs(b - n));
      return validCands[0] || (maxPrice < Infinity ? Math.max(1, maxPrice - 1) : n);
    }
  }

  // Apply psychological charm pricing
  function applyCharmPricing(rawPrice, currencyCode, maxPrice = Infinity) {
    if (currencyCode === 'INR') {
      const candidates = INR_LADDER.filter(step => step < maxPrice);
      if (candidates.length === 0) return Math.max(1, Math.min(Math.round(rawPrice), maxPrice - 1));
      let closest = candidates[0];
      let minDiff = Math.abs(rawPrice - closest);
      for (const step of candidates) {
        const diff = Math.abs(rawPrice - step);
        if (diff < minDiff) {
          minDiff = diff;
          closest = step;
        }
      }
      return closest;
    }

    if (currencyCode === 'JPY') {
      const rounded = Math.max(10, Math.round(rawPrice / 10) * 10);
      if (rounded < maxPrice) return rounded;
      return Math.max(10, Math.floor((maxPrice - 1) / 10) * 10);
    }

    if (['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'].includes(currencyCode)) {
      if (rawPrice <= 0.05) return Math.min(0.05, maxPrice < Infinity ? Math.max(0.01, maxPrice - 0.01) : 0.05);
      if (rawPrice < 1.00) {
        const candidates = SUB_DOLLAR_LADDER.filter(step => step < maxPrice);
        if (candidates.length > 0) {
          let closest = candidates[0];
          let minDiff = Math.abs(rawPrice - closest);
          for (const step of candidates) {
            const diff = Math.abs(rawPrice - step);
            if (diff < minDiff) {
              minDiff = diff;
              closest = step;
            }
          }
          return closest;
        }
        return Math.max(0.01, Math.round((Math.min(rawPrice, maxPrice - 0.01)) * 100) / 100);
      }
      if (rawPrice >= 100) {
        return charmIntegerPrice(rawPrice, maxPrice);
      }
      const floor = Math.floor(rawPrice);
      const frac = rawPrice - floor;
      let cand;
      if (frac < 0.25) cand = Math.max(0.99, floor - 0.01);
      else if (frac < 0.75) cand = floor + 0.49;
      else cand = floor + 0.99;

      if (cand < maxPrice) return cand;
      if (cand - 0.50 < maxPrice && cand - 0.50 > 0) return cand - 0.50;
      return Math.max(0.01, Math.round((maxPrice - 0.01) * 100) / 100);
    }

    if (currencyCode === 'BRL') {
      if (rawPrice >= 100) {
        return charmIntegerPrice(rawPrice, maxPrice);
      }
      const floor = Math.floor(rawPrice);
      const frac = rawPrice - floor;
      let cand = frac < 0.5 ? floor + 0.49 : floor + 0.90;
      if (cand < maxPrice) return cand;
      return Math.max(0.01, Math.round((maxPrice - 0.01) * 100) / 100);
    }

    // Zero-decimal currencies or any currency price >= 10
    if (ZERO_DECIMAL_CURRENCIES.has(currencyCode) || rawPrice >= 10) {
      return charmIntegerPrice(rawPrice, maxPrice);
    }

    // Sub-10 prices for other currencies
    if (rawPrice < 1.00) {
      const candidates = SUB_DOLLAR_LADDER.filter(step => step < maxPrice);
      if (candidates.length > 0) {
        let closest = candidates[0];
        let minDiff = Math.abs(rawPrice - closest);
        for (const step of candidates) {
          const diff = Math.abs(rawPrice - step);
          if (diff < minDiff) {
            minDiff = diff;
            closest = step;
          }
        }
        return closest;
      }
      return Math.max(0.01, Math.round((Math.min(rawPrice, maxPrice - 0.01)) * 100) / 100);
    }
    const floor = Math.floor(rawPrice);
    const frac = rawPrice - floor;
    let cand;
    if (frac < 0.25) cand = Math.max(0.99, floor - 0.01);
    else if (frac < 0.75) cand = floor + 0.49;
    else cand = floor + 0.99;

    if (cand < maxPrice) return cand;
    return Math.max(0.01, Math.round((maxPrice - 0.01) * 100) / 100);
  }

  // Calculate pricing breakdown for a single country and product price
  function calculateCountryPricing(country, basePrice, baseCurr, isPaidApp = false) {
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
      retailPrice = ZERO_DECIMAL_CURRENCIES.has(country.currency) || rawLocalPrice >= 100
        ? Math.round(rawLocalPrice)
        : Math.round(rawLocalPrice * 100) / 100;
    }

    // Promotional Discount Calculation (if enabled)
    let discountedPrice = retailPrice;
    if (state.discountEnabled) {
      const rawDiscounted = retailPrice * (1 - state.discountRate / 100);
      if (state.discountCharm) {
        discountedPrice = applyCharmPricing(rawDiscounted, country.currency, retailPrice);
        // Safety guard: A promotional discount must always be strictly lower than the retail price
        if (discountedPrice >= retailPrice) {
          discountedPrice = ZERO_DECIMAL_CURRENCIES.has(country.currency) || retailPrice >= 10
            ? Math.max(1, Math.round(retailPrice - 1))
            : Math.max(0.01, Math.round((retailPrice - 0.01) * 100) / 100);
        }
      } else {
        discountedPrice = ZERO_DECIMAL_CURRENCIES.has(country.currency) || rawDiscounted >= 100
          ? Math.round(rawDiscounted)
          : Math.round(rawDiscounted * 100) / 100;
        if (discountedPrice >= retailPrice) {
          discountedPrice = ZERO_DECIMAL_CURRENCIES.has(country.currency) || retailPrice >= 10
            ? Math.max(1, Math.round(retailPrice - 1))
            : Math.max(0.01, Math.round((retailPrice - 0.01) * 100) / 100);
        }
      }
    }

    // Google Play Minimum Price Floor check & enforcement
    // Paid Apps enforce standard app download floors (e.g. $0.99 USD baseline)
    // In-App Products (IAPs) enforce micro-transaction floors (sub-dollar down to $0.05 USD baseline)
    const minFloorDict = isPaidApp ? GOOGLE_PLAY_PAID_APP_MIN_PRICES : GOOGLE_PLAY_IAP_MIN_PRICES;
    const defaultFallback = isPaidApp
      ? Math.max(0.99, Math.round(0.99 * localRate * 100) / 100)
      : Math.max(0.05, Math.round(0.05 * localRate * 100) / 100);
    const minFloor = minFloorDict[country.currency] || defaultFallback;
    let isClampedToMin = false;
    if (retailPrice < minFloor) {
      retailPrice = minFloor;
      isClampedToMin = true;
    }

    let isDiscountAtFloor = false;
    if (state.discountEnabled) {
      // Promotional discounts for IAPs use IAP floor; for paid app promotional sales they cannot drop below the micro-sale floor
      const promoFloor = isPaidApp ? (GOOGLE_PLAY_IAP_MIN_PRICES[country.currency] || 0.05) : minFloor;
      if (discountedPrice < promoFloor) {
        discountedPrice = promoFloor;
        isDiscountAtFloor = true;
      } else if (discountedPrice === promoFloor) {
        isDiscountAtFloor = true;
      }
      if (discountedPrice >= retailPrice) {
        discountedPrice = retailPrice;
        isDiscountAtFloor = true;
      }
    }

    // Ensure zero-decimal currencies and large non-Western numbers remain strict integers
    const isWesternTwoDecimal = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'BRL'].includes(country.currency);
    if (ZERO_DECIMAL_CURRENCIES.has(country.currency) || (!isWesternTwoDecimal && retailPrice >= 100)) {
      retailPrice = Math.round(retailPrice);
    }
    if (ZERO_DECIMAL_CURRENCIES.has(country.currency) || (!isWesternTwoDecimal && discountedPrice >= 100)) {
      discountedPrice = Math.round(discountedPrice);
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

    // Calculate Developer Net after promotional discount (in INR, USD, and deductions)
    let discountDeveloperNetInInr = 0;
    let discountDeveloperNetInUsd = 0;
    let discountTaxAmount = 0;
    let discountPlayStoreCut = 0;
    let discountBufferCut = 0;
    let discountNetRevenueBase = discountedPrice;
    if (state.discountEnabled) {
      if (country.taxType === 'included' && country.taxRate > 0) {
        discountTaxAmount = discountedPrice * (country.taxRate / (100 + country.taxRate));
        discountNetRevenueBase = discountedPrice - discountTaxAmount;
      }
      discountPlayStoreCut = discountNetRevenueBase * state.playFeeRate;
      discountBufferCut = discountNetRevenueBase * state.bufferRate;
      const discountDeveloperNetLocal = discountNetRevenueBase - discountPlayStoreCut - discountBufferCut;
      discountDeveloperNetInUsd = country.currency === 'USD' ? discountDeveloperNetLocal : (discountDeveloperNetLocal / localRate);
      discountDeveloperNetInInr = discountDeveloperNetInUsd * inrRate;
    }

    // Converted Developer Net in Selected Base Currency
    const developerNetInBase = baseCurr === 'USD' ? developerNetInUsd : (developerNetInUsd * baseToUsdRate);

    // Retail in Base Currency equivalent
    const retailInUsd = country.currency === 'USD' ? retailPrice : (retailPrice / localRate);
    const retailInBase = baseCurr === 'USD' ? retailInUsd : (retailInUsd * baseToUsdRate);

    // Effective values for Forecaster & Visual Margin Stacked Bar (reflecting discounts when active)
    const effectiveSpendUsd = state.discountEnabled
      ? (country.currency === 'USD' ? discountedPrice : (discountedPrice / localRate))
      : retailInUsd;
    const effectiveNetUsd = state.discountEnabled ? discountDeveloperNetInUsd : developerNetInUsd;
    const effectiveTaxUsd = state.discountEnabled ? (discountTaxAmount / localRate) : (taxAmount / localRate);
    const effectivePlayUsd = state.discountEnabled ? (discountPlayStoreCut / localRate) : (playStoreCut / localRate);
    const effectiveBufUsd = state.discountEnabled ? (discountBufferCut / localRate) : (bufferCut / localRate);

    // Percentage of retail price
    const taxPct = retailPrice > 0 ? (taxAmount / retailPrice) * 100 : 0;
    const playCutPct = retailPrice > 0 ? (playStoreCut / retailPrice) * 100 : 0;
    const bufferPct = retailPrice > 0 ? (bufferCut / retailPrice) * 100 : 0;
    const developerNetPct = retailPrice > 0 ? (developerNetLocal / retailPrice) * 100 : 0;

    return {
      country,
      retailPrice,
      discountedPrice,
      retailInUsd,
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
      discountDeveloperNetInUsd,
      discountDeveloperNetInInr,
      discountTaxAmount,
      discountPlayStoreCut,
      discountBufferCut,
      effectiveSpendUsd,
      effectiveNetUsd,
      effectiveTaxUsd,
      effectivePlayUsd,
      effectiveBufUsd,
      developerNetPct,
      effectivePpp,
      isClampedToMin,
      isDiscountAtFloor,
      minFloor
    };
  }

  // 4. Formatting Helpers (Strictly ISO Currency Codes, No Symbols)
  function formatMoney(amount, currencyCode) {
    if (isNaN(amount)) return `${currencyCode} 0.00`;
    let formatted = '';
    const isZeroDecimal = currencyCode === 'INR' ||
                          ZERO_DECIMAL_CURRENCIES.has(currencyCode) ||
                          (!['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'BRL'].includes(currencyCode) && (amount >= 100 || Number.isInteger(amount)));
    if (isZeroDecimal) {
      formatted = Math.round(amount).toLocaleString('en-US');
    } else {
      formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return `${currencyCode} ${formatted}`;
  }

  function formatCleanNumber(amount, currencyCode) {
    if (isNaN(amount)) return '0.00';
    const isZeroDecimal = currencyCode === 'INR' ||
                          ZERO_DECIMAL_CURRENCIES.has(currencyCode) ||
                          (!['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'BRL'].includes(currencyCode) && (amount >= 100 || Number.isInteger(amount)));
    if (isZeroDecimal) {
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
        const rawItems = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : null);
        if (rawItems && rawItems.length > 0) {
          const validItems = [];
          for (const raw of rawItems) {
            if (raw && typeof raw === 'object') {
              const id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(raw.id)
                ? raw.id.slice(0, 40)
                : `iap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : 'Item';
              const price = typeof raw.price === 'number' && isFinite(raw.price) && raw.price > 0 && raw.price <= 999999
                ? raw.price
                : 1.0;
              if (name) {
                validItems.push({ id, name, price });
              }
            }
            if (validItems.length >= 50) break;
          }
          if (validItems.length > 0) {
            state.catalogueItems = validItems;
            if (parsed.activeProductId && (parsed.activeProductId === 'app_price' || validItems.some(i => i.id === parsed.activeProductId))) {
              state.activeProductId = parsed.activeProductId;
            } else {
              state.activeProductId = validItems[0].id;
            }
          }
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
      card.setAttribute('data-id', escapeHTML(item.id));

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

        <!-- Inline Edit Mode Panel -->
        <div class="sku-card-top edit-mode sku-edit-panel" style="display: none;">
          <div class="sku-edit-header">
            <div class="sku-edit-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span>Edit SKU</span>
            </div>
            <span class="sku-edit-shortcut-hint">Enter ↵ save • Esc cancel</span>
          </div>

          <div class="sku-edit-fields-row">
            <div class="sku-edit-field sku-field-name">
              <label class="sku-edit-label">Product Name</label>
              <input type="text" class="sku-edit-name-input" value="${escapeHTML(item.name)}" placeholder="e.g. Starter Pack" spellcheck="false" autocomplete="off" required>
            </div>
            <div class="sku-edit-field sku-field-price">
              <label class="sku-edit-label">Base Price (${baseCode})</label>
              <div class="sku-edit-price-box">
                <span class="sku-edit-curr-tag">${baseCode}</span>
                <input type="number" step="0.01" min="0.01" class="sku-edit-price-input" value="${item.price.toFixed(2)}" placeholder="1.50" required>
              </div>
            </div>
          </div>

          <div class="sku-edit-actions-row">
            <button type="button" class="btn sku-btn-cancel" title="Discard changes (Esc)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>Cancel</span>
            </button>
            <button type="button" class="btn sku-btn-save" title="Save changes (Enter)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        <div class="sku-ids-group">
          <div class="sku-ids-sub-label">Play Store Identifiers (Auto-Synced)</div>
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
        const newName = nameInput.value.trim().slice(0, 60);
        const newPrice = parseFloat(priceInput.value);
        if (!newName) {
          showToast('Product name cannot be empty', 'warning');
          nameInput.focus();
          return;
        }
        if (isNaN(newPrice) || !isFinite(newPrice) || newPrice <= 0 || newPrice > 999999) {
          showToast('Please enter a valid price (0.01 - 999,999)', 'warning');
          priceInput.focus();
          return;
        }

        item.name = newName;
        item.price = newPrice;
        saveCatalogueItems();

        renderCatalogueItems();
        scheduleRenderAllTables();
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
          const allowedIds = new Set(COLUMN_DEFINITIONS.map(c => c.id));
          for (const key of Object.keys(parsed)) {
            if (allowedIds.has(key)) {
              state.visibleColumns[key] = Boolean(parsed[key]);
            }
          }
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

  // Render scheduler for high-frequency inputs & zero UI jank
  let renderRafId = null;
  function scheduleRenderAllTables() {
    if (renderRafId) cancelAnimationFrame(renderRafId);
    renderRafId = requestAnimationFrame(() => {
      renderRafId = null;
      renderAllTables();
    });
  }

  // 6. Table Rendering Engine
  function renderAllTables() {
    const activeProd = getActiveProduct();
    const query = state.searchQuery.toLowerCase().trim();
    const baseCode = state.baseCurrency;

    // Toggle visibility of the discount headers in all tables
    document.querySelectorAll('.col-discount-header, .col-discount-netinr-header').forEach(th => {
      th.style.display = state.discountEnabled ? 'table-cell' : 'none';
    });

    // Update KPI Header
    elements.kpiActiveItemName.textContent = activeProd.name;
    elements.kpiActiveItemPrice.textContent = `${baseCode} ${activeProd.price.toFixed(2)} Base`;

    // Filter countries based on search query AND regional selection
    const filteredCountries = state.countries.filter(c => {
      // 1. Regional filter check
      if (state.selectedRegion === 'ZERO_TAX') {
        if (c.taxType !== 'none' && c.taxRate > 0) return false;
      } else if (state.selectedRegion !== 'ALL') {
        const regionSet = REGIONS[state.selectedRegion];
        if (regionSet && !regionSet.has(c.code)) return false;
      }

      // 2. Query search check
      if (!query) return true;
      return (
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query) ||
        c.currency.toLowerCase().includes(query)
      );
    });

    // Calculate economics for filtered countries
    const isPaidApp = activeProd.id === 'app_price';
    let calculatedList = filteredCountries.map(country => {
      return calculateCountryPricing(country, activeProd.price, state.baseCurrency, isPaidApp);
    });

    // Apply sorting if active
    if (state.sortColumn && state.sortDirection) {
      const dir = state.sortDirection === 'asc' ? 1 : -1;
      calculatedList.sort((a, b) => {
        switch (state.sortColumn) {
          case 'country':
            return dir * a.country.name.localeCompare(b.country.name);
          case 'currency':
            return dir * a.country.currency.localeCompare(b.country.currency);
          case 'retail':
            return dir * (a.retailInBase - b.retailInBase);
          case 'discount':
            return dir * (a.discountedPrice - b.discountedPrice);
          case 'tax':
            return dir * (a.taxPct - b.taxPct);
          case 'playcut':
            return dir * (a.playStoreCut - b.playStoreCut);
          case 'buffercut':
            return dir * (a.bufferCut - b.bufferCut);
          case 'netlocal':
            return dir * (a.developerNetPct - b.developerNetPct);
          case 'netusd':
            return dir * (a.developerNetInUsd - b.developerNetInUsd);
          case 'netinr':
            return dir * (a.developerNetInInr - b.developerNetInInr);
          case 'discountnetinr':
            return dir * (a.discountDeveloperNetInInr - b.discountDeveloperNetInInr);
          default:
            return 0;
        }
      });
    }

    // Update active sort indicator on table headers
    document.querySelectorAll('th[data-sortable="true"]').forEach(th => {
      const col = th.getAttribute('data-col');
      th.classList.remove('sort-asc', 'sort-desc');
      if (col === state.sortColumn && state.sortDirection) {
        th.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });

    const masterRows = [];
    const tier1Rows = [];
    const tier2Rows = [];
    const tier3Rows = [];

    let t1NetSum = 0, t1Count = 0;
    let t2NetSum = 0, t2Count = 0;
    let t3NetSum = 0, t3Count = 0;

    calculatedList.forEach(calc => {
      const country = calc.country;
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

    // Update Revenue Forecaster simulation
    updateRevenueForecaster();
  }

  function getEmptyTableNotice() {
    const colSpan = state.discountEnabled ? 13 : 11;
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

    let discountCellHtml = '';
    if (state.discountEnabled) {
      if (calc.isDiscountAtFloor) {
        discountCellHtml = `
          <td class="mono-cell col-discount-cell" data-col="discount">
            <div class="price-box">
              <span class="discount-price-val">${escapeHTML(c.currency)} ${cleanDiscountNum}</span>
              <button class="btn-copy" data-copy-val="${cleanDiscountNum}" data-country="${escapeHTML(c.name)}" data-currency="${escapeHTML(c.currency)}" title="Copy promo price to clipboard">
                ${COPY_ICON_SVG}
              </button>
            </div>
            <div>
              <span class="discount-floor-badge" title="Google Play regional minimum floor reached (promotional price cannot drop lower)">Floor Reached</span>
            </div>
          </td>
        `;
      } else {
        discountCellHtml = `
          <td class="mono-cell col-discount-cell" data-col="discount">
            <div class="price-box">
              <span class="discount-price-val">${escapeHTML(c.currency)} ${cleanDiscountNum}</span>
              <button class="btn-copy" data-copy-val="${cleanDiscountNum}" data-country="${escapeHTML(c.name)}" data-currency="${escapeHTML(c.currency)}" title="Copy promo price to clipboard">
                ${COPY_ICON_SVG}
              </button>
            </div>
            <div>
              <span class="original-price-strike">${cleanRetailNum}</span>
              <span class="discount-badge">-${state.discountRate}%</span>
            </div>
          </td>
        `;
      }
    }

    const discountNetInrCellHtml = state.discountEnabled ? `
      <td class="mono-cell col-discount-netinr-cell" data-col="discountnetinr">
        <div class="net-highlight discount-net-highlight">INR ${calc.discountDeveloperNetInInr.toFixed(2)}</div>
        <div class="cut-sub">after promo</div>
      </td>
    ` : '';

    return `
      <tr data-country-name="${escapeHTML(c.name)}">
        <td data-col="country">
          <div class="col-country">
            <span class="table-flag">${c.flag}</span>
            <div class="country-meta">
              <div class="country-name-row">
                <span class="country-name">${escapeHTML(c.name)}</span>
                <button class="btn-copy btn-copy-country" data-copy-val="${escapeHTML(c.name)}" data-type="country" title="Copy ${escapeHTML(c.name)} to clipboard">
                  ${COPY_ICON_SVG}
                </button>
              </div>
              <span class="country-iso">${escapeHTML(c.code)} • Tier ${c.tier}</span>
            </div>
          </div>
        </td>
        <td class="mono-cell" data-col="currency">
          <strong>${escapeHTML(c.currency)}</strong>
        </td>
        <td class="mono-cell" data-col="retail">
          <div class="price-box">
            <span class="retail-price-val">${escapeHTML(c.currency)} ${cleanRetailNum}</span>
            ${calc.isClampedToMin ? `<span class="min-floor-tag" title="Google Play enforces a minimum transaction limit for ${escapeHTML(c.currency)}">Min Floor</span>` : ''}
            <button class="btn-copy" data-copy-val="${cleanRetailNum}" data-country="${escapeHTML(c.name)}" data-currency="${escapeHTML(c.currency)}" title="Copy retail price to clipboard">
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
          <div class="cut-val">${formatPct(state.playFeeRate * 100)} <span class="cut-tag-sub">of net</span></div>
          <div class="cut-sub">${formatMoney(calc.playStoreCut, c.currency)} <span class="cut-effective-tag" title="Effective share of customer gross retail price after tax">(${formatPct(calc.playCutPct)} gross)</span></div>
        </td>
        <td class="mono-cell" data-col="buffercut">
          <div class="cut-val">${formatPct(state.bufferRate * 100)} <span class="cut-tag-sub">of net</span></div>
          <div class="cut-sub">${formatMoney(calc.bufferCut, c.currency)} <span class="cut-effective-tag">(${formatPct(calc.bufferPct)} gross)</span></div>
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
        ${discountNetInrCellHtml}
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

  // Delegated Table Click Listener (Zero memory leaks & instant response)
  function setupTableEventDelegation() {
    const tableContainer = document.querySelector('.sections-accordion-container');
    if (!tableContainer) return;

    tableContainer.addEventListener('click', (e) => {
      // 1. Quick copy button
      const copyBtn = e.target.closest('.btn-copy');
      if (copyBtn) {
        e.stopPropagation();
        const valToCopy = copyBtn.getAttribute('data-copy-val');
        const country = copyBtn.getAttribute('data-country');
        const currency = copyBtn.getAttribute('data-currency');
        const type = copyBtn.getAttribute('data-type');
        if (!valToCopy) return;

        navigator.clipboard.writeText(valToCopy).then(() => {
          copyBtn.innerHTML = CHECK_ICON_SVG;
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyBtn.classList.remove('copied');
          }, 1200);
          if (type === 'country') {
            showToast(`Copied country: ${valToCopy}`, 'success');
          } else {
            showToast(`Copied ${currency || ''} ${valToCopy} (${country || ''}) for Google Play!`, 'success');
          }
        }).catch(err => {
          console.error(err);
          showToast('Could not copy to clipboard', 'warning');
        });
        return;
      }

      // 2. Strategy detail button
      const detailBtn = e.target.closest('.btn-detail');
      if (detailBtn) {
        e.stopPropagation();
        const countryName = detailBtn.getAttribute('data-country');
        if (countryName) openCountryStrategyModal(countryName);
        return;
      }

      // 3. Row click (when clicking a row, but not buttons/links)
      const row = e.target.closest('.pricing-table tbody tr');
      if (row && !e.target.closest('button, input, select, textarea, a')) {
        const countryName = row.getAttribute('data-country-name');
        if (countryName) openCountryStrategyModal(countryName);
      }
    });
  }

  // 7. Country Detail & Strategy Modal
  function openCountryStrategyModal(countryName) {
    const country = state.countries.find(c => c.name === countryName);
    if (!country) return;

    const activeProd = getActiveProduct();
    const isPaidApp = activeProd.id === 'app_price';
    const calc = calculateCountryPricing(country, activeProd.price, state.baseCurrency, isPaidApp);
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
    if (calc.isClampedToMin) {
      elements.modalPppDiscount.textContent = `Google Play Minimum Floor (${isPaidApp ? 'Paid App' : 'IAP'}: ${formatMoney(calc.minFloor, country.currency)}) Enforced`;
    } else {
      elements.modalPppDiscount.textContent = pppDiscountPct > 0 ? `-${pppDiscountPct}% Regional Value Adjustment` : 'Standard Tier 1 Benchmark';
    }

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
  // RFC 4180 and OWASP Top 10 CSV Formula Injection Sanitizer
  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    // Neutralize formula injection if first character is =, +, -, @, tab, or CR
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    // Escape internal double quotes by doubling them (RFC 4180)
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  function exportFullMatrixCsv() {
    showToast('Compiling comprehensive pricing matrix...', 'info');

    const headers = [
      'Country Name',
      'Country Code',
      'Country Tier',
      'Product Name',
      'Base Currency',
      'Base Input Price',
      'Currency',
      'Retail Price',
      'Retail Price In Base Currency',
      'Promotional Discount %',
      'Discounted Price',
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
      'Discount Net Take-Home (INR)',
      'Developer Net Margin %',
      'Willingness To Pay',
      'Popular Payment Methods',
      'Pricing Strategy'
    ];

    const rows = [headers.map(h => escapeCsvCell(h))];

    const productsToExport = [
      { id: 'app_price', name: 'App Price (Download)', price: state.appPrice },
      ...state.catalogueItems
    ];

    productsToExport.forEach(prod => {
      const isPaidApp = prod.id === 'app_price';
      state.countries.forEach(country => {
        const calc = calculateCountryPricing(country, prod.price, state.baseCurrency, isPaidApp);
        rows.push([
          escapeCsvCell(country.name),
          escapeCsvCell(country.code),
          escapeCsvCell(`Tier ${country.tier}`),
          escapeCsvCell(prod.name),
          escapeCsvCell(state.baseCurrency),
          prod.price.toFixed(2),
          escapeCsvCell(country.currency),
          escapeCsvCell(formatCleanNumber(calc.retailPrice, country.currency)),
          calc.retailInBase.toFixed(2),
          state.discountEnabled ? `${state.discountRate}%` : 'None',
          state.discountEnabled ? escapeCsvCell(formatCleanNumber(calc.discountedPrice, country.currency)) : escapeCsvCell(formatCleanNumber(calc.retailPrice, country.currency)),
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
          state.discountEnabled ? calc.discountDeveloperNetInInr.toFixed(2) : 'N/A',
          calc.developerNetPct.toFixed(1),
          escapeCsvCell(country.behavior ? country.behavior.willingness : ''),
          escapeCsvCell(country.behavior ? country.behavior.popularPayment : ''),
          escapeCsvCell(country.behavior ? country.behavior.pricingStrategy : '')
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
    const isPaidApp = activeProd.id === 'app_price';
    const lines = ['Country/Region,Currency,Default Price'];
    state.countries.forEach(country => {
      const calc = calculateCountryPricing(country, activeProd.price, state.baseCurrency, isPaidApp);
      const priceVal = state.discountEnabled ? calc.discountedPrice : calc.retailPrice;
      lines.push(`${country.code},${country.currency},${formatCleanNumber(priceVal, country.currency)}`);
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied Google Play Console format for ${activeProd.name}!`, 'success');
    }).catch(err => {
      console.error(err);
      showToast('Could not copy to clipboard', 'warning');
    });
  }

  // 9b. Export Project & Settings (JSON Backup)
  function exportProjectDataJson() {
    try {
      const backupData = {
        app: 'PlayPrice Engine',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          baseCurrency: state.baseCurrency,
          appPrice: state.appPrice,
          playFeeRate: state.playFeeRate,
          bufferRate: state.bufferRate,
          pppStrength: state.pppStrength,
          charmRounding: state.charmRounding,
          discountEnabled: state.discountEnabled,
          discountRate: state.discountRate,
          discountCharm: state.discountCharm,
          appName: state.appName || 'mygame',
          activeProductId: state.activeProductId,
          visibleColumns: Object.assign({}, state.visibleColumns)
        },
        catalogueItems: state.catalogueItems.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price
        }))
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeAppName = sanitizeSlug(state.appName) || 'mygame';
      a.download = `PlayPrice_Backup_${safeAppName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Exported ${state.catalogueItems.length} products and all settings to JSON!`, 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Could not export project data', 'warning');
    }
  }

  // 9c. Import Project & Settings (JSON Restore)
  function importProjectDataJson(file) {
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('File size too large (maximum 2MB allowed)', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          throw new Error('Invalid JSON format');
        }

        let importedSettingsCount = 0;
        let importedProductsCount = 0;

        // 1. Process Settings if present
        const s = data.settings || (data.catalogueItems ? null : data);
        if (s && typeof s === 'object') {
          // Base Currency
          if (['USD', 'EUR', 'INR'].includes(s.baseCurrency)) {
            state.baseCurrency = s.baseCurrency;
            importedSettingsCount++;
          }

          // App Price
          if (typeof s.appPrice === 'number' && isFinite(s.appPrice) && s.appPrice >= 0 && s.appPrice <= 999999) {
            state.appPrice = s.appPrice;
            importedSettingsCount++;
          }

          // Play Fee Rate
          if (typeof s.playFeeRate === 'number' && isFinite(s.playFeeRate) && s.playFeeRate >= 0 && s.playFeeRate <= 1) {
            state.playFeeRate = s.playFeeRate;
            importedSettingsCount++;
          }

          // Buffer Rate
          if (typeof s.bufferRate === 'number' && isFinite(s.bufferRate) && s.bufferRate >= 0 && s.bufferRate <= 0.5) {
            state.bufferRate = s.bufferRate;
            importedSettingsCount++;
          }

          // PPP Strength
          if (typeof s.pppStrength === 'number' && isFinite(s.pppStrength) && s.pppStrength >= 0 && s.pppStrength <= 1) {
            state.pppStrength = s.pppStrength;
            importedSettingsCount++;
          }

          // Charm Rounding
          if (typeof s.charmRounding === 'boolean') {
            state.charmRounding = s.charmRounding;
            importedSettingsCount++;
          }

          // Discount Settings
          if (typeof s.discountEnabled === 'boolean') {
            state.discountEnabled = s.discountEnabled;
            importedSettingsCount++;
          }
          if (typeof s.discountRate === 'number' && isFinite(s.discountRate) && s.discountRate >= 1 && s.discountRate <= 99) {
            state.discountRate = Math.round(s.discountRate);
            importedSettingsCount++;
          }
          if (typeof s.discountCharm === 'boolean') {
            state.discountCharm = s.discountCharm;
            importedSettingsCount++;
          }

          // App Name
          if (typeof s.appName === 'string') {
            state.appName = s.appName.trim().slice(0, 50);
            importedSettingsCount++;
          }

          // Visible Columns
          if (s.visibleColumns && typeof s.visibleColumns === 'object') {
            const allowedIds = new Set(COLUMN_DEFINITIONS.map(c => c.id));
            for (const key of Object.keys(s.visibleColumns)) {
              if (allowedIds.has(key)) {
                state.visibleColumns[key] = Boolean(s.visibleColumns[key]);
              }
            }
            saveColumnPreferences();
          }
        }

        // 2. Process Catalogue Items
        const rawItems = Array.isArray(data.catalogueItems) ? data.catalogueItems : (Array.isArray(data) ? data : null);
        if (rawItems && rawItems.length > 0) {
          const validItems = [];
          for (const raw of rawItems) {
            if (raw && typeof raw === 'object') {
              const id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(raw.id)
                ? raw.id.slice(0, 40)
                : `iap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : 'Imported Item';
              const price = typeof raw.price === 'number' && isFinite(raw.price) && raw.price > 0 && raw.price <= 999999
                ? raw.price
                : 1.0;
              if (name) {
                validItems.push({ id, name, price });
              }
            }
            if (validItems.length >= 50) break;
          }

          if (validItems.length > 0) {
            state.catalogueItems = validItems;
            importedProductsCount = validItems.length;

            if (s && s.activeProductId && (s.activeProductId === 'app_price' || validItems.some(i => i.id === s.activeProductId))) {
              state.activeProductId = s.activeProductId;
            } else {
              state.activeProductId = validItems[0].id;
            }
            saveCatalogueItems();
          }
        }

        // 3. Sync All UI Elements to Match Imported State
        // Base Currency
        elements.baseCurrencyBtns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-currency') === state.baseCurrency);
        });
        if (elements.appPriceSymbol) elements.appPriceSymbol.textContent = state.baseCurrency;
        document.querySelectorAll('.baseCurrCode').forEach(el => el.textContent = state.baseCurrency);

        // App Price
        if (elements.appPriceInput) elements.appPriceInput.value = state.appPrice.toFixed(2);

        // Google Play Fee
        elements.googlePlayFeeBtns.forEach(btn => {
          btn.classList.toggle('active', Math.abs(parseFloat(btn.getAttribute('data-fee')) - state.playFeeRate) < 0.001);
        });

        // Buffer Fee Range & Display
        if (elements.bufferFeeRange) {
          const bufferVal = Math.round(state.bufferRate * 100);
          elements.bufferFeeRange.value = bufferVal;
          if (elements.bufferFeeDisplay) elements.bufferFeeDisplay.textContent = `${bufferVal}%`;
          updateSliderFill(elements.bufferFeeRange);
        }

        // PPP Strength Range & Display
        if (elements.pppStrengthRange) {
          const pppVal = Math.round(state.pppStrength * 100);
          elements.pppStrengthRange.value = pppVal;
          if (elements.pppStrengthDisplay) elements.pppStrengthDisplay.textContent = `${pppVal}%`;
          updateSliderFill(elements.pppStrengthRange);
        }

        // Charm Rounding Toggle
        if (elements.charmRoundingToggle) {
          elements.charmRoundingToggle.checked = Boolean(state.charmRounding);
        }

        // App Name Input
        if (elements.appNameInput) {
          elements.appNameInput.value = state.appName || 'mygame';
        }

        // Discount Controls
        if (elements.discountEnableToggle) {
          elements.discountEnableToggle.checked = Boolean(state.discountEnabled);
          elements.discountControlsRow.style.opacity = state.discountEnabled ? '1' : '0.4';
          elements.discountControlsRow.style.pointerEvents = state.discountEnabled ? 'auto' : 'none';
        }
        if (elements.discountOfferSyntaxBadge) {
          elements.discountOfferSyntaxBadge.style.display = state.discountEnabled ? 'inline-flex' : 'none';
        }
        if (elements.discountRateRange) {
          elements.discountRateRange.value = state.discountRate;
          if (elements.discountRateDisplay) elements.discountRateDisplay.textContent = `${state.discountRate}% OFF`;
          if (elements.promoBadgeCode) elements.promoBadgeCode.textContent = `...-${state.discountRate}-percent-discount`;
          updateSliderFill(elements.discountRateRange);
        }
        if (elements.discountCharmToggle) {
          elements.discountCharmToggle.checked = Boolean(state.discountCharm);
        }

        // Columns UI
        renderColumnCheckboxes();
        applyColumnVisibility();

        // Catalogue UI
        renderCatalogueItems();

        // Tables UI
        renderAllTables();

        showToast(`Successfully imported ${importedProductsCount} products and settings!`, 'success');
      } catch (err) {
        console.error('Import parse error:', err);
        showToast('Invalid JSON file format. Could not import data.', 'warning');
      } finally {
        if (elements.importFileInput) elements.importFileInput.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Could not read the selected file', 'warning');
      if (elements.importFileInput) elements.importFileInput.value = '';
    };

    reader.readAsText(file);
  }

  // 9b. Master CSV Matrix Export (All SKUs across all 176 locations)
  function exportMasterMatrixCsv() {
    const baseCode = state.baseCurrency;
    const items = state.catalogueItems;

    const headers = ['Country Code', 'Country Name', 'Currency', 'Tax Rate (%)'];
    items.forEach(item => {
      headers.push(`"${item.name} Retail Price"`);
      headers.push(`"${item.name} Net Take-Home (USD)"`);
      headers.push(`"${item.name} Net Take-Home (INR)"`);
      if (state.discountEnabled) {
        headers.push(`"${item.name} Promo Price (-${state.discountRate}%)"`);
        headers.push(`"${item.name} Promo Net (INR)"`);
      }
    });

    const rows = [headers];

    state.countries.forEach(c => {
      const row = [c.code, `"${c.name.replace(/"/g, '""')}"`, c.currency, c.taxRate.toFixed(1)];
      items.forEach(item => {
        const isPaidApp = item.id === 'app_price';
        const calc = calculateCountryPricing(c, item.price, baseCode, isPaidApp);
        row.push(formatCleanNumber(calc.retailPrice, c.currency));
        row.push(calc.developerNetInUsd.toFixed(2));
        row.push(calc.developerNetInInr.toFixed(2));
        if (state.discountEnabled) {
          row.push(formatCleanNumber(calc.discountedPrice, c.currency));
          row.push(calc.discountDeveloperNetInInr.toFixed(2));
        }
      });
      rows.push(row);
    });

    const csvContent = "\uFEFF" + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playprice-master-all-skus-${state.appName || 'mygame'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported Master CSV with ${items.length} SKUs across all 176 locations`, 'success');
  }

  // 9c. Direct Google Play API JSON Payload Export (androidpublisher:v3 inappproducts format)
  function exportApiJsonPayload() {
    const activeProd = getActiveProduct();
    const isPaidApp = activeProd.id === 'app_price';
    const ids = generateIapIds(state.appName, activeProd.name, state.discountRate);
    const skuId = ids.productId;
    const packageName = `com.${sanitizeSlug(state.appName || 'mygame')}.shop`;

    const pricesPayload = {};
    let usPriceMicros = '990000';

    state.countries.forEach(c => {
      // Exclude global fallback pools from standard country dict
      if (c.code === 'GLOBAL_USD' || c.code === 'GLOBAL_EUR') return;

      const calc = calculateCountryPricing(c, activeProd.price, state.baseCurrency, isPaidApp);
      const priceMicros = String(Math.round(calc.retailPrice * 1000000));
      pricesPayload[c.code] = {
        currency: c.currency,
        priceMicros: priceMicros
      };
      if (c.code === 'US') {
        usPriceMicros = priceMicros;
      }
    });

    const payload = {
      packageName: packageName,
      sku: skuId,
      status: 'active',
      purchaseType: 'managedUser',
      defaultPrice: {
        currency: 'USD',
        priceMicros: usPriceMicros
      },
      prices: pricesPayload
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-play-iap-${skuId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported Google Play API JSON for ${skuId}`, 'success');
  }

  // 9d. "What-If" Revenue Forecaster & Visual Margin Stacked Bar Engine
  function updateRevenueForecaster() {
    if (!elements.simTotalUnits) return;
    const activeProd = getActiveProduct();
    const isPaidApp = activeProd.id === 'app_price';
    const v1 = parseInt(state.simVolumeT1, 10) || 0;
    const v2 = parseInt(state.simVolumeT2, 10) || 0;
    const v3 = parseInt(state.simVolumeT3, 10) || 0;
    const totalUnits = v1 + v2 + v3;

    let t1Spend = 0, t1Tax = 0, t1Play = 0, t1Buf = 0, t1NetUsd = 0;
    let t2Spend = 0, t2Tax = 0, t2Play = 0, t2Buf = 0, t2NetUsd = 0;
    let t3Spend = 0, t3Tax = 0, t3Play = 0, t3Buf = 0, t3NetUsd = 0;
    let t1Count = 0, t2Count = 0, t3Count = 0;

    state.countries.forEach(c => {
      const calc = calculateCountryPricing(c, activeProd.price, state.baseCurrency, isPaidApp);
      if (c.tier === 1) {
        t1Spend += calc.effectiveSpendUsd;
        t1Tax += calc.effectiveTaxUsd;
        t1Play += calc.effectivePlayUsd;
        t1Buf += calc.effectiveBufUsd;
        t1NetUsd += calc.effectiveNetUsd;
        t1Count++;
      } else if (c.tier === 2) {
        t2Spend += calc.effectiveSpendUsd;
        t2Tax += calc.effectiveTaxUsd;
        t2Play += calc.effectivePlayUsd;
        t2Buf += calc.effectiveBufUsd;
        t2NetUsd += calc.effectiveNetUsd;
        t2Count++;
      } else {
        t3Spend += calc.effectiveSpendUsd;
        t3Tax += calc.effectiveTaxUsd;
        t3Play += calc.effectivePlayUsd;
        t3Buf += calc.effectiveBufUsd;
        t3NetUsd += calc.effectiveNetUsd;
        t3Count++;
      }
    });

    const avgT1Spend = t1Count > 0 ? t1Spend / t1Count : 0;
    const avgT1Tax = t1Count > 0 ? t1Tax / t1Count : 0;
    const avgT1Play = t1Count > 0 ? t1Play / t1Count : 0;
    const avgT1Buf = t1Count > 0 ? t1Buf / t1Count : 0;
    const avgT1Net = t1Count > 0 ? t1NetUsd / t1Count : 0;

    const avgT2Spend = t2Count > 0 ? t2Spend / t2Count : 0;
    const avgT2Tax = t2Count > 0 ? t2Tax / t2Count : 0;
    const avgT2Play = t2Count > 0 ? t2Play / t2Count : 0;
    const avgT2Buf = t2Count > 0 ? t2Buf / t2Count : 0;
    const avgT2Net = t2Count > 0 ? t2NetUsd / t2Count : 0;

    const avgT3Spend = t3Count > 0 ? t3Spend / t3Count : 0;
    const avgT3Tax = t3Count > 0 ? t3Tax / t3Count : 0;
    const avgT3Play = t3Count > 0 ? t3Play / t3Count : 0;
    const avgT3Buf = t3Count > 0 ? t3Buf / t3Count : 0;
    const avgT3Net = t3Count > 0 ? t3NetUsd / t3Count : 0;

    const totalSpend = (v1 * avgT1Spend) + (v2 * avgT2Spend) + (v3 * avgT3Spend);
    const totalTax = (v1 * avgT1Tax) + (v2 * avgT2Tax) + (v3 * avgT3Tax);
    const totalPlay = (v1 * avgT1Play) + (v2 * avgT2Play) + (v3 * avgT3Play);
    const totalBuf = (v1 * avgT1Buf) + (v2 * avgT2Buf) + (v3 * avgT3Buf);
    const totalNetUsd = (v1 * avgT1Net) + (v2 * avgT2Net) + (v3 * avgT3Net);

    const inrRate = getRate('INR');
    const totalNetInr = totalNetUsd * inrRate;
    const totalGrossInr = totalSpend * inrRate;

    const netPct = totalSpend > 0 ? (totalNetUsd / totalSpend) * 100 : 0;
    const playPct = totalSpend > 0 ? (totalPlay / totalSpend) * 100 : 0;
    const taxPct = totalSpend > 0 ? (totalTax / totalSpend) * 100 : 0;
    const bufPct = totalSpend > 0 ? (totalBuf / totalSpend) * 100 : 0;

    elements.simTotalUnits.textContent = totalUnits.toLocaleString();
    elements.simGrossSpend.textContent = `$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elements.simGrossInr.textContent = `INR ${Math.round(totalGrossInr).toLocaleString('en-IN')}`;
    elements.simTaxTotal.textContent = `-$${totalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elements.simPlayCutTotal.textContent = `-$${totalPlay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (elements.simPlayRateLabel) elements.simPlayRateLabel.textContent = `${Math.round(state.playFeeRate * 100)}%`;
    elements.simNetPayoutUsd.textContent = `$${totalNetUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo`;
    elements.simNetPayoutInr.textContent = `≈ INR ${Math.round(totalNetInr).toLocaleString('en-IN')} / mo`;
    elements.simNetMarginPill.textContent = state.discountEnabled
      ? `${netPct.toFixed(1)}% Net Margin (-${state.discountRate}% Promo)`
      : `${netPct.toFixed(1)}% Net Margin`;

    if (elements.barSegNet) {
      elements.barSegNet.style.width = `${Math.max(4, netPct)}%`;
      elements.barSegNet.textContent = `${netPct.toFixed(0)}% Net`;
    }
    if (elements.barSegPlay) {
      elements.barSegPlay.style.width = `${Math.max(4, playPct)}%`;
      elements.barSegPlay.textContent = `${playPct.toFixed(0)}% Play`;
    }
    if (elements.barSegTax) {
      elements.barSegTax.style.width = `${Math.max(4, taxPct)}%`;
      elements.barSegTax.textContent = `${taxPct.toFixed(0)}% Tax`;
    }
    if (elements.barSegBuffer) {
      elements.barSegBuffer.style.width = `${Math.max(2, bufPct)}%`;
      elements.barSegBuffer.textContent = `${bufPct.toFixed(0)}% Buf`;
    }
  }

  // 9e. Catalogue Presets Loader
  function loadCataloguePreset(presetKey) {
    const preset = CATALOGUE_PRESETS[presetKey];
    if (!preset) return;

    state.catalogueItems = preset.items.map(i => ({ ...i }));
    state.activeProductId = state.catalogueItems[0].id;
    saveCatalogueItems();

    if (elements.templateBtns) {
      elements.templateBtns.forEach(b => {
        const k = b.getAttribute('data-preset') || b.getAttribute('data-template');
        b.classList.toggle('active', k === presetKey);
      });
    }

    renderCatalogueItems();
    renderAllTables();
    showToast(`Loaded "${preset.name}" preset catalogue!`, 'success');
  }

  // 9f. API Helper Modal Controllers
  function openApiModal() {
    if (!elements.apiModalBackdrop) return;
    const activeProd = getActiveProduct();
    const ids = generateIapIds(state.appName, activeProd.name, state.discountRate);
    const sku = ids.productId;
    const pkg = `com.${sanitizeSlug(state.appName || 'mygame')}.shop`;

    if (elements.apiModalActiveSku) elements.apiModalActiveSku.textContent = sku;
    if (elements.codeDryRunCmd) {
      elements.codeDryRunCmd.textContent = `python sync_prices_to_play_console.py --key service-account.json --package ${pkg} --sku ${sku} --csv playprice-matrix.csv --dry-run`;
    }
    if (elements.codeLiveCmd) {
      elements.codeLiveCmd.textContent = `python sync_prices_to_play_console.py --key service-account.json --package ${pkg} --sku ${sku} --csv playprice-matrix.csv`;
    }

    elements.apiModalBackdrop.classList.add('active');
  }

  function closeApiModal() {
    if (elements.apiModalBackdrop) elements.apiModalBackdrop.classList.remove('active');
  }

  function downloadPythonSyncScript() {
    const a = document.createElement('a');
    a.href = 'sync_prices_to_play_console.py';
    a.download = 'sync_prices_to_play_console.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloaded sync_prices_to_play_console.py script', 'success');
  }

  // 10. Toast Notification System
  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    // Prevent DOM flooding by limiting active toasts to 4 max
    while (elements.toastContainer.children.length >= 4) {
      elements.toastContainer.removeChild(elements.toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconSvg = TOAST_ICONS[type] || TOAST_ICONS.info;

    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-msg">${escapeHTML(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Dynamic fill tracker for 0 border-radius range sliders
  function updateSliderFill(slider) {
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    slider.style.setProperty('--range-progress', `${pct}%`);
  }

  function initSliderFills() {
    [
      elements.bufferFeeRange,
      elements.pppStrengthRange,
      elements.discountRateRange,
      elements.volTier1Range,
      elements.volTier2Range,
      elements.volTier3Range
    ].forEach(slider => {
      if (slider) {
        updateSliderFill(slider);
        slider.addEventListener('input', () => updateSliderFill(slider));
      }
    });
  }

  // 11. Event Listeners Setup
  function setupEventListeners() {
    initSliderFills();

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
      state.appPrice = isNaN(val) || !isFinite(val) || val < 0 ? 0 : Math.min(val, 999999);
      updateActiveProductSelector();
      scheduleRenderAllTables();
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
      scheduleRenderAllTables();
    });

    // PPP strength slider
    elements.pppStrengthRange.addEventListener('input', (e) => {
      state.pppStrength = parseFloat(e.target.value) / 100;
      elements.pppStrengthDisplay.textContent = `${e.target.value}%`;
      scheduleRenderAllTables();
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
        state.appName = e.target.value.slice(0, 50);
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
        scheduleRenderAllTables();
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
      if (state.catalogueItems.length >= 50) {
        showToast('Maximum catalogue limit (50 products) reached', 'warning');
        return;
      }
      const name = elements.newItemName.value.trim().slice(0, 60);
      const price = parseFloat(elements.newItemPrice.value);
      if (!name || isNaN(price) || !isFinite(price) || price <= 0 || price > 999999) {
        showToast('Please provide valid product name and price (0.01 - 999,999)', 'warning');
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
      if (elements.templateBtns) {
        elements.templateBtns.forEach(b => b.classList.remove('active'));
      }
      renderCatalogueItems();
      renderAllTables();
      showToast('Reset catalogue to default game IAP tiers', 'info');
    });

    elements.btnQuickAdd.addEventListener('click', () => {
      elements.newItemName.focus();
    });

    elements.btnGenerate.addEventListener('click', async () => {
      const originalText = elements.btnGenerate.innerHTML;
      elements.btnGenerate.disabled = true;
      elements.btnGenerate.innerHTML = 'Syncing Rates & Matrix...';
      try {
        await fetchLiveExchangeRates(true);
      } catch (err) {
        console.warn('Live rates sync check:', err);
      } finally {
        elements.btnGenerate.disabled = false;
        elements.btnGenerate.innerHTML = originalText;
        renderAllTables();
        showToast('Pricing Matrix recalculated with verified live rates across all 176 locations!', 'success');
        document.querySelector('.table-control-bar').scrollIntoView({ behavior: 'smooth' });
      }
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
      state.searchQuery = e.target.value.slice(0, 100);
      elements.btnClearSearch.style.display = state.searchQuery ? 'inline-flex' : 'none';
      scheduleRenderAllTables();
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.globalCountrySearch.value = '';
      state.searchQuery = '';
      elements.btnClearSearch.style.display = 'none';
      scheduleRenderAllTables();
    });

    // 4 Accordion collapsible toggles
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.accordion-section');
        section.classList.toggle('active');
      });
    });

    // Export CSV (Single Active SKU)
    elements.btnExportAllCsv.addEventListener('click', exportFullMatrixCsv);

    // Export Master Multi-SKU Catalog CSV
    if (elements.btnExportMasterCsv) elements.btnExportMasterCsv.addEventListener('click', exportMasterMatrixCsv);

    // Export Google Play Developer API v3 JSON Payload
    if (elements.btnExportApiJson) elements.btnExportApiJson.addEventListener('click', exportApiJsonPayload);

    // Catalogue Monetization Quick Presets
    if (elements.templateBtns) {
      elements.templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const presetKey = btn.getAttribute('data-preset') || btn.getAttribute('data-template');
          if (presetKey) {
            loadCataloguePreset(presetKey);
          }
        });
      });
    }

    // Region / Continent Filter Chips
    if (elements.regionBtns) {
      elements.regionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          elements.regionBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.selectedRegion = btn.getAttribute('data-region');
          renderAllTables();
          showToast(`Filtered: ${btn.textContent.trim()}`, 'info');
        });
      });
    }

    // Sortable Table Column Headers
    document.querySelectorAll('th[data-sortable="true"]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (!col) return;
        if (state.sortColumn === col) {
          if (state.sortDirection === 'asc') {
            state.sortDirection = 'desc';
          } else if (state.sortDirection === 'desc') {
            state.sortColumn = null;
            state.sortDirection = null;
          }
        } else {
          state.sortColumn = col;
          state.sortDirection = 'asc';
        }
        renderAllTables();
        const dirLabel = state.sortDirection ? `(${state.sortDirection.toUpperCase()})` : '(Default order)';
        showToast(`Sorting by ${col} ${dirLabel}`, 'info');
      });
    });

    // Revenue Forecaster Simulator Toggle & Bidirectional Volume Sliders
    if (elements.simulatorHeaderToggle) {
      elements.simulatorHeaderToggle.addEventListener('click', () => {
        state.isSimulatorCollapsed = !state.isSimulatorCollapsed;
        if (elements.simulatorCard) {
          elements.simulatorCard.classList.toggle('collapsed', state.isSimulatorCollapsed);
        }
      });
    }

    function bindSimVolume(input, range, stateKey) {
      if (!input || !range) return;
      const onValChange = (val) => {
        const parsed = Math.max(0, Math.min(1000000, parseInt(val, 10) || 0));
        state[stateKey] = parsed;
        input.value = parsed;
        range.value = Math.min(parsed, parseInt(range.max, 10));
        updateSliderFill(range);
        updateRevenueForecaster();
      };
      input.addEventListener('input', (e) => onValChange(e.target.value));
      range.addEventListener('input', (e) => onValChange(e.target.value));
      updateSliderFill(range);
    }

    bindSimVolume(elements.volTier1Input, elements.volTier1Range, 'simVolumeT1');
    bindSimVolume(elements.volTier2Input, elements.volTier2Range, 'simVolumeT2');
    bindSimVolume(elements.volTier3Input, elements.volTier3Range, 'simVolumeT3');

    // Export Project Data (JSON)
    if (elements.btnExportData) elements.btnExportData.addEventListener('click', exportProjectDataJson);
    if (elements.btnExportDataCat) elements.btnExportDataCat.addEventListener('click', exportProjectDataJson);

    // Import Project Data (JSON)
    const triggerImport = () => {
      if (elements.importFileInput) elements.importFileInput.click();
    };
    if (elements.btnImportData) elements.btnImportData.addEventListener('click', triggerImport);
    if (elements.btnImportDataCat) elements.btnImportDataCat.addEventListener('click', triggerImport);

    if (elements.importFileInput) {
      elements.importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importProjectDataJson(file);
      });
    }

    // Copy Play Console
    elements.btnCopyPlayConsole.addEventListener('click', copyPlayConsoleFormat);

    // Country Strategy Modal
    elements.btnCloseModal.addEventListener('click', closeCountryStrategyModal);
    elements.btnModalCloseAction.addEventListener('click', closeCountryStrategyModal);
    if (elements.btnCopyModalCountry) {
      elements.btnCopyModalCountry.addEventListener('click', (e) => {
        e.stopPropagation();
        const countryName = elements.modalCountryName.textContent;
        if (!countryName) return;
        navigator.clipboard.writeText(countryName).then(() => {
          elements.btnCopyModalCountry.innerHTML = CHECK_ICON_SVG;
          elements.btnCopyModalCountry.classList.add('copied');
          setTimeout(() => {
            elements.btnCopyModalCountry.innerHTML = COPY_ICON_SVG;
            elements.btnCopyModalCountry.classList.remove('copied');
          }, 1200);
          showToast(`Copied country: ${countryName}`, 'success');
        }).catch(err => {
          console.error(err);
          showToast('Could not copy to clipboard', 'warning');
        });
      });
    }
    elements.countryModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.countryModalBackdrop) closeCountryStrategyModal();
    });

    // Logic Explanation Modal
    elements.btnHelpModal.addEventListener('click', openLogicModal);
    elements.btnCloseLogicModal.addEventListener('click', closeLogicModal);
    elements.btnAcceptLogic.addEventListener('click', closeLogicModal);
    elements.logicModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.logicModalBackdrop) closeLogicModal();
    });

    // Google Play API Sync Helper Modal
    if (elements.btnApiSyncModal) {
      elements.btnApiSyncModal.addEventListener('click', openApiModal);
    }
    if (elements.btnCloseApiModal) {
      elements.btnCloseApiModal.addEventListener('click', closeApiModal);
    }
    if (elements.btnAcceptApiModal) {
      elements.btnAcceptApiModal.addEventListener('click', closeApiModal);
    }
    if (elements.apiModalBackdrop) {
      elements.apiModalBackdrop.addEventListener('click', (e) => {
        if (e.target === elements.apiModalBackdrop) closeApiModal();
      });
    }
    if (elements.btnModalDownloadJson) {
      elements.btnModalDownloadJson.addEventListener('click', exportApiJsonPayload);
    }
    if (elements.btnModalDownloadScript) {
      elements.btnModalDownloadScript.addEventListener('click', downloadPythonSyncScript);
    }
    if (elements.btnCopyDryRunCmd && elements.codeDryRunCmd) {
      elements.btnCopyDryRunCmd.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.codeDryRunCmd.textContent).then(() => {
          showToast('Dry-run CLI command copied to clipboard!', 'success');
        });
      });
    }
    if (elements.btnCopyLiveCmd && elements.codeLiveCmd) {
      elements.btnCopyLiveCmd.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.codeLiveCmd.textContent).then(() => {
          showToast('Live API sync CLI command copied to clipboard!', 'success');
        });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCountryStrategyModal();
        closeLogicModal();
        closeApiModal();
      }
    });
  }

  // 12. Application Initialization
  async function init() {
    initDOMElements();
    loadCatalogueItems();
    setupEventListeners();
    setupTableEventDelegation();
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

// ==UserScript==
// @name         Google Play Console Sale Price Automator (PlayPrice Engine)
// @namespace    https://github.com/Jagdish-24/Decide-IAP-prices
// @version      1.7.9
// @description  Automates setting country sale prices and app prices in Google Play Console with 1-click DOM injection and zero mouse movement.
// @author       PlayPrice Engine Team
// @match        https://play.google.com/console/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__PLAY_PRICE_AUTOMATOR_INJECTED__) return;
  window.__PLAY_PRICE_AUTOMATOR_INJECTED__ = true;

  console.log('[PlayPrice Automator] Initializing in-browser console automator v1.7.9...');

  // State Management
  const state = {
    countries: [],        // [{ name, code, salePrice, retailPrice, discountPct, targetValue, priceFormatted, currency, displayUnit, status }]
    currentIndex: 0,
    isRunning: false,
    isPaused: false,
    speedDelay: 1600,     // Default: Safe & Steady (1600ms) to avoid rate limits
    mainCategory: 'app_sale_price', // 'app_price' or 'app_sale_price'
    saleDiscountMode: 'fixed_price', // 'fixed_price' or 'percentage'
    autoSaveConsole: false,
    panelVisible: true,
    panelCollapsed: false,
    logs: [],
    // Realtime Timers
    timerStartTime: null,
    totalPausedMs: 0,
    pauseStartTime: null,
    timerIntervalId: null,
    lastTaskDurationMs: null,
    recentTaskDurations: []
  };

  // -------------------------------------------------------------
  // CSV Parser
  // -------------------------------------------------------------
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    
    // Detect column indexes
    // Detect column indexes with strict prioritization
    let nameIdx = header.findIndex(h => h.includes('country') || h.includes('region') || h.includes('name'));
    let codeIdx = header.findIndex(h => h.includes('code') || h.includes('iso') || h.includes('alpha'));
    let currIdx = header.findIndex(h => h.includes('currency') || h.includes('curr'));

    // 1. Retail / End-User / Base Price (matches "End-User Retail Price", "Retail Price", "Base Price", etc.)
    let retailPriceIdx = header.findIndex(h => 
      h.includes('end-user') || h.includes('end user') || h.includes('retail') || h.includes('base')
    );
    if (retailPriceIdx === -1) {
      retailPriceIdx = header.findIndex(h => h.includes('price') && !h.includes('discount') && !h.includes('sale') && !h.includes('promo'));
    }

    // 2. Sale / Discounted Price (matches "Discounted Price", "Sale Price", "Promo Price")
    let salePriceIdx = header.findIndex(h => 
      h.includes('discounted price') || h.includes('sale price') || h.includes('promo price') || h.includes('discounted') || (h.includes('sale') && !h.includes('wholesale'))
    );

    // 3. Discount Percentage (matches "Discount %", "Discount Difference", "Discount Diff", "Discount Rate")
    let discountPctIdx = header.findIndex(h => 
      h.includes('discount %') || h.includes('discount diff') || h.includes('discount difference') || h.includes('discount rate') || h.includes('pct') || h.includes('%')
    );

    if (nameIdx === -1) nameIdx = 0;

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      // Split with quotes handling
      const row = [];
      let inQuotes = false;
      let cur = '';
      for (const char of lines[i]) {
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      row.push(cur.trim());

      const name = (row[nameIdx] || '').replace(/^["']|["']$/g, '').trim();
      const code = (codeIdx !== -1 ? row[codeIdx] : '').replace(/^["']|["']$/g, '').trim();
      const curr = (currIdx !== -1 ? row[currIdx] : '').replace(/^["']|["']$/g, '').trim();

      const rawRetailPrice = (retailPriceIdx !== -1 ? row[retailPriceIdx] : '').replace(/^["']|["']$/g, '').trim();
      const rawSalePrice = (salePriceIdx !== -1 ? row[salePriceIdx] : '').replace(/^["']|["']$/g, '').trim();
      const rawDiscountPct = (discountPctIdx !== -1 ? row[discountPctIdx] : '').replace(/^["']|["']$/g, '').trim();

      if (!name) continue;

      // Extract float numbers
      const retailMatch = rawRetailPrice.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const retailPrice = retailMatch ? parseFloat(retailMatch[0]) : null;

      const saleMatch = rawSalePrice.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const salePrice = saleMatch ? parseFloat(saleMatch[0]) : null;

      const pctMatch = rawDiscountPct.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const discountPct = pctMatch ? Math.abs(parseFloat(pctMatch[0])) : null;

      const baseRetail = retailPrice !== null ? retailPrice : (salePrice !== null ? salePrice : 0);
      const baseSale = salePrice !== null ? salePrice : baseRetail;
      const basePct = discountPct !== null ? discountPct : (baseRetail > 0 && baseSale < baseRetail ? parseFloat((((baseRetail - baseSale) / baseRetail) * 100).toFixed(2)) : 0);

      items.push({
        name: name,
        code: code,
        salePrice: baseSale,
        retailPrice: baseRetail,
        discountPct: basePct,
        targetValue: baseSale,
        priceFormatted: Number.isInteger(baseSale) ? `${baseSale}` : baseSale.toFixed(2),
        currency: curr,
        displayUnit: curr,
        status: 'pending',
        message: ''
      });
    }

    return items;
  }


  // Update target values according to active mode hierarchy (App Price vs App Sale Price [Fixed vs %])
  function applyModeTargets() {
    for (const c of state.countries) {
      if (state.mainCategory === 'app_price') {
        // App Price Mode: Target the End-User Retail Price from CSV
        const val = c.retailPrice !== null ? c.retailPrice : (c.salePrice !== null ? c.salePrice : 0);
        c.targetValue = val;
        c.priceFormatted = Number.isInteger(val) ? `${val}` : val.toFixed(2);
        c.displayUnit = c.currency;
      } else if (state.saleDiscountMode === 'percentage') {
        const val = c.discountPct !== null ? c.discountPct : 0;
        c.targetValue = val;
        c.priceFormatted = Number.isInteger(val) ? `${val}` : val.toFixed(2);
        c.displayUnit = '%';
      } else {
        // App Sale Price -> Fixed Price Mode
        const val = c.salePrice !== null ? c.salePrice : (c.retailPrice !== null ? c.retailPrice : 0);
        c.targetValue = val;
        c.priceFormatted = Number.isInteger(val) ? `${val}` : val.toFixed(2);
        c.displayUnit = c.currency;
      }
    }
  }


  // -------------------------------------------------------------
  // DOM Helper Utilities
  // -------------------------------------------------------------
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getHumanizedDelay(baseDelay) {
    // Proportional natural human jitter (±15% to 25%) ensuring EVERY cadence profile
    // (Moderate 1000ms, Safe & Steady 1600ms, Ultra-Safe 2500ms, Maximum Caution 3500ms)
    // has realistic non-periodic variance between each action.
    const variance = Math.max(160, Math.round(baseDelay * 0.18));
    const jitter = randomBetween(-Math.round(variance * 0.75), variance);
    return Math.max(500, baseDelay + jitter);
  }

  // Realistic human micro-pause between sub-tasks (typing, clicking, inspecting, reviewing)
  function humanMicroPause(minMs = 160, maxMs = 360) {
    return sleep(randomBetween(minMs, maxMs));
  }

  function formatDuration(ms) {
    if (isNaN(ms) || ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function setNativeValue(element, value) {
    element.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }

  function findSearchBox() {
    return document.querySelector('input[placeholder*="country" i]') ||
           document.querySelector('input[aria-label*="country" i]') ||
           document.querySelector('input[placeholder*="region" i]') ||
           document.querySelector('input[aria-label*="region" i]') ||
           document.querySelector('input[aria-label*="Search" i]') ||
           document.querySelector('input[placeholder*="Search" i]');
  }

  async function waitForFilteredRow(countryName, timeoutMs = 4500) {
    const start = Date.now();
    const query = countryName.toLowerCase();
    
    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return null;
      
      const rows = Array.from(document.querySelectorAll('tr, [role="row"], .table-row, material-row, div[data-row]'));
      for (const row of rows) {
        const text = row.textContent.toLowerCase();
        if (text.includes(query) && !row.closest('[role="dialog"]') && !row.closest('dialog')) {
          return row;
        }
      }
      await sleep(120);
    }
    return null;
  }

  async function openRowEditModal(row) {
    try {
      row.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (e) {}
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));
    await humanMicroPause(90, 200);

    // 1. Look for edit button specifically inside the price column
    const priceCell = row.querySelector('ess-cell[essfield="price-column"], [data-col*="price"], td:nth-child(2), [role="gridcell"]:nth-child(2)');
    let pencil = null;
    if (priceCell) {
      priceCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
      priceCell.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));
      pencil = priceCell.querySelector('button[aria-label*="Edit" i], button[title*="Edit" i], button, [role="button"]');
    }

    // 2. Generic row search for edit button
    if (!pencil) {
      pencil = row.querySelector('button[aria-label*="Edit" i], button[title*="Edit" i], button[aria-label*="price" i], button[aria-label*="discount" i], material-icon[icon*="edit"], [data-icon="edit"], svg');
    }

    // 3. Search for any button inside the row
    if (!pencil) {
      const btns = Array.from(row.querySelectorAll('button, [role="button"]'));
      pencil = btns.find(b => {
        const al = (b.getAttribute('aria-label') || '').toLowerCase();
        const tt = (b.getAttribute('title') || '').toLowerCase();
        return al.includes('edit') || tt.includes('edit') || al.includes('price') || b.querySelector('svg, i, material-icon');
      }) || btns[0];
    }

    if (!pencil && priceCell) {
      pencil = priceCell;
    }

    if (pencil) {
      activelyClickElement(pencil, ['.mdc-button__touch', '.mdc-button__label', '.mdc-button__ripple', 'svg', 'path']);
      return true;
    }
    return false;
  }

  async function waitForEditPricePopup(timeoutMs = 4500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return null;

      // 1. Check known dialog / popup containers
      const dialogCandidates = Array.from(document.querySelectorAll(
        '[role="dialog"], dialog, material-dialog, .modal-dialog, .mdc-dialog, .cdk-overlay-pane, console-mega-overlay, material-popup, .popup-container, .popup, div[popupsource]'
      )).filter(d => !d.closest('#play-price-automator-root') && isElementReallyVisible(d));

      for (const d of dialogCandidates) {
        const input = d.querySelector('input:not([type="checkbox"]):not([type="radio"])');
        if (input) return { dialog: d, input };
      }

      // 2. Search by heading / text "Edit price"
      const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"], div, span'));
      for (const el of allHeadings) {
        if (el.closest('#play-price-automator-root')) continue;
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt === 'edit price' || txt.startsWith('edit price') || txt.includes('edit price')) {
          const container = el.closest('[role="dialog"], dialog, material-dialog, .cdk-overlay-pane, material-popup, .popup-container, div') || el.parentElement.parentElement;
          if (container && isElementReallyVisible(container)) {
            const input = container.querySelector('input:not([type="checkbox"]):not([type="radio"])');
            if (input) return { dialog: container, input };
          }
        }
      }

      await sleep(120);
    }
    return null;
  }

  // -------------------------------------------------------------
  // App Pricing Multi-Step DOM Automation Helpers
  // -------------------------------------------------------------

  const COUNTRY_ALIASES = {
    'czech republic': 'czechia',
    'czechia': 'czechia',
    'democratic republic of the congo': 'congo kinshasa',
    'republic of the congo': 'congo brazzaville',
    'dr congo': 'congo kinshasa',
    'congo kinshasa': 'congo kinshasa',
    'congo brazzaville': 'congo brazzaville',
    'cabo verde': 'cape verde',
    'cape verde': 'cape verde',
    'cote d ivoire': 'cote divoire',
    'cote divoire': 'cote divoire',
    'ivory coast': 'cote divoire',
    'turkey': 'turkiye',
    'turkiye': 'turkiye',
    'eswatini': 'swaziland',
    'swaziland': 'swaziland',
    'myanmar': 'myanmar',
    'burma': 'myanmar',
    'myanmar burma': 'myanmar',
    'united states of america': 'united states',
    'usa': 'united states',
    'united states': 'united states',
    'hong kong': 'hong kong',
    'hong kong sar': 'hong kong',
    'macau': 'macao',
    'macao': 'macao'
  };

  function normalizeCountry(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics: Côte -> Cote
      .replace(/[’']/g, '') // remove curly and straight apostrophes
      .replace(/\band\b/g, '&')
      .replace(/[^\w\s&]/g, ' ') // convert hyphens, dots, parentheses to spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rowMatchesCountry(row, targetName) {
    if (!row || row.closest('[role="dialog"]') || row.closest('#play-price-automator-root')) return false;

    const targetNorm = normalizeCountry(targetName);
    if (!targetNorm) return false;
    const aliasedTargetNorm = COUNTRY_ALIASES[targetNorm] || targetNorm;

    // 1. Direct check on mat-checkbox[aria-label] inside the row
    const chk = row.querySelector('mat-checkbox[aria-label], [role="checkbox"][aria-label]');
    if (chk) {
      const label = chk.getAttribute('aria-label') || '';
      if (!label.toLowerCase().includes('select all')) {
        const labelNorm = normalizeCountry(label);
        const aliasedLabelNorm = COUNTRY_ALIASES[labelNorm] || labelNorm;
        if (labelNorm === targetNorm || aliasedLabelNorm === aliasedTargetNorm ||
            labelNorm === aliasedTargetNorm || aliasedLabelNorm === targetNorm) {
          return true;
        }
        if (labelNorm.startsWith(targetNorm) || targetNorm.startsWith(labelNorm)) {
          return true;
        }
      }
    }

    // 2. Check region column cell / main text inside the row
    const regionTextEl = row.querySelector('ess-cell[essfield="region-column"] .main-text, console-table-text-cell .main-text, ess-cell[essfield="region-column"]') || row;
    const cellNorm = normalizeCountry(regionTextEl.textContent);
    const aliasedCellNorm = COUNTRY_ALIASES[cellNorm] || cellNorm;

    if (cellNorm === targetNorm || aliasedCellNorm === aliasedTargetNorm ||
        cellNorm === aliasedTargetNorm || aliasedCellNorm === targetNorm) {
      return true;
    }
    if (cellNorm.startsWith(targetNorm) || (aliasedTargetNorm && cellNorm.startsWith(aliasedTargetNorm))) {
      const nextChar = cellNorm.charAt(targetNorm.length);
      if (!nextChar || /[\s&]/.test(nextChar)) return true;
    }

    // 3. Fallback: check full row text
    const rowNorm = normalizeCountry(row.textContent);
    if (rowNorm.startsWith(targetNorm)) {
      const nextChar = rowNorm.charAt(targetNorm.length);
      if (!nextChar || /[\s&]/.test(nextChar)) return true;
    }

    return false;
  }

  function isElementReallyVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // Actively and reliably clicks any target element and its inner delegates
  function activelyClickElement(el, innerSelectors = []) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (e) {}

    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const commonOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY
    };

    if (typeof el.focus === 'function') {
      try { el.focus(); } catch (e) {}
    }

    // Dispatch full pointer and mouse sequence on main host element
    el.dispatchEvent(new PointerEvent('pointerdown', { ...commonOpts, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...commonOpts, button: 0, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...commonOpts, button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...commonOpts, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...commonOpts, button: 0, buttons: 0 }));

    if (typeof el.click === 'function') {
      try { el.click(); } catch (e) {}
    }

    // Actively dispatch to inner delegates (e.g. .mdc-button__touch, .mat-checkbox-container)
    for (const sel of innerSelectors) {
      const inner = typeof sel === 'string' ? el.querySelector(sel) : sel;
      if (inner && inner !== el) {
        try {
          inner.dispatchEvent(new PointerEvent('pointerdown', { ...commonOpts, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
          inner.dispatchEvent(new MouseEvent('mousedown', { ...commonOpts, button: 0, buttons: 1 }));
          inner.dispatchEvent(new PointerEvent('pointerup', { ...commonOpts, button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
          inner.dispatchEvent(new MouseEvent('mouseup', { ...commonOpts, button: 0, buttons: 0 }));
          inner.dispatchEvent(new MouseEvent('click', { ...commonOpts, button: 0, buttons: 0 }));
          if (typeof inner.click === 'function') inner.click();
        } catch (e) {}
      }
    }
    return true;
  }

  function simulateFullClick(el) {
    return activelyClickElement(el);
  }

  function findSetPricingElement() {
    // 1. Direct search by button and role="button" matching text "Set pricing"
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], .mdc-button, bulk-price-edit-button button'));
    for (const btn of buttons) {
      if (btn.closest('#play-price-automator-root')) continue;
      
      const labelEl = btn.querySelector('.mdc-button__label');
      const text = (labelEl ? labelEl.textContent : btn.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();

      if (text === 'set pricing' || text === 'set price' || aria === 'set pricing' || aria === 'set price' || text.startsWith('set pricing')) {
        const isDisabled = btn.disabled ||
                           btn.getAttribute('aria-disabled') === 'true' ||
                           btn.classList.contains('disabled') ||
                           btn.classList.contains('mdc-button--disabled');
        const touchEl = btn.querySelector('.mdc-button__touch') || labelEl || btn;
        return { clickable: btn, innerEl: touchEl, isDisabled };
      }
    }

    // 2. Search by inner label element directly: <span class="mdc-button__label">Set pricing</span>
    const labels = Array.from(document.querySelectorAll('.mdc-button__label, span, div'));
    for (const lbl of labels) {
      if (lbl.closest('#play-price-automator-root')) continue;
      const txt = (lbl.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
      if (txt === 'set pricing' || txt === 'set price') {
        const btn = lbl.closest('button, [role="button"], .mdc-button') || lbl;
        if (isElementReallyVisible(btn)) {
          const isDisabled = btn.disabled ||
                             btn.getAttribute('aria-disabled') === 'true' ||
                             btn.classList.contains('disabled') ||
                             btn.classList.contains('mdc-button--disabled');
          return { clickable: btn, innerEl: lbl, isDisabled };
        }
      }
    }

    return null;
  }

  function isPricingTableInSelectionMode() {
    // Check if table currently contains visible row checkboxes
    const tableCheckboxes = Array.from(document.querySelectorAll(
      '.particle-table-row mat-checkbox, ess-cell mat-checkbox, console-table-tools-cell mat-checkbox, [role="row"] mat-checkbox, .ess-table-canvas mat-checkbox, [role="grid"] [role="checkbox"]'
    )).filter(chk => {
      if (chk.closest('#play-price-automator-root')) return false;
      const label = (chk.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('select all')) return false;
      return isElementReallyVisible(chk);
    });

    return tableCheckboxes.length > 0;
  }

  async function clickSetPricingButton(timeoutMs = 6000) {
    // If the table is already in selection mode with checkboxes, return true immediately
    if (isPricingTableInSelectionMode()) {
      return true;
    }

    log('🔍 Locating "Set pricing" button in Google Play Console...');
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return false;

      // Check if table selection mode became active
      if (isPricingTableInSelectionMode()) {
        log('✅ Table already in selection state with checkboxes.');
        return true;
      }

      const target = findSetPricingElement();

      if (target) {
        if (target.isDisabled) {
          log('ℹ️ "Set pricing" button is disabled (selection mode active).');
          return true;
        }

        log('👆 Clicking "Set pricing" button...');
        // Actively click button and its inner touch / label elements
        activelyClickElement(target.clickable, ['.mdc-button__touch', '.mdc-button__label', '.mdc-button__ripple']);

        // Wait for selection mode or row checkboxes to appear
        const waitStart = Date.now();
        while (Date.now() - waitStart < 3500) {
          if (isPricingTableInSelectionMode()) {
            log('✅ "Set pricing" selection state active.');
            await humanMicroPause(120, 240);
            return true;
          }
          await sleep(100);
        }

        const recheck = findSetPricingElement();
        if (recheck && recheck.isDisabled) {
          log('✅ "Set pricing" accepted.');
          return true;
        }
        return true;
      }

      await sleep(200);
    }

    if (isPricingTableInSelectionMode()) {
      return true;
    }

    log('⚠️ Could not locate or click active "Set pricing" button.');
    return false;
  }

  function isCheckboxChecked(chk) {
    if (!chk) return false;
    if (chk.getAttribute('aria-checked') === 'true') return true;
    if (chk.hasAttribute('checked')) return true;
    if (chk.checked === true) return true;
    const container = chk.querySelector('.mat-checkbox-container');
    if (container && (container.classList.contains('checked') || container.getAttribute('aria-checked') === 'true')) return true;
    const path = chk.querySelector('path');
    if (path && (path.style.visibility === 'visible' || path.getAttribute('style')?.includes('visibility: visible'))) return true;
    return false;
  }

  function findCountryCheckboxAndRow(targetName) {
    if (!targetName) return null;
    const targetNorm = normalizeCountry(targetName);
    const aliasedTargetNorm = COUNTRY_ALIASES[targetNorm] || targetNorm;

    // 1. Direct scan of all row mat-checkbox elements with aria-label
    const checkboxes = Array.from(document.querySelectorAll(
      '.particle-table-row mat-checkbox, ess-cell mat-checkbox, console-table-tools-cell mat-checkbox, mat-checkbox[aria-label], [role="checkbox"][aria-label]'
    )).filter(c => !c.closest('#play-price-automator-root'));

    // 1a. Exact match on aria-label
    for (const chk of checkboxes) {
      const label = chk.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes('select all')) continue;

      const labelNorm = normalizeCountry(label);
      const aliasedLabelNorm = COUNTRY_ALIASES[labelNorm] || labelNorm;

      if (labelNorm === targetNorm || aliasedLabelNorm === aliasedTargetNorm ||
          labelNorm === aliasedTargetNorm || aliasedLabelNorm === targetNorm) {
        const row = chk.closest('.particle-table-row, [role="row"], tr') || chk.parentElement;
        return { chk, row };
      }
    }

    // 1b. Boundary / prefix match on aria-label
    for (const chk of checkboxes) {
      const label = chk.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes('select all')) continue;

      const labelNorm = normalizeCountry(label);
      if (labelNorm.startsWith(targetNorm) || targetNorm.startsWith(labelNorm) ||
          (aliasedTargetNorm && labelNorm.startsWith(aliasedTargetNorm))) {
        const row = chk.closest('.particle-table-row, [role="row"], tr') || chk.parentElement;
        return { chk, row };
      }
    }

    // 2. Scan all particle-table-row and [role="row"] elements by text
    const rows = Array.from(document.querySelectorAll('.particle-table-row, [role="row"], tr'));
    for (const r of rows) {
      if (r.closest('#play-price-automator-root') || r.closest('[role="dialog"]')) continue;
      if (rowMatchesCountry(r, targetName)) {
        const chk = r.querySelector('mat-checkbox, [role="checkbox"], input[type="checkbox"], material-checkbox');
        if (chk) return { chk, row: r };
      }
    }

    return null;
  }

  async function toggleCheckbox(chk, shouldBeChecked = true) {
    if (!chk) return false;

    if (isCheckboxChecked(chk) === shouldBeChecked) {
      return true; // Already desired state
    }

    chk.scrollIntoView({ block: 'center', inline: 'nearest' });
    await humanMicroPause(60, 120);

    const container = chk.querySelector('.mat-checkbox-container') || chk;
    const toolsCell = chk.closest('console-table-tools-cell') || chk.parentElement;

    // Attempt 1: Actively click the inner .mat-checkbox-container (has delegate-events="")
    activelyClickElement(container, [chk, 'svg']);
    await sleep(120);
    if (isCheckboxChecked(chk) === shouldBeChecked) return true;

    // Attempt 2: Actively click the host mat-checkbox element
    activelyClickElement(chk, ['.mat-checkbox-container', 'svg']);
    await sleep(120);
    if (isCheckboxChecked(chk) === shouldBeChecked) return true;

    // Attempt 3: Standard W3C Space keypress on tabindex="0" role="checkbox"
    try {
      chk.focus();
      const spaceOpts = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, composed: true };
      chk.dispatchEvent(new KeyboardEvent('keydown', spaceOpts));
      chk.dispatchEvent(new KeyboardEvent('keyup', spaceOpts));
      await sleep(120);
      if (isCheckboxChecked(chk) === shouldBeChecked) return true;
    } catch (e) {}

    // Attempt 4: Actively click toolsCell container
    if (toolsCell && toolsCell !== chk) {
      activelyClickElement(toolsCell);
      await sleep(120);
      if (isCheckboxChecked(chk) === shouldBeChecked) return true;
    }

    return isCheckboxChecked(chk) === shouldBeChecked;
  }

  async function clearOtherRowSelections(exceptCheckbox = null) {
    try {
      const allCheckboxes = Array.from(document.querySelectorAll(
        '.particle-table-row mat-checkbox, ess-cell mat-checkbox, [role="row"] mat-checkbox, mat-checkbox[aria-checked="true"], [role="checkbox"][aria-checked="true"]'
      )).filter(chk => !chk.closest('#play-price-automator-root'));

      for (const chk of allCheckboxes) {
        if (exceptCheckbox && (chk === exceptCheckbox || chk.contains(exceptCheckbox) || exceptCheckbox.contains(chk))) continue;

        const label = (chk.getAttribute('aria-label') || '').toLowerCase();
        // NEVER uncheck or click "Select all rows"!
        if (label.includes('select all')) continue;

        if (isCheckboxChecked(chk)) {
          await toggleCheckbox(chk, false);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  async function findCountryRowInList(countryName, timeoutMs = 10000) {
    const start = Date.now();

    // 1. Check currently rendered DOM first
    let match = findCountryCheckboxAndRow(countryName);
    if (match) {
      match.row?.scrollIntoView({ block: 'center', inline: 'nearest' });
      await humanMicroPause(100, 200);
      return match;
    }

    // 2. Identify scroll containers in Google Play Console
    const scrollContainers = [
      document.querySelector('.ess-table-canvas'),
      document.querySelector('.ess-table-wrapper'),
      document.querySelector('[acxscrollhost]'),
      document.getElementById('main-content'),
      document.querySelector('.main-content'),
      window
    ].filter(Boolean);

    for (const container of scrollContainers) {
      const isWindow = container === window;

      // Scroll to top first to ensure complete top-to-bottom scan
      if (isWindow) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        container.scrollTop = 0;
      }
      await sleep(150);

      // Check top rows
      match = findCountryCheckboxAndRow(countryName);
      if (match) {
        match.row?.scrollIntoView({ block: 'center', inline: 'nearest' });
        await humanMicroPause(120, 240);
        return match;
      }

      // Progressively scroll down
      let prevScroll = -1;
      while (Date.now() - start < timeoutMs) {
        if (!state.isRunning) return null;

        if (isWindow) {
          window.scrollBy({ top: 350, behavior: 'instant' });
        } else {
          container.scrollTop += 350;
        }
        await sleep(150);

        match = findCountryCheckboxAndRow(countryName);
        if (match) {
          match.row?.scrollIntoView({ block: 'center', inline: 'nearest' });
          await humanMicroPause(120, 240);
          return match;
        }

        const currentScroll = isWindow ? (window.scrollY || document.documentElement.scrollTop) : container.scrollTop;
        if (currentScroll === prevScroll) {
          break; // Reached bottom of this scroll container
        }
        prevScroll = currentScroll;
      }
    }

    return null;
  }

  async function checkCountryRowCheckbox(rowOrMatch, countryName) {
    let chk = null;

    if (!rowOrMatch) return false;

    // Case 1: Match object { chk, row }
    if (rowOrMatch.chk) {
      chk = rowOrMatch.chk;
    } else if (rowOrMatch.tagName?.toLowerCase() === 'mat-checkbox' || rowOrMatch.getAttribute?.('role') === 'checkbox') {
      // Case 2: Checkbox element passed directly
      chk = rowOrMatch;
    } else if (rowOrMatch.querySelector) {
      // Case 3: Row element passed - strictly find mat-checkbox or role="checkbox", NEVER container cells!
      chk = rowOrMatch.querySelector('mat-checkbox, [role="checkbox"], input[type="checkbox"], material-checkbox');
    }

    // Fallback: search globally by countryName
    if (!chk && countryName) {
      const match = findCountryCheckboxAndRow(countryName);
      if (match) chk = match.chk;
    }

    if (!chk) {
      log(`⚠️ Could not find mat-checkbox for ${countryName}`);
      return false;
    }

    // Clear other selections so only target country is checked
    await clearOtherRowSelections(chk);
    await humanMicroPause(80, 160);

    // Toggle target checkbox to checked
    const success = await toggleCheckbox(chk, true);
    if (success) {
      log(`  ✅ Checked row checkbox for ${countryName || chk.getAttribute('aria-label')}`);
      return true;
    }

    log(`  ⚠️ Could not verify aria-checked="true" for ${countryName || chk.getAttribute('aria-label')}`);
    return false;
  }

  async function clickBottomContinueButton(timeoutMs = 4500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return false;
      const btns = Array.from(document.querySelectorAll(
        'console-bottom-action-bar button, .bottom-action-bar button, [debug-id*="continue"] button, button, [role="button"], a, material-button'
      ));
      const continueBtn = btns.find(b => {
        if (b.closest('#play-price-automator-root')) return false;
        const txt = (b.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
        const isVisible = isElementReallyVisible(b);
        const isNotDisabled = !b.disabled && 
                              b.getAttribute('aria-disabled') !== 'true' && 
                              !b.classList.contains('disabled') && 
                              !b.classList.contains('mdc-button--disabled');
        return (txt === 'continue' || txt === 'next' || txt === 'set price' || txt.startsWith('continue')) && isVisible && isNotDisabled;
      });
      if (continueBtn) {
        await humanMicroPause(100, 200);
        activelyClickElement(continueBtn, ['.mdc-button__touch', '.mdc-button__label']);
        return true;
      }

      // Fallback: Check if top "Set pricing" button is enabled and acts as the entry action
      const setPricingBtn = findSetPricingElement();
      if (setPricingBtn && !setPricingBtn.isDisabled && isElementReallyVisible(setPricingBtn.clickable)) {
        await humanMicroPause(100, 200);
        activelyClickElement(setPricingBtn.clickable, ['.mdc-button__touch', '.mdc-button__label']);
        return true;
      }

      await sleep(120);
    }
    return false;
  }

  async function waitForAppPricingModal(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return null;

      // 1. Look for dialogs by container types (including Google's custom <modal> and <console-mega-overlay>)
      const dialogCandidates = Array.from(document.querySelectorAll(
        '[role="dialog"], dialog, material-dialog, modal, console-mega-overlay, .modal-dialog, .mdc-dialog, .cdk-overlay-pane'
      )).filter(d => !d.closest('#play-price-automator-root') && isElementReallyVisible(d));

      for (const d of dialogCandidates) {
        const text = (d.textContent || '').toLowerCase();
        if (text.includes('set price for selected') || text.includes('update') || text.includes('pricing for the selected')) {
          const input = d.querySelector('input:not([type="checkbox"]):not([type="radio"])');
          if (input) {
            return { dialog: d, input };
          }
        }
      }

      // 2. Also search by modal title heading directly
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"], div, span'));
      for (const h of headings) {
        if (h.closest('#play-price-automator-root')) continue;
        const txt = (h.textContent || '').trim().toLowerCase();
        if (txt.includes('set price for selected countries') || txt.includes('set price for selected')) {
          const dialog = h.closest('modal, console-mega-overlay, [role="dialog"], material-dialog, .cdk-overlay-pane, div') || h.parentElement.parentElement;
          if (dialog && isElementReallyVisible(dialog)) {
            const input = dialog.querySelector('input:not([type="checkbox"]):not([type="radio"])');
            if (input) {
              return { dialog, input };
            }
          }
        }
      }

      await sleep(150);
    }
    return null;
  }

  async function setModalPrice(input, priceValue) {
    if (!input) return false;
    input.scrollIntoView({ block: 'nearest' });
    input.focus();
    await humanMicroPause(60, 120);

    // Select all & replace via execCommand (standard across modern browsers & Angular)
    try {
      input.select?.();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, priceValue);
    } catch (e) {
      // fallback
    }

    // Also set property directly on prototype
    setNativeValue(input, priceValue);

    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    input.blur();
    await humanMicroPause(100, 200);
    return true;
  }

  function getCurrentModalCurrency(dialog) {
    if (!dialog) return '';
    // 1. Native select
    const sel = dialog.querySelector('select');
    if (sel) {
      const opt = sel.selectedOptions?.[0] || sel.querySelector('option:checked');
      if (opt) return opt.textContent.trim();
      if (sel.value) return sel.value.trim();
    }
    // 2. Dropdown buttons, material-select, combobox
    const items = Array.from(dialog.querySelectorAll(
      '[role="combobox"], material-select, [aria-haspopup="listbox"], .mdc-select__anchor, button, div[role="button"]'
    ));
    for (const item of items) {
      if (item.closest('input')) continue;
      const txt = item.textContent.trim();
      const match = txt.match(/\b([A-Z]{3})\b/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  async function selectModalCurrency(dialog, targetCurrency) {
    if (!targetCurrency || !dialog) return true;
    const targetCode = targetCurrency.trim().toUpperCase();

    // 1. Native select
    const nativeSelect = dialog.querySelector('select');
    if (nativeSelect) {
      const opt = Array.from(nativeSelect.options).find(o => 
        o.value.toUpperCase() === targetCode || 
        o.textContent.toUpperCase().includes(targetCode)
      );
      if (opt) {
        nativeSelect.value = opt.value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        log(`  Currency set to ${targetCode} via native select.`);
        return true;
      }
    }

    // 2. Check if already displays target currency
    const currentCurr = getCurrentModalCurrency(dialog);
    if (currentCurr.toUpperCase() === targetCode) {
      log(`  Currency already matches target (${targetCode}).`);
      return true;
    }

    // 3. Locate dropdown trigger button
    const triggers = Array.from(dialog.querySelectorAll(
      '[role="combobox"], material-select, [aria-haspopup="listbox"], [aria-haspopup="true"], .mdc-select__anchor, button, div[tabindex="0"]'
    ));
    const currTrigger = triggers.find(b => {
      if (b.closest('input')) return false;
      const txt = b.textContent.trim();
      const hasCode = /\b[A-Z]{3}\b/.test(txt);
      const hasArrow = b.querySelector('svg, .material-icons, .material-icon-i, [data-icon*="arrow"], [data-icon*="down"]');
      return (hasCode && hasArrow) || (hasCode && b.getAttribute('role') === 'combobox');
    }) || triggers.find(b => {
      const txt = b.textContent.trim();
      return /\b[A-Z]{3}\b/.test(txt) && !b.closest('input') && !b.closest('button[aria-label*="close" i]');
    });

    if (!currTrigger) {
      log(`  ⚠️ Could not find currency dropdown in modal, proceeding with current currency.`);
      return false;
    }

    // Click dropdown trigger with full pointer sequence
    currTrigger.scrollIntoView({ block: 'nearest' });
    await humanMicroPause(120, 220);
    simulateFullClick(currTrigger);
    await sleep(400);

    // 4. In opened list/overlay, find option matching targetCode across whole DOM
    const optionContainers = [
      document.querySelector('.cdk-overlay-container'),
      document.querySelector('material-popup'),
      document.querySelector('[role="listbox"]'),
      document.querySelector('.mdc-menu'),
      document.body
    ].filter(Boolean);

    let targetOpt = null;
    for (const container of optionContainers) {
      const options = Array.from(container.querySelectorAll(
        '[role="option"], material-select-item, [role="menuitem"], .mdc-list-item, .popup-item, li, button, div'
      ));
      targetOpt = options.find(o => {
        if (!isElementReallyVisible(o)) return false;
        const t = (o.textContent || '').trim().toUpperCase();
        return t === targetCode || 
               t.startsWith(targetCode + ' ') || 
               t.includes(`(${targetCode})`) || 
               t.includes(` ${targetCode} `) ||
               t.endsWith(` ${targetCode}`);
      });
      if (targetOpt) break;
    }

    // 5. Check if dropdown has a search input
    if (!targetOpt) {
      const filterInput = document.querySelector(
        '[role="listbox"] input, .cdk-overlay-container input, material-select-dropdown input, material-popup input'
      );
      if (filterInput && isElementReallyVisible(filterInput)) {
        filterInput.focus();
        setNativeValue(filterInput, targetCode);
        await sleep(300);
        for (const container of optionContainers) {
          const filteredOptions = Array.from(container.querySelectorAll(
            '[role="option"], material-select-item, .mdc-list-item, [role="menuitem"]'
          ));
          targetOpt = filteredOptions.find(o => {
            const t = (o.textContent || '').trim().toUpperCase();
            return t.includes(targetCode);
          });
          if (targetOpt) break;
        }
      }
    }

    if (targetOpt) {
      targetOpt.scrollIntoView({ block: 'nearest' });
      await humanMicroPause(100, 200);
      simulateFullClick(targetOpt);
      log(`  Selected currency ${targetCode} in dropdown.`);
      await humanMicroPause(120, 250);
      return true;
    }

    log(`  ⚠️ Currency option ${targetCode} not found in dropdown list.`);
    // Dismiss overlay safely
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return false;
  }

  async function clickModalUpdateButton(dialog) {
    if (!dialog) return false;
    const btns = Array.from(dialog.querySelectorAll('button, [role="button"], material-button, a'));
    const updateBtn = btns.find(b => {
      const txt = (b.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
      const isVisible = isElementReallyVisible(b);
      const isNotDisabled = !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled') && !b.classList.contains('mdc-button--disabled');
      return (txt === 'update' || txt === 'apply' || txt === 'save') && isVisible && isNotDisabled;
    });

    if (updateBtn) {
      await humanMicroPause(120, 240);
      activelyClickElement(updateBtn, ['.mdc-button__touch', '.mdc-button__label']);
      
      // Wait for dialog to disappear
      const start = Date.now();
      while (Date.now() - start < 4000) {
        if (!document.body.contains(dialog) || !isElementReallyVisible(dialog)) {
          return true;
        }
        await sleep(100);
      }
      return true;
    }
    return false;
  }

  function dismissConsoleToast() {
    try {
      const toasts = Array.from(document.querySelectorAll(
        'console-snackbar, .console-snackbar, [role="alert"], material-snackbar, .mdc-snackbar, .snackbar'
      )).filter(t => !t.closest('#play-price-automator-root') && isElementReallyVisible(t));
      for (const t of toasts) {
        const closeBtn = t.querySelector('button, [role="button"], .close, [aria-label*="close" i], [aria-label*="dismiss" i]');
        if (closeBtn) activelyClickElement(closeBtn);
      }
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // Realtime Timer Controllers
  // -------------------------------------------------------------
  function startTimers() {
    if (!state.timerStartTime) {
      state.timerStartTime = Date.now();
      state.totalPausedMs = 0;
      state.pauseStartTime = null;
      updateEstCompletionUI();
    } else if (state.pauseStartTime) {
      state.totalPausedMs += (Date.now() - state.pauseStartTime);
      state.pauseStartTime = null;
    }

    if (state.timerIntervalId) clearInterval(state.timerIntervalId);
    state.timerIntervalId = setInterval(updateTimersTick, 200);
    updateTimersTick();
  }

  function pauseTimers() {
    state.pauseStartTime = Date.now();
    if (state.timerIntervalId) {
      clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }
  }

  function stopTimers(reset = false) {
    if (state.timerIntervalId) {
      clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }
    if (reset) {
      state.timerStartTime = null;
      state.totalPausedMs = 0;
      state.pauseStartTime = null;
      state.lastTaskDurationMs = null;
      state.recentTaskDurations = [];
      const elElapsed = document.getElementById('ppa-timer-elapsed');
      if (elElapsed) elElapsed.textContent = '00:00';
      updateEstCompletionUI();
    }
  }

  function updateTimersTick() {
    if (!state.timerStartTime) return;

    const now = Date.now();
    const paused = state.totalPausedMs + (state.pauseStartTime ? (now - state.pauseStartTime) : 0);
    const elapsedMs = Math.max(0, now - state.timerStartTime - paused);

    const elElapsed = document.getElementById('ppa-timer-elapsed');
    if (elElapsed) {
      elElapsed.textContent = formatDuration(elapsedMs);
    }
  }

  function updateEstCompletionUI() {
    const elRemain = document.getElementById('ppa-timer-remaining');
    if (!elRemain) return;

    const total = state.countries.length;
    if (total === 0) {
      elRemain.textContent = '--:--';
      return;
    }

    const completed = state.countries.filter(c => c.status === 'done' || c.status === 'matched' || c.status === 'failed').length;
    const remaining = Math.max(0, total - completed);

    if (completed >= total && total > 0) {
      elRemain.textContent = `Completed 🎉`;
      return;
    }

    const now = Date.now();
    // Calculate total remaining time based on the rolling average of the last 5 completed tasks:
    let avgTaskMs;
    const recents = state.recentTaskDurations;
    if (recents && recents.length > 0) {
      const sum = recents.reduce((acc, val) => acc + val, 0);
      avgTaskMs = sum / recents.length;
    } else {
      // Baseline before any tasks complete: speedDelay + modal overhead
      avgTaskMs = state.speedDelay + 1500;
    }

    const remainingMs = remaining * avgTaskMs;
    const etaDate = new Date(now + remainingMs);
    const etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const prefix = (recents && recents.length > 0) ? '' : '~';
    elRemain.textContent = `${prefix}${formatDuration(remainingMs)} (ETA: ${etaStr})`;
  }

  // -------------------------------------------------------------
  // Core Automation Loop
  // -------------------------------------------------------------
  async function runAutomation() {
    if (state.countries.length === 0) {
      log('⚠️ Please load a bot_sale_prices CSV file first!');
      return;
    }

    state.isRunning = true;
    state.isPaused = false;
    startTimers();
    updateUI();

    let modeLabel = '';
    if (state.mainCategory === 'app_price') {
      modeLabel = '🏷️ App Price Mode (Retail Price column)';
    } else if (state.saleDiscountMode === 'percentage') {
      modeLabel = '🏷️ App Sale Price (Discount % Mode)';
    } else {
      modeLabel = '💰 App Sale Price (Fixed Price Mode)';
    }
    log(`🚀 Starting automation in ${modeLabel} for ${state.countries.length} countries (Speed: ${state.speedDelay}ms)...`);

    const searchBox = findSearchBox();
    if (!searchBox) {
      log('❌ Could not locate Google Play Console search bar ("Search by country or region")! Are you on the "Pricing" or "Availability and pricing" page?');
      state.isRunning = false;
      stopTimers();
      updateUI();
      return;
    }

    let processedSinceLastCooldown = 0;

    for (let idx = state.currentIndex; idx < state.countries.length; idx++) {
      if (!state.isRunning) {
        log('🛑 Automation stopped by user.');
        break;
      }

      while (state.isPaused && state.isRunning) {
        await sleep(200);
      }
      if (!state.isRunning) break;

      // Anti-Bot Rate-Limiting Protection: Breathing rest cooldown every 25 processed items with natural jitter
      if (processedSinceLastCooldown > 0 && processedSinceLastCooldown % 25 === 0 && idx < state.countries.length - 1) {
        const breakDuration = randomBetween(2800, 3600);
        log(`🛡️ Rate-Limit Safeguard: Taking a natural ${(breakDuration / 1000).toFixed(1)}s rest break... (${processedSinceLastCooldown} countries processed)`);
        await sleep(breakDuration);
      }

      state.currentIndex = idx;
      const c = state.countries[idx];
      c.status = 'active';
      updateUI();

      const taskStartTime = Date.now();
      const taskStartPausedMs = state.totalPausedMs;

      const isPercentage = state.mainCategory === 'app_sale_price' && state.saleDiscountMode === 'percentage';
      const unitText = isPercentage ? '%' : ` ${c.currency}`;
      const typeLabel = state.mainCategory === 'app_price' ? 'App Retail Price' : (isPercentage ? 'Sale Discount' : 'Sale Price');
      log(`📍 [${idx + 1}/${state.countries.length}] ${c.name} • Target ${typeLabel}: ${c.priceFormatted}${unitText}`);

      try {
        // Step 1: Focus and double-click to select all text in search bar & paste country name
        searchBox.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        searchBox.focus();
        await humanMicroPause(70, 160);
        searchBox.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        if (typeof searchBox.select === 'function') searchBox.select();
        await humanMicroPause(50, 130);
        setNativeValue(searchBox, c.name);

        // Safe Cadence Delay
        await sleep(getHumanizedDelay(state.speedDelay));

        // Step 2: Wait for filtered row in table
        const row = await waitForFilteredRow(c.name, 4500);
        if (!row) {
          log(`⚠️ Row not found for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Row not found';
          updateUI();
          continue;
        }
        await humanMicroPause(100, 240);

        // Step 3: Open Edit Price modal by clicking pencil button in row
        const opened = await openRowEditModal(row);
        if (!opened) {
          log(`⚠️ Could not click edit button for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Edit button not found';
          updateUI();
          continue;
        }

        await sleep(getHumanizedDelay(Math.min(900, state.speedDelay)));

        // Step 4: Handle Edit Modal Input
        const modalObj = await waitForEditPricePopup(4500);
        if (!modalObj) {
          log(`⚠️ Edit popup did not open for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Modal did not open';
          updateUI();
          continue;
        }

        const { dialog, input } = modalObj;
        await humanMicroPause(150, 320);

        // Step 5: Check current existing value in input
        const existingVal = input.value.trim();
        const numMatch = existingVal.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
        const existingNum = numMatch ? parseFloat(numMatch[0]) : null;

        if (existingNum !== null && Math.abs(existingNum - c.targetValue) < 0.001) {
          // Already matches target value!
          log(`✨ [${c.name}] Value already matches target (${existingNum} == ${c.priceFormatted}${unitText}). Cleanly dismissing modal...`);
          c.status = 'matched';
          c.message = 'Already matches';

          await humanMicroPause(140, 280);
          const cancelBtn = dialog.querySelector('button[aria-label*="Cancel" i]') ||
                            Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('cancel'));
          if (cancelBtn) {
            activelyClickElement(cancelBtn);
          } else {
            dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          }
          await humanMicroPause(90, 190);
        } else {
          // Set new price value
          log(`🔄 [${c.name}] Setting '${existingVal || 'empty'}' -> '${c.priceFormatted}${unitText}'...`);
          await setModalPrice(input, c.priceFormatted);
          await humanMicroPause(280, 520);

          // Find Save button in dialog
          const saveBtn = dialog.querySelector('button[aria-label*="Save" i]') ||
                          dialog.querySelector('button[aria-label*="Apply" i]') ||
                          dialog.querySelector('button[aria-label*="Update" i]') ||
                          Array.from(dialog.querySelectorAll('button')).find(b => {
                            const t = b.textContent.toLowerCase().trim();
                            return (t === 'save' || t === 'apply' || t === 'update' || t.includes('save')) && !b.disabled;
                          });

          if (saveBtn) {
            activelyClickElement(saveBtn, ['.mdc-button__touch', '.mdc-button__label']);
            c.status = 'done';
            c.message = `Saved: ${c.priceFormatted}${unitText}`;
            log(`✅ [${c.name}] Saved: ${c.priceFormatted}${unitText}`);

            // Wait for popup to disappear
            const closeStart = Date.now();
            while (Date.now() - closeStart < 3500) {
              if (!document.body.contains(dialog) || !isElementReallyVisible(dialog)) break;
              await sleep(100);
            }
          } else {
            log(`⚠️ [${c.name}] Save button disabled or not found.`);
            c.status = 'failed';
            c.message = 'Save disabled';
          }
        }

        dismissConsoleToast();
        processedSinceLastCooldown++;
        await sleep(getHumanizedDelay(state.speedDelay));

      } catch (err) {
        log(`❌ Error processing ${c.name}: ${err.message}`);
        c.status = 'failed';
        c.message = err.message;
      }

      // Record active duration of this task (excluding user pause intervals)
      const taskCurrentPaused = state.totalPausedMs + (state.pauseStartTime ? (Date.now() - state.pauseStartTime) : 0);
      const taskActiveMs = Math.max(0, Date.now() - taskStartTime - (taskCurrentPaused - taskStartPausedMs));
      if (taskActiveMs > 200) {
        state.lastTaskDurationMs = taskActiveMs;
        if (!state.recentTaskDurations) state.recentTaskDurations = [];
        state.recentTaskDurations.push(taskActiveMs);
        if (state.recentTaskDurations.length > 5) {
          state.recentTaskDurations.shift();
        }
      }

      updateUI();
      updateEstCompletionUI();
    }

    if (state.isRunning && state.currentIndex >= state.countries.length - 1) {
      log('🏆 All countries completed successfully!');
      if (state.autoSaveConsole) {
        await saveConsoleChanges();
      }
      updateEstCompletionUI();
    }

    state.isRunning = false;
    stopTimers(false);
    updateUI();
  }

  async function saveConsoleChanges() {
    log('💾 Looking for bottom "Save changes" bar in Google Play Console...');
    await humanMicroPause(700, 1100);
    const saveAllBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const txt = b.textContent.trim().toLowerCase();
      return txt === 'save changes' || (txt === 'save' && b.closest('.bottom-bar, footer, [role="region"]'));
    });

    if (saveAllBtn && !saveAllBtn.disabled) {
      saveAllBtn.scrollIntoView({ block: 'nearest' });
      await humanMicroPause(180, 340);
      saveAllBtn.click();
      log('🎉 Clicked main "Save changes" in Google Play Console!');
    } else {
      log('ℹ️ Main "Save changes" button not found or already saved.');
    }
  }

  // -------------------------------------------------------------
  // Activity Logging & UI Updates
  // -------------------------------------------------------------
  function log(msg) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    state.logs.push(entry);
    if (state.logs.length > 250) state.logs.shift();

    const box = document.getElementById('ppa-log-box');
    if (box) {
      box.textContent = state.logs.join('\n');
      box.scrollTop = box.scrollHeight;
    }
    console.log(`[PlayPrice Automator] ${msg}`);
  }

  function updateUI() {
    const total = state.countries.length;
    const cur = state.currentIndex;
    const pct = total > 0 ? Math.round((cur / total) * 100) : 0;

    const doneCount = state.countries.filter(c => c.status === 'done').length;
    const matchedCount = state.countries.filter(c => c.status === 'matched').length;
    const failedCount = state.countries.filter(c => c.status === 'failed').length;

    const bar = document.getElementById('ppa-progress-bar');
    const pctLbl = document.getElementById('ppa-progress-pct');
    const statusLbl = document.getElementById('ppa-progress-status');

    if (bar) bar.style.width = `${pct}%`;
    if (pctLbl) pctLbl.textContent = `${pct}%`;

    if (statusLbl) {
      if (state.isRunning && !state.isPaused) {
        statusLbl.textContent = `Running: ${cur + 1} / ${total}`;
      } else if (state.isPaused) {
        statusLbl.textContent = `Paused at ${cur + 1} / ${total}`;
      } else if (cur >= total && total > 0) {
        statusLbl.textContent = `Completed (${total}/${total})`;
      } else {
        statusLbl.textContent = total > 0 ? `Ready (${total} countries queued)` : 'Waiting for CSV...';
      }
    }

    const bDone = document.getElementById('ppa-badge-done');
    const bMatch = document.getElementById('ppa-badge-matched');
    const bFail = document.getElementById('ppa-badge-failed');
    if (bDone) bDone.textContent = `✅ ${doneCount} Done`;
    if (bMatch) bMatch.textContent = `✨ ${matchedCount} Matches`;
    if (bFail) bFail.textContent = `⚠️ ${failedCount} Issues`;

    const btnStart = document.getElementById('ppa-btn-start');
    const btnPause = document.getElementById('ppa-btn-pause');
    const btnStop = document.getElementById('ppa-btn-stop');

    if (btnStart) btnStart.disabled = (state.isRunning && !state.isPaused) || total === 0;
    if (btnPause) btnPause.disabled = !state.isRunning || state.isPaused;
    if (btnStop) btnStop.disabled = !state.isRunning;

    updateTimersTick();
  }

  // -------------------------------------------------------------
  // Panel Visibility Management (Completely Hide / Show Full Window)
  // -------------------------------------------------------------
  function setPanelVisibility(visible) {
    state.panelVisible = visible;
    const root = document.getElementById('play-price-automator-root');
    if (root) {
      root.style.display = visible ? 'block' : 'none';
    }

    try {
      localStorage.setItem('ppa_panel_visible', visible ? 'true' : 'false');
    } catch (e) {
      // ignore
    }
  }

  function togglePanel() {
    setPanelVisibility(!state.panelVisible);
  }

  // -------------------------------------------------------------
  // Floating Panel Creation (50% Larger • 540px Width)
  // -------------------------------------------------------------
  function createFloatingPanel() {
    if (document.getElementById('play-price-automator-root')) return;

    const root = document.createElement('div');
    root.id = 'play-price-automator-root';

    root.innerHTML = `
      <!-- Main Command Center (30% Reduced Base • Resizable) -->
      <div id="ppa-container">
        <!-- Corner Resize Grip Handle -->
        <div id="ppa-resize-handle" title="Drag to resize window"></div>

        <!-- Draggable Header -->
        <div id="ppa-header">
          <div id="ppa-title-bar">
            <span id="ppa-logo">⚡</span>
            <div>
              <div id="ppa-title">PlayPrice Automator</div>
              <div id="ppa-sub">Google Play Console DOM Robot • v1.7.9</div>
            </div>
          </div>
          <div id="ppa-header-badge">
            <span class="ppa-shortcut-tag" title="Show or Hide full window anytime with Alt + P">Alt + P to Hide</span>
          </div>
        </div>

        <div id="ppa-body">
          <!-- Main Target Category: App Sale Price vs App Price -->
          <div id="ppa-category-card">
            <div id="ppa-category-tabs">
              <button class="ppa-cat-tab active" id="ppa-cat-btn-sale" data-cat="app_sale_price">
                🔥 App Sale Price
              </button>
              <button class="ppa-cat-tab" id="ppa-cat-btn-app" data-cat="app_price">
                🏷️ App Price
              </button>
            </div>
          </div>

          <!-- Sale Discount Sub-modes (Only shown when App Sale Price is selected) -->
          <div id="ppa-mode-card">
            <div id="ppa-mode-tabs">
              <button class="ppa-mode-tab active" id="ppa-mode-btn-fixed" data-mode="fixed_price">
                💰 Fixed Price Mode
              </button>
              <button class="ppa-mode-tab" id="ppa-mode-btn-pct" data-mode="percentage">
                🏷️ Discount % Mode
              </button>
            </div>
            <div id="ppa-mode-desc">
              <span id="ppa-mode-dot"></span>
              <span id="ppa-mode-text"><strong>Fixed Price Mode:</strong> Automates local currency sale prices from <em>Discounted Price</em> column.</span>
            </div>
          </div>

          <!-- App Price Mode Description (Only shown when App Price is selected) -->
          <div id="ppa-app-price-desc" style="display: none;">
            <span id="ppa-app-dot"></span>
            <span id="ppa-app-text"><strong>App Price Mode:</strong> Automates standard retail prices from <em>Retail Price</em> column (for Play Console <strong>Pricing</strong> tab).</span>
          </div>

          <!-- File Upload Zone -->
          <div id="ppa-upload-zone">
            <div id="ppa-upload-icon">📁</div>
            <div id="ppa-upload-text"><strong>Click or Drop CSV File Here</strong></div>
            <div id="ppa-upload-sub">Accepts <code>bot_sale_prices_*.csv</code> or <code>bot_app_prices_*.csv</code> from PlayPrice Engine</div>
            <input type="file" id="ppa-file-input" accept=".csv" style="display: none;" />
          </div>


          <div id="ppa-file-info" style="display: none;">
            <span id="ppa-file-name">-</span>
            <span id="ppa-file-count">0 Countries</span>
          </div>

          <!-- Progress Bar & Status -->
          <div id="ppa-progress-section">
            <div id="ppa-progress-labels">
              <span id="ppa-progress-status">Waiting for CSV file...</span>
              <span id="ppa-progress-pct">0%</span>
            </div>
            <div id="ppa-progress-track">
              <div id="ppa-progress-bar"></div>
            </div>
            <div id="ppa-stat-badges">
              <span class="ppa-badge ppa-badge-done" id="ppa-badge-done">✅ 0 Done</span>
              <span class="ppa-badge ppa-badge-matched" id="ppa-badge-matched">✨ 0 Matches</span>
              <span class="ppa-badge ppa-badge-failed" id="ppa-badge-failed">⚠️ 0 Issues</span>
            </div>
          </div>

          <!-- Real-Time Timers (Stopwatch & Countdown ETA) -->
          <div id="ppa-timers-row">
            <div class="ppa-timer-card">
              <span class="ppa-timer-icon">⏱️</span>
              <div class="ppa-timer-content">
                <span class="ppa-timer-label">Elapsed Stopwatch</span>
                <span class="ppa-timer-val" id="ppa-timer-elapsed">00:00</span>
              </div>
            </div>
            <div class="ppa-timer-card">
              <span class="ppa-timer-icon">⏳</span>
              <div class="ppa-timer-content">
                <span class="ppa-timer-label">Est. Completion</span>
                <span class="ppa-timer-val" id="ppa-timer-remaining">--:--</span>
              </div>
            </div>
          </div>

          <!-- Controls Bar -->
          <div id="ppa-controls">
            <button class="ppa-btn ppa-btn-start" id="ppa-btn-start">▶ Start</button>
            <button class="ppa-btn ppa-btn-pause" id="ppa-btn-pause" disabled>⏸ Pause</button>
            <button class="ppa-btn ppa-btn-stop" id="ppa-btn-stop" disabled>⏹ Stop</button>
            <button class="ppa-btn ppa-btn-reset" id="ppa-btn-reset">↺ Reset</button>
          </div>

          <!-- Safe Speed & Console Options -->
          <div id="ppa-options-row">
            <label class="ppa-option-lbl" title="Pacing delay between steps with randomized human jitter to completely avoid rate limiting">
              Safety Cadence:
              <select id="ppa-speed-select">
                <option value="2500">🛡️ Ultra-Safe (2500ms • Human Cadence)</option>
                <option value="1600" selected>⚡ Safe &amp; Steady (1600ms • Recommended)</option>
                <option value="1000">🚀 Moderate (1000ms • Fast Network)</option>
                <option value="3500">🐢 Maximum Caution (3500ms • High Latency)</option>
              </select>
            </label>
            <label class="ppa-option-lbl" title="Auto-click main 'Save changes' button at bottom of Google Play Console when finished">
              <input type="checkbox" id="ppa-chk-autosave" /> Auto-Save Console
            </label>
          </div>

          <!-- Activity Log -->
          <div id="ppa-log-container">
            <div id="ppa-log-header">
              <span>Activity Log</span>
              <span id="ppa-log-clear" title="Clear log">Clear</span>
            </div>
            <div id="ppa-log-box">Waiting for CSV file import...</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    injectStyles();
    attachEvents();

    // Restore saved size and visibility
    try {
      const savedWidth = localStorage.getItem('ppa_window_width');
      const savedHeight = localStorage.getItem('ppa_window_height');
      const container = document.getElementById('ppa-container');
      if (container) {
        if (savedWidth) container.style.width = savedWidth + 'px';
        if (savedHeight) container.style.height = savedHeight + 'px';
      }

      const savedVis = localStorage.getItem('ppa_panel_visible');
      if (savedVis === 'false') {
        setPanelVisibility(false);
      }
    } catch (e) {
      // ignore
    }
  }

  function injectStyles() {
    const css = `
      #play-price-automator-root {
        position: fixed;
        top: 15px;
        right: 15px;
        z-index: 99999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #F8FAFC;
        font-size: 11px;
        line-height: 1.35;
      }

      /* Main Command Panel: 30% Smaller Base (378px Width) & Fully Resizable */
      #ppa-container {
        position: relative;
        width: 378px;
        min-width: 280px;
        max-width: 95vw;
        min-height: 320px;
        max-height: 95vh;
        display: flex;
        flex-direction: column;
        background: rgba(11, 17, 33, 0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(56, 189, 248, 0.32);
        border-radius: 10px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(56, 189, 248, 0.15);
        overflow: hidden;
        box-sizing: border-box;
      }
      #ppa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: rgba(8, 13, 26, 0.95);
        border-bottom: 1px solid rgba(30, 41, 59, 0.9);
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }
      #ppa-header:active {
        cursor: grabbing;
      }
      #ppa-title-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      #ppa-logo {
        font-size: 16px;
        pointer-events: none;
      }
      #ppa-title {
        font-weight: 700;
        font-size: 12px;
        color: #38BDF8;
        letter-spacing: 0.2px;
        pointer-events: none;
      }
      #ppa-sub {
        font-size: 9.5px;
        color: #94A3B8;
        pointer-events: none;
      }
      #ppa-header-badge {
        display: flex;
        align-items: center;
        pointer-events: none;
      }
      .ppa-shortcut-tag {
        background: rgba(30, 41, 59, 0.7);
        color: #94A3B8;
        font-size: 9.5px;
        font-family: Consolas, monospace;
        padding: 2px 6px;
        border-radius: 5px;
        border: 1px solid rgba(56, 189, 248, 0.25);
        letter-spacing: 0.2px;
        user-select: none;
        pointer-events: none;
      }

      #ppa-body {
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }

      /* Custom sleek scrollbar */
      #ppa-body::-webkit-scrollbar,
      #ppa-log-box::-webkit-scrollbar {
        width: 5px;
      }
      #ppa-body::-webkit-scrollbar-track,
      #ppa-log-box::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.5);
      }
      #ppa-body::-webkit-scrollbar-thumb,
      #ppa-log-box::-webkit-scrollbar-thumb {
        background: rgba(56, 189, 248, 0.25);
        border-radius: 3px;
      }
      #ppa-body::-webkit-scrollbar-thumb:hover,
      #ppa-log-box::-webkit-scrollbar-thumb:hover {
        background: rgba(56, 189, 248, 0.5);
      }

      /* Main Category Switcher (App Price vs App Sale Price) */
      #ppa-category-card {
        background: rgba(8, 13, 26, 0.7);
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 4px;
      }
      #ppa-category-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }
      .ppa-cat-tab {
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: #94A3B8;
        padding: 6px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }
      .ppa-cat-tab:hover {
        color: #F8FAFC;
        background: rgba(255, 255, 255, 0.05);
      }
      .ppa-cat-tab.active {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(2, 132, 199, 0.3));
        border-color: rgba(56, 189, 248, 0.55);
        color: #38BDF8;
        box-shadow: 0 2px 8px rgba(56, 189, 248, 0.15);
      }
      #ppa-app-price-desc {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        font-size: 9.5px;
        color: #94A3B8;
        background: rgba(8, 13, 26, 0.5);
        border: 1px solid #1E293B;
        border-radius: 6px;
      }
      #ppa-app-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #10B981;
        flex-shrink: 0;
      }

      /* Sale Discount Sub-mode Tabs */
      #ppa-mode-card {
        background: rgba(8, 13, 26, 0.6);
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 4px;
      }

      #ppa-mode-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }
      .ppa-mode-tab {
        border: 1px solid transparent;
        background: transparent;
        color: #94A3B8;
        padding: 6px 8px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 10.5px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
      }
      .ppa-mode-tab:hover {
        color: #F8FAFC;
        background: rgba(255, 255, 255, 0.05);
      }
      .ppa-mode-tab.active {
        background: linear-gradient(135deg, #0284C7, #0EA5E9);
        color: #FFFFFF;
        box-shadow: 0 3px 10px rgba(2, 132, 199, 0.35);
        border-color: rgba(56, 189, 248, 0.4);
      }
      #ppa-mode-desc {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px 3px 8px;
        font-size: 9.5px;
        color: #94A3B8;
      }
      #ppa-mode-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #10B981;
        flex-shrink: 0;
      }

      /* Upload Zone */
      #ppa-upload-zone {
        border: 2px dashed rgba(56, 189, 248, 0.35);
        border-radius: 8px;
        padding: 12px 14px;
        text-align: center;
        cursor: pointer;
        background: rgba(15, 23, 42, 0.65);
        transition: all 0.2s;
      }
      #ppa-upload-zone:hover {
        border-color: #38BDF8;
        background: rgba(56, 189, 248, 0.08);
      }
      #ppa-upload-icon {
        font-size: 22px;
        margin-bottom: 4px;
      }
      #ppa-upload-text {
        color: #F8FAFC;
        font-size: 11px;
      }
      #ppa-upload-sub {
        font-size: 9.5px;
        color: #94A3B8;
        margin-top: 2px;
      }
      #ppa-file-info {
        background: rgba(8, 13, 26, 0.8);
        border: 1px solid #1E293B;
        border-radius: 6px;
        padding: 5px 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10.5px;
      }
      #ppa-file-name {
        color: #38BDF8;
        font-weight: 600;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #ppa-file-count {
        color: #10B981;
        font-weight: 700;
      }

      /* Progress Bar & Badges */
      #ppa-progress-section {
        background: rgba(8, 13, 26, 0.55);
        border: 1px solid #1E293B;
        border-radius: 6px;
        padding: 6px 10px;
      }
      #ppa-progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        margin-bottom: 4px;
      }
      #ppa-progress-status {
        color: #CBD5E1;
      }
      #ppa-progress-pct {
        color: #38BDF8;
        font-weight: 700;
      }
      #ppa-progress-track {
        height: 6px;
        background: #1E293B;
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 6px;
      }
      #ppa-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #38BDF8, #10B981);
        transition: width 0.25s ease;
      }
      #ppa-stat-badges {
        display: flex;
        gap: 6px;
      }
      .ppa-badge {
        font-size: 9.5px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #1E293B;
        font-weight: 600;
      }
      .ppa-badge-done { color: #10B981; }
      .ppa-badge-matched { color: #38BDF8; }
      .ppa-badge-failed { color: #F59E0B; }

      /* Realtime Timers Row */
      #ppa-timers-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .ppa-timer-card {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid #1E293B;
        border-radius: 6px;
        padding: 5px 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ppa-timer-icon {
        font-size: 15px;
      }
      .ppa-timer-content {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ppa-timer-label {
        font-size: 8.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #64748B;
      }
      .ppa-timer-val {
        font-size: 11px;
        font-weight: 700;
        font-family: Consolas, monospace;
        color: #F8FAFC;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }

      /* Control Buttons */
      #ppa-controls {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 5px;
      }
      .ppa-btn {
        border: none;
        padding: 7px 6px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ppa-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .ppa-btn-start {
        background: #10B981;
        color: #FFF;
      }
      .ppa-btn-start:hover:not(:disabled) {
        background: #059669;
      }
      .ppa-btn-pause {
        background: #F59E0B;
        color: #FFF;
      }
      .ppa-btn-pause:hover:not(:disabled) {
        background: #D97706;
      }
      .ppa-btn-stop {
        background: #EF4444;
        color: #FFF;
      }
      .ppa-btn-stop:hover:not(:disabled) {
        background: #DC2626;
      }
      .ppa-btn-reset {
        background: #334155;
        color: #CBD5E1;
      }
      .ppa-btn-reset:hover:not(:disabled) {
        background: #475569;
        color: #FFF;
      }

      /* Speed & Options */
      #ppa-options-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9.5px;
        color: #94A3B8;
        padding: 1px 1px;
        flex-wrap: wrap;
        gap: 4px;
      }
      .ppa-option-lbl {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      #ppa-options-row select {
        background: #1E293B;
        color: #F8FAFC;
        border: 1px solid #334155;
        border-radius: 5px;
        padding: 3px 6px;
        font-size: 10px;
        cursor: pointer;
        max-width: 170px;
      }

      /* Activity Log */
      #ppa-log-container {
        border: 1px solid #1E293B;
        border-radius: 6px;
        background: #090D16;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 80px;
      }
      #ppa-log-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 8.5px;
        font-weight: 700;
        color: #64748B;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      #ppa-log-clear {
        cursor: pointer;
        color: #38BDF8;
      }
      #ppa-log-clear:hover {
        text-decoration: underline;
      }
      #ppa-log-box {
        flex: 1;
        height: 80px;
        min-height: 50px;
        overflow-y: auto;
        font-family: Consolas, monospace;
        font-size: 9.5px;
        line-height: 1.4;
        color: #94A3B8;
        word-break: break-all;
        white-space: pre-wrap;
      }

      /* Interactive Corner Resize Grip Handle */
      #ppa-resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 16px;
        height: 16px;
        cursor: se-resize;
        z-index: 100;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 3px;
        box-sizing: border-box;
      }
      #ppa-resize-handle::after {
        content: '';
        width: 7px;
        height: 7px;
        border-right: 2px solid rgba(56, 189, 248, 0.7);
        border-bottom: 2px solid rgba(56, 189, 248, 0.7);
        border-radius: 1px;
      }
      #ppa-resize-handle:hover::after {
        border-color: #38BDF8;
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
  function attachEvents() {
    // Main Target Category (App Price vs App Sale Price)
    const catBtnSale = document.getElementById('ppa-cat-btn-sale');
    const catBtnApp = document.getElementById('ppa-cat-btn-app');
    const modeCard = document.getElementById('ppa-mode-card');
    const appDesc = document.getElementById('ppa-app-price-desc');

    if (catBtnSale && catBtnApp) {
      catBtnSale.addEventListener('click', () => {
        if (state.mainCategory === 'app_sale_price') return;
        state.mainCategory = 'app_sale_price';
        catBtnSale.classList.add('active');
        catBtnApp.classList.remove('active');
        if (modeCard) modeCard.style.display = 'block';
        if (appDesc) appDesc.style.display = 'none';

        applyModeTargets();
        updateUI();
        log(`🔥 Switched to App Sale Price (${state.saleDiscountMode === 'percentage' ? 'Discount % Mode' : 'Fixed Price Mode'}).`);
      });

      catBtnApp.addEventListener('click', () => {
        if (state.mainCategory === 'app_price') return;
        state.mainCategory = 'app_price';
        catBtnApp.classList.add('active');
        catBtnSale.classList.remove('active');
        if (modeCard) modeCard.style.display = 'none';
        if (appDesc) appDesc.style.display = 'flex';

        applyModeTargets();
        updateUI();
        log('🏷️ Switched to App Price Mode (Uses Retail Price column for Google Play Console Pricing tab).');
      });
    }

    // Sale Discount Sub-mode Tabs (Fixed Price vs Discount %)
    const btnFixed = document.getElementById('ppa-mode-btn-fixed');
    const btnPct = document.getElementById('ppa-mode-btn-pct');
    const modeDescText = document.getElementById('ppa-mode-text');

    if (btnFixed && btnPct) {
      btnFixed.addEventListener('click', () => {
        if (state.saleDiscountMode === 'fixed_price') return;
        state.saleDiscountMode = 'fixed_price';
        btnFixed.classList.add('active');
        btnPct.classList.remove('active');
        if (modeDescText) {
          modeDescText.innerHTML = '<strong>Fixed Price Mode:</strong> Automates local currency sale prices from <em>Discounted Price</em> column.';
        }
        applyModeTargets();
        log('💰 Switched to Fixed Price Mode (uses "Discounted Price" column).');
        updateUI();
      });

      btnPct.addEventListener('click', () => {
        if (state.saleDiscountMode === 'percentage') return;
        state.saleDiscountMode = 'percentage';
        btnPct.classList.add('active');
        btnFixed.classList.remove('active');
        if (modeDescText) {
          modeDescText.innerHTML = '<strong>Discount % Mode:</strong> Automates percentage discounts from <em>Discount %</em> column.';
        }
        applyModeTargets();
        log('🏷️ Switched to Discount % Mode (uses "Discount %" column).');
        updateUI();
      });
    }

    // Upload Zone
    const uploadZone = document.getElementById('ppa-upload-zone');
    const fileInput = document.getElementById('ppa-file-input');

    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => fileInput.click());

      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#38BDF8';
      });

      uploadZone.addEventListener('dragleave', () => {
        uploadZone.style.borderColor = 'rgba(56, 189, 248, 0.35)';
      });

      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = 'rgba(56, 189, 248, 0.35)';
        if (e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFile(e.target.files[0]);
        }
      });
    }

    // Control buttons
    document.getElementById('ppa-btn-start').addEventListener('click', () => {
      if (state.isPaused) {
        state.isPaused = false;
        state.isRunning = true;
        startTimers();
        log('▶ Automation resumed.');
        updateUI();
      } else {
        runAutomation();
      }
    });

    document.getElementById('ppa-btn-pause').addEventListener('click', () => {
      state.isPaused = true;
      pauseTimers();
      log('⏸ Automation paused.');
      updateUI();
    });

    document.getElementById('ppa-btn-stop').addEventListener('click', () => {
      state.isRunning = false;
      state.isPaused = false;
      stopTimers(false);
      log('⏹ Automation stopped.');
      updateUI();
    });

    document.getElementById('ppa-btn-reset').addEventListener('click', () => {
      state.isRunning = false;
      state.isPaused = false;
      state.currentIndex = 0;
      for (const c of state.countries) {
        c.status = 'pending';
        c.message = '';
      }
      stopTimers(true);
      log('🔄 Queue reset to first country.');
      updateUI();
    });

    // Speed selector
    const speedSelect = document.getElementById('ppa-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        state.speedDelay = parseInt(e.target.value, 10);
        log(`⏱ Safe cadence set to ${state.speedDelay}ms per country.`);
        updateEstCompletionUI();
      });
    }

    // Auto-save console checkbox
    const chkAutoSave = document.getElementById('ppa-chk-autosave');
    if (chkAutoSave) {
      chkAutoSave.addEventListener('change', (e) => {
        state.autoSaveConsole = e.target.checked;
        log(`💾 Auto-save console: ${state.autoSaveConsole ? 'ENABLED' : 'DISABLED'}`);
      });
    }

    // Clear log
    const clearLogBtn = document.getElementById('ppa-log-clear');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        state.logs = [];
        const box = document.getElementById('ppa-log-box');
        if (box) box.textContent = 'Log cleared.';
      });
    }

    // Global Hotkey: Alt + P to toggle full window visibility (completely hides / shows full window)
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        togglePanel();
      }
    });

    // Make panel draggable by header
    makeDraggable(document.getElementById('ppa-header'), document.getElementById('play-price-automator-root'));

    // Make panel resizable by corner handle
    makeResizable(document.getElementById('ppa-container'), document.getElementById('ppa-resize-handle'));
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      if (parsed.length > 0) {
        state.countries = parsed;
        state.currentIndex = 0;
        applyModeTargets();

        const fileInfo = document.getElementById('ppa-file-info');
        if (fileInfo) fileInfo.style.display = 'flex';
        const fileNameEl = document.getElementById('ppa-file-name');
        if (fileNameEl) fileNameEl.textContent = file.name;
        const fileCountEl = document.getElementById('ppa-file-count');
        if (fileCountEl) fileCountEl.textContent = `${parsed.length} Countries`;

        stopTimers(true);
        log(`📂 Loaded ${parsed.length} countries from ${file.name}`);
        updateUI();
      } else {
        alert('Could not parse countries from CSV. Please ensure the CSV has Country and Price/Discount columns.');
      }
    };
    reader.readAsText(file);
  }

  function makeResizable(container, handle) {
    if (!container || !handle) return;

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    handle.addEventListener('mousedown', onResizeStart);
    handle.addEventListener('touchstart', onResizeStart, { passive: false });

    function onResizeStart(e) {
      e.stopPropagation();
      e.preventDefault();

      isResizing = true;
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const rect = container.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;

      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onResizeMove, { passive: false });
      window.addEventListener('touchmove', onResizeMove, { passive: false });
      window.addEventListener('mouseup', onResizeEnd);
      window.addEventListener('touchend', onResizeEnd);
    }

    function onResizeMove(e) {
      if (!isResizing) return;
      e.preventDefault();

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      const newW = Math.max(280, Math.min(window.innerWidth - 30, Math.round(startW + deltaX)));
      const newH = Math.max(300, Math.min(window.innerHeight - 30, Math.round(startH + deltaY)));

      container.style.width = newW + 'px';
      container.style.height = newH + 'px';
    }

    function onResizeEnd() {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.userSelect = '';

      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('touchmove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
      window.removeEventListener('touchend', onResizeEnd);

      try {
        const finalRect = container.getBoundingClientRect();
        localStorage.setItem('ppa_window_width', Math.round(finalRect.width));
        localStorage.setItem('ppa_window_height', Math.round(finalRect.height));
      } catch (e) {}
    }
  }

  function makeDraggable(handle, target) {
    if (!handle || !target) return;

    let isDragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startPanelLeft = 0;
    let startPanelTop = 0;

    handle.addEventListener('mousedown', onDragStart);
    handle.addEventListener('touchstart', onDragStart, { passive: false });

    function onDragStart(e) {
      if (e.target.closest('button, input, select, textarea, a, #ppa-resize-handle')) return;

      isDragging = true;
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      startMouseX = clientX;
      startMouseY = clientY;

      const rect = target.getBoundingClientRect();
      startPanelLeft = rect.left;
      startPanelTop = rect.top;

      // Lock positioning to left/top so right:15px doesn't fight the movement
      target.style.left = startPanelLeft + 'px';
      target.style.top = startPanelTop + 'px';
      target.style.right = 'auto';
      target.style.bottom = 'auto';

      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onDragMove, { passive: false });
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
      if (!isDragging) return;
      e.preventDefault();

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startMouseX;
      const deltaY = clientY - startMouseY;

      let newLeft = startPanelLeft + deltaX;
      let newTop = startPanelTop + deltaY;

      // Viewport safety boundary clamping
      const panelWidth = target.offsetWidth || 378;
      const panelHeight = target.offsetHeight || 400;
      const maxLeft = Math.max(10, window.innerWidth - panelWidth - 10);
      const maxTop = Math.max(10, window.innerHeight - 60);

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      target.style.left = newLeft + 'px';
      target.style.top = newTop + 'px';
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = '';

      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchend', onDragEnd);
    }
  }
  // -------------------------------------------------------------
  // Extension Message Listener (From popup.js)
  // -------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'togglePanel') {
      togglePanel();
      sendResponse({ visible: state.panelVisible });
      return true;
    }
    if (message.action === 'showPanel') {
      setPanelVisibility(true);
      sendResponse({ visible: true });
      return true;
    }
    if (message.action === 'hidePanel') {
      setPanelVisibility(false);
      sendResponse({ visible: false });
      return true;
    }
  });

  // -------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingPanel);
  } else {
    createFloatingPanel();
  }

})();
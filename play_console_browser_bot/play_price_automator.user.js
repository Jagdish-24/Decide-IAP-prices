// ==UserScript==
// @name         Google Play Console Sale Price Automator (PlayPrice Engine)
// @namespace    https://github.com/Jagdish-24/Decide-IAP-prices
// @version      1.6.1
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

  console.log('[PlayPrice Automator] Initializing in-browser console automator v1.6.1...');

  // State Management
  const state = {
    countries: [],        // [{ name, code, salePrice, retailPrice, discountPct, targetValue, priceFormatted, currency, displayUnit, status }]
    currentIndex: 0,
    isRunning: false,
    isPaused: false,
    speedDelay: 1600,     // Default: Safe & Steady (1600ms) to avoid rate limits
    mode: 'fixed_price',  // 'fixed_price' or 'percentage'
    autoSaveConsole: false,
    panelVisible: true,
    panelCollapsed: false,
    logs: [],
    // Realtime Timers
    timerStartTime: null,
    totalPausedMs: 0,
    pauseStartTime: null,
    timerIntervalId: null
  };

  // -------------------------------------------------------------
  // CSV Parser
  // -------------------------------------------------------------
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    
    // Detect column indexes
    let nameIdx = header.findIndex(h => h.includes('country') || h.includes('region') || h.includes('name'));
    let codeIdx = header.findIndex(h => h.includes('code') || h.includes('iso') || h.includes('alpha'));
    
    let salePriceIdx = header.findIndex(h => h.includes('discounted price') || h.includes('sale price') || h.includes('promo price'));
    if (salePriceIdx === -1) salePriceIdx = header.findIndex(h => h.includes('sale') || h.includes('discounted'));
    
    let discountPctIdx = header.findIndex(h => h.includes('discount %') || h.includes('discount diff') || h.includes('discount difference') || h.includes('discount rate'));
    let retailPriceIdx = header.findIndex(h => h.includes('retail') || h.includes('base') || h.includes('end user') || h.includes('price'));
    let currIdx = header.findIndex(h => h.includes('currency') || h.includes('curr'));

    if (nameIdx === -1) nameIdx = 0;
    const targetPriceIdx = (salePriceIdx !== -1) ? salePriceIdx : (retailPriceIdx !== -1 ? retailPriceIdx : 1);

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

      const rawSalePrice = (row[targetPriceIdx] || '').replace(/^["']|["']$/g, '').trim();
      const rawRetailPrice = (retailPriceIdx !== -1 ? row[retailPriceIdx] : '').replace(/^["']|["']$/g, '').trim();
      const rawDiscountPct = (discountPctIdx !== -1 ? row[discountPctIdx] : '').replace(/^["']|["']$/g, '').trim();

      if (!name) continue;

      // Extract float numbers
      const saleMatch = rawSalePrice.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const salePrice = saleMatch ? parseFloat(saleMatch[0]) : null;

      const retailMatch = rawRetailPrice.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const retailPrice = retailMatch ? parseFloat(retailMatch[0]) : null;

      const pctMatch = rawDiscountPct.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
      const discountPct = pctMatch ? Math.abs(parseFloat(pctMatch[0])) : null;

      const baseSale = salePrice !== null ? salePrice : (retailPrice !== null ? retailPrice : 0);
      const baseRetail = retailPrice !== null ? retailPrice : baseSale;
      const basePct = discountPct !== null ? discountPct : (baseRetail > 0 ? Math.round(((baseRetail - baseSale) / baseRetail) * 100) : 0);

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

  // Update target values according to the currently active Mode (Fixed Price vs Percentage)
  function applyModeTargets() {
    for (const c of state.countries) {
      if (state.mode === 'percentage') {
        const val = c.discountPct !== null ? c.discountPct : 0;
        c.targetValue = val;
        c.priceFormatted = Number.isInteger(val) ? `${val}` : val.toFixed(2);
        c.displayUnit = '%';
      } else {
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
    // Proportional natural human jitter (Â±15% to 25%) ensuring EVERY cadence profile
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
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));
    await humanMicroPause(90, 200);

    let pencil = row.querySelector('button[aria-label*="Edit" i]') ||
                 row.querySelector('button[title*="Edit" i]') ||
                 row.querySelector('button[aria-label*="price" i]') ||
                 row.querySelector('button[aria-label*="discount" i]') ||
                 row.querySelector('material-icon[icon*="edit"]') ||
                 row.querySelector('.material-icons, [data-icon="edit"], svg');

    if (!pencil) {
      const btns = Array.from(row.querySelectorAll('button, [role="button"]'));
      pencil = btns.find(b => {
        const al = (b.getAttribute('aria-label') || '').toLowerCase();
        return al.includes('edit') || al.includes('price') || al.includes('discount') || b.querySelector('svg, i, material-icon');
      }) || btns[0];
    }

    if (pencil) {
      pencil.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      pencil.click();
      return true;
    }
    return false;
  }

  async function waitForEditPricePopup(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!state.isRunning) return null;

      const dialog = document.querySelector('[role="dialog"], dialog, material-dialog, .modal-dialog');
      if (dialog) {
        const input = dialog.querySelector('input');
        if (input) return { dialog, input };
      }
      await sleep(120);
    }
    return null;
  }

  // -------------------------------------------------------------
  // Realtime Timer Controllers
  // -------------------------------------------------------------
  function startTimers() {
    if (!state.timerStartTime) {
      state.timerStartTime = Date.now();
      state.totalPausedMs = 0;
      state.pauseStartTime = null;
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
      const elElapsed = document.getElementById('ppa-timer-elapsed');
      const elRemain = document.getElementById('ppa-timer-remaining');
      if (elElapsed) elElapsed.textContent = '00:00';
      if (elRemain) elRemain.textContent = '--:--';
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
      elRemain.textContent = `Completed ðŸŽ‰`;
      return;
    }

    if (completed >= 2) {
      const avgMsPerCountry = elapsedMs / completed;
      const remainingMs = remaining * avgMsPerCountry;
      const etaDate = new Date(now + remainingMs);
      const etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      elRemain.textContent = `${formatDuration(remainingMs)} (ETA: ${etaStr})`;
    } else {
      // Projected baseline using safe speed delay + average modal transaction overhead (1,500ms)
      const estimatedMs = remaining * (state.speedDelay + 1500);
      elRemain.textContent = `~${formatDuration(estimatedMs)}`;
    }
  }

  // -------------------------------------------------------------
  // Core Automation Loop
  // -------------------------------------------------------------
  async function runAutomation() {
    if (state.countries.length === 0) {
      log('âš ï¸ Please load a bot_sale_prices CSV file first!');
      return;
    }

    state.isRunning = true;
    state.isPaused = false;
    startTimers();
    updateUI();

    const modeLabel = state.mode === 'percentage' ? 'ðŸ·ï¸ Discount % Mode' : 'ðŸ’° Fixed Price Mode';
    log(`ðŸš€ Starting automation in ${modeLabel} for ${state.countries.length} countries (Speed: ${state.speedDelay}ms)...`);

    const searchBox = findSearchBox();
    if (!searchBox) {
      log('âŒ Could not locate Google Play Console search bar! Are you on the "Availability and pricing" / "Edit sale" page?');
      state.isRunning = false;
      stopTimers();
      updateUI();
      return;
    }

    let processedSinceLastCooldown = 0;

    for (let idx = state.currentIndex; idx < state.countries.length; idx++) {
      if (!state.isRunning) {
        log('ðŸ›‘ Automation stopped by user.');
        break;
      }

      while (state.isPaused && state.isRunning) {
        await sleep(200);
      }
      if (!state.isRunning) break;

      // Anti-Bot Rate-Limiting Protection: Breathing rest cooldown every 25 processed items with natural jitter
      if (processedSinceLastCooldown > 0 && processedSinceLastCooldown % 25 === 0 && idx < state.countries.length - 1) {
        const breakDuration = randomBetween(2800, 3600);
        log(`ðŸ›¡ï¸ Rate-Limit Safeguard: Taking a natural ${(breakDuration / 1000).toFixed(1)}s rest break... (${processedSinceLastCooldown} countries processed)`);
        await sleep(breakDuration);
      }

      state.currentIndex = idx;
      const c = state.countries[idx];
      c.status = 'active';
      updateUI();

      const unitText = state.mode === 'percentage' ? '%' : ` ${c.currency}`;
      log(`ðŸ“ [${idx + 1}/${state.countries.length}] ${c.name} â€¢ Target ${state.mode === 'percentage' ? 'Discount' : 'Price'}: ${c.priceFormatted}${unitText}`);

      try {
        // Step 1: Focus and double-click to select all text in search bar & paste country name
        searchBox.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        searchBox.focus();
        await humanMicroPause(70, 160); // Random pause before selecting search input
        searchBox.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        if (typeof searchBox.select === 'function') searchBox.select();
        await humanMicroPause(50, 130); // Random keystroke pause
        setNativeValue(searchBox, c.name);

        // Safe Humanized Delay with Cadence Jitter
        await sleep(getHumanizedDelay(state.speedDelay));

        // Step 2: Wait for filtered row
        const row = await waitForFilteredRow(c.name, 4500);
        if (!row) {
          log(`âš ï¸ Row not found for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Row not found';
          updateUI();
          continue;
        }
        await humanMicroPause(100, 240); // Random visual confirmation pause

        // Step 3: Open Edit Price / Discount modal
        const opened = await openRowEditModal(row);
        if (!opened) {
          log(`âš ï¸ Could not click edit button for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Edit button not found';
          updateUI();
          continue;
        }

        await sleep(getHumanizedDelay(state.speedDelay));

        // Step 4: Handle Edit Modal Input
        const modalObj = await waitForEditPricePopup(4000);
        if (!modalObj) {
          log(`âš ï¸ Edit popup did not open for ${c.name}, skipping...`);
          c.status = 'failed';
          c.message = 'Modal did not open';
          updateUI();
          continue;
        }

        const { dialog, input } = modalObj;
        await humanMicroPause(150, 320); // Random inspection pause

        // Check current existing value in input
        const existingVal = input.value.trim();
        const numMatch = existingVal.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
        const existingNum = numMatch ? parseFloat(numMatch[0]) : null;

        if (existingNum !== null && Math.abs(existingNum - c.targetValue) < 0.001) {
          // Already matches target value!
          log(`âœ¨ [${c.name}] Value already matches target (${existingNum} == ${c.priceFormatted}${unitText}). Cleanly dismissing modal...`);
          c.status = 'matched';
          c.message = 'Already matches';

          await humanMicroPause(140, 280); // Random human hesitation pause before closing
          const cancelBtn = dialog.querySelector('button[aria-label*="Cancel" i]') ||
                            Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('cancel'));
          if (cancelBtn) {
            cancelBtn.click();
          } else {
            dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          }
          await humanMicroPause(90, 190);
        } else {
          // Mismatch or empty: set new target value
          log(`ðŸ”„ [${c.name}] Setting '${existingVal || 'empty'}' -> '${c.priceFormatted}${unitText}'...`);
          setNativeValue(input, c.priceFormatted);
          await humanMicroPause(280, 520); // Random human verification pause before clicking Save

          // Find Save button in dialog
          const saveBtn = dialog.querySelector('button[aria-label*="Save" i]') ||
                          dialog.querySelector('button[aria-label*="Apply" i]') ||
                          Array.from(dialog.querySelectorAll('button')).find(b => {
                            const t = b.textContent.toLowerCase();
                            return (t.includes('save') || t.includes('apply')) && !b.disabled;
                          });

          if (saveBtn) {
            saveBtn.click();
            c.status = 'done';
            c.message = `Saved: ${c.priceFormatted}${unitText}`;
            log(`âœ… [${c.name}] Saved: ${c.priceFormatted}${unitText}`);
            await humanMicroPause(110, 220); // Random settling pause
          } else {
            log(`âš ï¸ [${c.name}] Save button disabled or not found.`);
            c.status = 'failed';
            c.message = 'Save disabled';
          }
        }

        processedSinceLastCooldown++;
        await sleep(getHumanizedDelay(state.speedDelay));


      } catch (err) {
        log(`âŒ Error processing ${c.name}: ${err.message}`);
        c.status = 'failed';
        c.message = err.message;
      }

      updateUI();
    }

    if (state.isRunning && state.currentIndex >= state.countries.length - 1) {
      log('ðŸ† All countries completed successfully!');
      if (state.autoSaveConsole) {
        await saveConsoleChanges();
      }
    }

    state.isRunning = false;
    stopTimers(false);
    updateUI();
  }

  async function saveConsoleChanges() {
    log('ðŸ’¾ Looking for bottom "Save changes" bar in Google Play Console...');
    await humanMicroPause(700, 1100);
    const saveAllBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const txt = b.textContent.trim().toLowerCase();
      return txt === 'save changes' || (txt === 'save' && b.closest('.bottom-bar, footer, [role="region"]'));
    });

    if (saveAllBtn && !saveAllBtn.disabled) {
      saveAllBtn.scrollIntoView({ block: 'nearest' });
      await humanMicroPause(180, 340);
      saveAllBtn.click();
      log('ðŸŽ‰ Clicked main "Save changes" in Google Play Console!');
    } else {
      log('â„¹ï¸ Main "Save changes" button not found or already saved.');
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
    if (bDone) bDone.textContent = `âœ… ${doneCount} Done`;
    if (bMatch) bMatch.textContent = `âœ¨ ${matchedCount} Matches`;
    if (bFail) bFail.textContent = `âš ï¸ ${failedCount} Issues`;

    const btnStart = document.getElementById('ppa-btn-start');
    const btnPause = document.getElementById('ppa-btn-pause');
    const btnStop = document.getElementById('ppa-btn-stop');

    if (btnStart) btnStart.disabled = (state.isRunning && !state.isPaused) || total === 0;
    if (btnPause) btnPause.disabled = !state.isRunning || state.isPaused;
    if (btnStop) btnStop.disabled = !state.isRunning;

    updateTimersTick();
  }

  // -------------------------------------------------------------
  // Panel Visibility Management (Show / Hide + Launcher Pill)
  // -------------------------------------------------------------
  function setPanelVisibility(visible) {
    state.panelVisible = visible;
    const container = document.getElementById('ppa-container');
    const pill = document.getElementById('ppa-launcher-pill');

    if (container && pill) {
      if (visible) {
        container.style.display = 'block';
        pill.style.display = 'none';
      } else {
        container.style.display = 'none';
        pill.style.display = 'flex';
      }
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
  // Floating Panel Creation (50% Larger â€¢ 540px Width)
  // -------------------------------------------------------------
  function createFloatingPanel() {
    if (document.getElementById('play-price-automator-root')) return;

    const root = document.createElement('div');
    root.id = 'play-price-automator-root';

    root.innerHTML = `
      <!-- Launcher Pill (Appears when panel is closed/minimized) -->
      <div id="ppa-launcher-pill" title="Click to open PlayPrice Automator (Alt + P)">
        <span class="ppa-pill-icon">âš¡</span>
        <span>PlayPrice Automator</span>
      </div>

      <!-- Main Command Center (540px Wide) -->
      <div id="ppa-container">
        <!-- Draggable Header -->
        <div id="ppa-header">
          <div id="ppa-title-bar">
            <span id="ppa-logo">âš¡</span>
            <div>
              <div id="ppa-title">PlayPrice Automator</div>
              <div id="ppa-sub">Google Play Console DOM Robot â€¢ v1.6.1</div>
            </div>
          </div>
          <div id="ppa-header-actions">
            <button id="ppa-btn-collapse" title="Collapse / Expand panel">_</button>
            <button id="ppa-btn-close" title="Hide panel (Restores to floating pill â€¢ Alt+P)">âœ•</button>
          </div>
        </div>

        <div id="ppa-body">
          <!-- Automation Mode Switcher -->
          <div id="ppa-mode-card">
            <div id="ppa-mode-tabs">
              <button class="ppa-mode-tab active" id="ppa-mode-btn-fixed" data-mode="fixed_price">
                ðŸ’° Fixed Price Mode
              </button>
              <button class="ppa-mode-tab" id="ppa-mode-btn-pct" data-mode="percentage">
                ðŸ·ï¸ Discount % Mode
              </button>
            </div>
            <div id="ppa-mode-desc">
              <span id="ppa-mode-dot"></span>
              <span id="ppa-mode-text"><strong>Fixed Price Mode:</strong> Automates local currency prices from <em>Discounted Price</em> column.</span>
            </div>
          </div>

          <!-- File Upload Zone -->
          <div id="ppa-upload-zone">
            <div id="ppa-upload-icon">ðŸ“</div>
            <div id="ppa-upload-text"><strong>Click or Drop CSV File Here</strong></div>
            <div id="ppa-upload-sub">Accepts <code>bot_sale_prices_*.csv</code> from PlayPrice Engine</div>
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
              <span class="ppa-badge ppa-badge-done" id="ppa-badge-done">âœ… 0 Done</span>
              <span class="ppa-badge ppa-badge-matched" id="ppa-badge-matched">âœ¨ 0 Matches</span>
              <span class="ppa-badge ppa-badge-failed" id="ppa-badge-failed">âš ï¸ 0 Issues</span>
            </div>
          </div>

          <!-- Real-Time Timers (Stopwatch & Countdown ETA) -->
          <div id="ppa-timers-row">
            <div class="ppa-timer-card">
              <span class="ppa-timer-icon">â±ï¸</span>
              <div class="ppa-timer-content">
                <span class="ppa-timer-label">Elapsed Stopwatch</span>
                <span class="ppa-timer-val" id="ppa-timer-elapsed">00:00</span>
              </div>
            </div>
            <div class="ppa-timer-card">
              <span class="ppa-timer-icon">â³</span>
              <div class="ppa-timer-content">
                <span class="ppa-timer-label">Est. Completion</span>
                <span class="ppa-timer-val" id="ppa-timer-remaining">--:--</span>
              </div>
            </div>
          </div>

          <!-- Controls Bar -->
          <div id="ppa-controls">
            <button class="ppa-btn ppa-btn-start" id="ppa-btn-start">â–¶ Start</button>
            <button class="ppa-btn ppa-btn-pause" id="ppa-btn-pause" disabled>â¸ Pause</button>
            <button class="ppa-btn ppa-btn-stop" id="ppa-btn-stop" disabled>â¹ Stop</button>
            <button class="ppa-btn ppa-btn-reset" id="ppa-btn-reset">â†º Reset</button>
          </div>

          <!-- Safe Speed & Console Options -->
          <div id="ppa-options-row">
            <label class="ppa-option-lbl" title="Pacing delay between steps with randomized human jitter to completely avoid rate limiting">
              Safety Cadence:
              <select id="ppa-speed-select">
                <option value="2500">ðŸ›¡ï¸ Ultra-Safe (2500ms â€¢ Human Cadence)</option>
                <option value="1600" selected>âš¡ Safe &amp; Steady (1600ms â€¢ Recommended)</option>
                <option value="1000">ðŸš€ Moderate (1000ms â€¢ Fast Network)</option>
                <option value="3500">ðŸ¢ Maximum Caution (3500ms â€¢ High Latency)</option>
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

    // Check saved visibility state
    try {
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
        top: 20px;
        right: 20px;
        z-index: 99999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #F8FAFC;
        font-size: 13px;
        line-height: 1.4;
      }

      /* Floating Launcher Pill */
      #ppa-launcher-pill {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 9px 18px;
        background: linear-gradient(135deg, #0F172A, #1E293B);
        border: 1px solid rgba(56, 189, 248, 0.45);
        border-radius: 30px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.25);
        cursor: pointer;
        color: #38BDF8;
        font-weight: 700;
        font-size: 13px;
        transition: all 0.2s ease;
        user-select: none;
      }
      #ppa-launcher-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.7), 0 0 22px rgba(56, 189, 248, 0.4);
        border-color: #38BDF8;
      }
      .ppa-pill-icon {
        font-size: 16px;
      }

      /* Main Command Panel: 540px Width */
      #ppa-container {
        width: 540px;
        background: rgba(11, 17, 33, 0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(56, 189, 248, 0.32);
        border-radius: 14px;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.65), 0 0 24px rgba(56, 189, 248, 0.15);
        overflow: hidden;
        transition: box-shadow 0.2s ease;
      }
      #ppa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: rgba(8, 13, 26, 0.95);
        border-bottom: 1px solid rgba(30, 41, 59, 0.9);
        cursor: grab;
        user-select: none;
      }
      #ppa-header:active {
        cursor: grabbing;
      }
      #ppa-title-bar {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      #ppa-logo {
        font-size: 20px;
      }
      #ppa-title {
        font-weight: 700;
        font-size: 14px;
        color: #38BDF8;
        letter-spacing: 0.3px;
      }
      #ppa-sub {
        font-size: 11px;
        color: #94A3B8;
      }
      #ppa-header-actions button {
        background: transparent;
        border: none;
        color: #94A3B8;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        transition: background 0.15s, color 0.15s;
      }
      #ppa-header-actions button:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #FFF;
      }

      #ppa-body {
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Mode Switcher Tabs */
      #ppa-mode-card {
        background: rgba(8, 13, 26, 0.6);
        border: 1px solid #1E293B;
        border-radius: 10px;
        padding: 6px;
      }
      #ppa-mode-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .ppa-mode-tab {
        border: 1px solid transparent;
        background: transparent;
        color: #94A3B8;
        padding: 9px 12px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 12px;
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
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
        border-color: rgba(56, 189, 248, 0.4);
      }
      #ppa-mode-desc {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px 4px 10px;
        font-size: 11px;
        color: #94A3B8;
      }
      #ppa-mode-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10B981;
      }

      /* Upload Zone */
      #ppa-upload-zone {
        border: 2px dashed rgba(56, 189, 248, 0.35);
        border-radius: 10px;
        padding: 20px;
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
        font-size: 30px;
        margin-bottom: 6px;
      }
      #ppa-upload-text {
        color: #F8FAFC;
        font-size: 13px;
      }
      #ppa-upload-sub {
        font-size: 11px;
        color: #94A3B8;
        margin-top: 3px;
      }
      #ppa-file-info {
        background: rgba(8, 13, 26, 0.8);
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      #ppa-file-name {
        color: #38BDF8;
        font-weight: 600;
        max-width: 340px;
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
        border-radius: 8px;
        padding: 10px 14px;
      }
      #ppa-progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-bottom: 6px;
      }
      #ppa-progress-status {
        color: #CBD5E1;
      }
      #ppa-progress-pct {
        color: #38BDF8;
        font-weight: 700;
      }
      #ppa-progress-track {
        height: 8px;
        background: #1E293B;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      #ppa-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #38BDF8, #10B981);
        transition: width 0.25s ease;
      }
      #ppa-stat-badges {
        display: flex;
        gap: 8px;
      }
      .ppa-badge {
        font-size: 11px;
        padding: 3px 8px;
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
        gap: 10px;
      }
      .ppa-timer-card {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ppa-timer-icon {
        font-size: 20px;
      }
      .ppa-timer-content {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ppa-timer-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: #64748B;
      }
      .ppa-timer-val {
        font-size: 13px;
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
        gap: 8px;
      }
      .ppa-btn {
        border: none;
        padding: 10px 8px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 13px;
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
        font-size: 11px;
        color: #94A3B8;
        padding: 2px 2px;
      }
      .ppa-option-lbl {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #ppa-options-row select {
        background: #1E293B;
        color: #F8FAFC;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
      }

      /* Activity Log */
      #ppa-log-container {
        border: 1px solid #1E293B;
        border-radius: 8px;
        background: #090D16;
        padding: 8px 10px;
      }
      #ppa-log-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        font-weight: 700;
        color: #64748B;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      #ppa-log-clear {
        cursor: pointer;
        color: #38BDF8;
      }
      #ppa-log-clear:hover {
        text-decoration: underline;
      }
      #ppa-log-box {
        height: 120px;
        overflow-y: auto;
        font-family: Consolas, monospace;
        font-size: 11px;
        line-height: 1.45;
        color: #94A3B8;
        word-break: break-all;
        white-space: pre-wrap;
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function attachEvents() {
    // Mode Switcher Buttons
    const btnFixed = document.getElementById('ppa-mode-btn-fixed');
    const btnPct = document.getElementById('ppa-mode-btn-pct');
    const modeDescText = document.getElementById('ppa-mode-text');

    if (btnFixed && btnPct) {
      btnFixed.addEventListener('click', () => {
        if (state.mode === 'fixed_price') return;
        state.mode = 'fixed_price';
        btnFixed.classList.add('active');
        btnPct.classList.remove('active');
        if (modeDescText) {
          modeDescText.innerHTML = '<strong>Fixed Price Mode:</strong> Automates local currency prices from <em>Discounted Price</em> column.';
        }
        applyModeTargets();
        log('ðŸ’° Switched to Fixed Price Mode (uses "Discounted Price" column).');
        updateUI();
      });

      btnPct.addEventListener('click', () => {
        if (state.mode === 'percentage') return;
        state.mode = 'percentage';
        btnPct.classList.add('active');
        btnFixed.classList.remove('active');
        if (modeDescText) {
          modeDescText.innerHTML = '<strong>Discount % Mode:</strong> Automates percentage discounts from <em>Discount %</em> column.';
        }
        applyModeTargets();
        log('ðŸ·ï¸ Switched to Discount % Mode (uses "Discount %" column).');
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
        log('â–¶ Automation resumed.');
        updateUI();
      } else {
        runAutomation();
      }
    });

    document.getElementById('ppa-btn-pause').addEventListener('click', () => {
      state.isPaused = true;
      pauseTimers();
      log('â¸ Automation paused.');
      updateUI();
    });

    document.getElementById('ppa-btn-stop').addEventListener('click', () => {
      state.isRunning = false;
      state.isPaused = false;
      stopTimers(false);
      log('â¹ Automation stopped.');
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
      log('ðŸ”„ Queue reset to first country.');
      updateUI();
    });

    // Speed selector
    const speedSelect = document.getElementById('ppa-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        state.speedDelay = parseInt(e.target.value, 10);
        log(`â± Safe cadence set to ${state.speedDelay}ms per country.`);
      });
    }

    // Auto-save console checkbox
    const chkAutoSave = document.getElementById('ppa-chk-autosave');
    if (chkAutoSave) {
      chkAutoSave.addEventListener('change', (e) => {
        state.autoSaveConsole = e.target.checked;
        log(`ðŸ’¾ Auto-save console: ${state.autoSaveConsole ? 'ENABLED' : 'DISABLED'}`);
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

    // Collapse button
    const collapseBtn = document.getElementById('ppa-btn-collapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        state.panelCollapsed = !state.panelCollapsed;
        const body = document.getElementById('ppa-body');
        if (body) body.style.display = state.panelCollapsed ? 'none' : 'flex';
        collapseBtn.textContent = state.panelCollapsed ? 'â–¡' : '_';
      });
    }

    // Close button (Hides panel and reveals launcher pill)
    const closeBtn = document.getElementById('ppa-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        setPanelVisibility(false);
        log('ðŸ™ˆ Automator panel hidden. Click the floating âš¡ pill or press Alt+P to reopen.');
      });
    }

    // Launcher pill (Click to restore full panel)
    const launcherPill = document.getElementById('ppa-launcher-pill');
    if (launcherPill) {
      launcherPill.addEventListener('click', () => {
        setPanelVisibility(true);
      });
    }

    // Global Hotkey: Alt + P to toggle panel visibility
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        togglePanel();
      }
    });

    // Make panel draggable by header
    makeDraggable(document.getElementById('ppa-header'), document.getElementById('ppa-container'));
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
        log(`ðŸ“‚ Loaded ${parsed.length} countries from ${file.name}`);
        updateUI();
      } else {
        alert('Could not parse countries from CSV. Please ensure the CSV has Country and Price/Discount columns.');
      }
    };
    reader.readAsText(file);
  }

  function makeDraggable(handle, target) {
    if (!handle || !target) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      target.style.top = (target.offsetTop - pos2) + "px";
      target.style.left = (target.offsetLeft - pos1) + "px";
      target.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
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

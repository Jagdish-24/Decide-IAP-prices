# PlayPrice Automator for Google Play Console (In-Browser DOM Robot)

> **Zero Mouse Hijacking • 100% DOM-Native Precision • Universal Screen Compatibility**

The **PlayPrice In-Browser Automator** is a lightweight, zero-dependency in-browser robot designed specifically for Google Play Console's *Edit sale* and *Availability and pricing* pages. It reads your exported `bot_sale_prices_*.csv` file directly and automates price setting for all 176 countries in ~60 seconds via native web DOM events.

---

## 🚀 Choose Your Preferred Installation Method

### Method 1: 1-Click Bookmarklet (Easiest — No Extension Needed)
1. Double click and open [`play_console_browser_bot/install_guide.html`](install_guide.html) in Google Chrome.
2. Drag the glowing **⚡ PlayPrice Automator** button directly onto your Chrome **Bookmarks Bar** (press `Ctrl + Shift + B` if your bookmarks bar is hidden).
3. Open any Google Play Console **Edit sale** page.
4. Click the bookmark! The floating robot panel will instantly appear in the top-right corner.

---

### Method 2: Standalone Chrome Extension
1. Open `chrome://extensions` in Google Chrome.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** (top-left).
4. Select the [`play_console_browser_bot/chrome_extension`](chrome_extension) folder.
5. Done! The robot will automatically activate whenever you visit Google Play Console.

---

### Method 3: Tampermonkey / Violentmonkey Userscript
1. If you use Tampermonkey or Violentmonkey, install [`play_price_automator.user.js`](play_price_automator.user.js).
2. It will automatically inject on `https://play.google.com/console/*`.

---

## 📖 Step-by-Step Usage Instructions

1. **Export from PlayPrice Engine:**
   - In the PlayPrice Engine web app, click **`Bot CSV (Sale Prices)`** (or `Bot CSV (App Prices)`).
   - This exports a CSV containing all 176 countries with their formatted target prices.

2. **Open Google Play Console:**
   - Navigate to your app in Google Play Console.
   - Go to **Grow** -> **Store presence** -> **Pricing & sales** (or your active sale page).
   - Click **Edit sale** to view the country pricing table.

3. **Launch or Show the Robot:**
   - Click the extension icon, use the **`⚡ Show / Hide Automator Panel`** button, or press **`Alt + P`** anywhere on the Play Console page.
   - When hidden, the window is completely removed from view (zero clutter). When shown, the full command center appears instantly.

4. **Select Mode & Load CSV:**
   - Choose your target pricing category:
     - **`🏷️ App Price`**: Automates base retail app pricing (Google Play Console **Pricing** tab) using the `Retail Price` column from CSV.
     - **`🔥 App Sale Price`**: Automates promotional sales (Google Play Console **Edit sale** page). Selecting this reveals the two discount sub-modes:
       - **`💰 Fixed Price Mode`**: Uses the `Discounted price` column.
       - **`🏷️ Discount % Mode`**: Uses the `Discount %` column.
   - Drag and drop your downloaded `bot_sale_prices_*.csv` or `bot_app_prices_*.csv` file into the panel.
   - You will see: `176 Countries Loaded`.
   - Click **`▶ Start`**!

5. **Dual Multi-Step Robot Workflows:**
   - **When in `🏷️ App Price` Mode (Pricing Tab):**
     1. Automatically clicks **"Set pricing"** to enter checkbox selection mode.
     2. Queries the country name in the **"Search by country or region"** bar.
     3. Selects the row checkbox for that specific filtered country.
     4. Clicks the bottom action bar's blue **"Continue"** button.
     5. Waits for the **"Set price for selected countries and regions"** modal to appear.
     6. Verifies current price & currency; if already identical, cleanly dismisses the modal.
     7. Inputs the new retail price and selects the matching 3-letter ISO currency (e.g. `USD`, `EUR`, `ARS`, `DZD`) in the currency selector.
     8. Clicks the blue **"Update"** button and waits for the table to refresh.
     9. Clears the search bar and unchecks row checkboxes before advancing to the next country with randomized human jitter delays.
   - **When in `🔥 App Sale Price` Mode (Edit Sale Page):**
     1. Filters the country in the search bar.
     2. Opens the country row's edit modal (pencil button / cell).
     3. Compares and sets the discounted price or discount percentage.
     4. Clicks **"Save"** in the modal.
   - **Mouse Free:** In both workflows, your mouse remains completely free to browse or use other applications.

6. **Save Changes:**
   - When finished, review the summary.
   - If **Auto-Save Console** is checked, the robot automatically clicks Google Play Console's bottom **Save changes** bar.

---

## 🛡️ Key Features & Edge-Case Protection

- **Two-Tier Mode Hierarchy:** Seamlessly switch between **App Price** (base retail pricing on the *Pricing* tab) and **App Sale Price** (promotional sales with sub-modes for *Fixed Price* and *Discount %* on the *Sales* tab).

- **Dual Real-time Timers:** Active stopwatch tracking execution duration and adaptive estimated time remaining with projected clock completion time (`ETA: HH:MM`).
- **Safe Cadence & Anti-Bot Shield:**
  - *Safe & Steady (1600ms) [Default]:* Ideal human-like pacing for reliable processing.
  - *Ultra-Safe (2500ms):* Maximum protection against rate-limits on sensitive accounts.
  - *Moderate (1000ms):* Balanced speed for tested setups.
  - *Maximum Caution (3500ms):* Slow and steady for turbulent network environments.
  - *Natural Jitter & Task Micro-Pauses Across ALL Options:* Every speed option automatically applies proportional natural human jitter (±15% to 25%) plus randomized human micro-delays between every sub-task (typing search, finding rows, opening popups, inspecting prices, entering numbers, and saving), alongside a natural ~3s breathing rest break every 25 rows to look authentically human.
- **Clean Zero-Clutter Show/Hide:** Toggle the full automator window with **`Alt + P`** or the extension popup button. When hidden, it leaves your Play Console view 100% clean and unobstructed with zero floating pills or icons.
- **Native Event Dispatching:** Dispatches `input`, `change`, and `Enter` keyboard events directly to Google's Angular/Material input elements.
- **Smart Duplicate Protection:** Checks existing values first; skips already-configured countries to save time and prevent unnecessary network calls.
- **Pause & Resume:** Easily pause, resume, or stop execution at any time.



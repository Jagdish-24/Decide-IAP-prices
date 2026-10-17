# PlayPrice Engine • Global IAP & App Pricing Optimizer

A data-driven, strategic pricing and revenue optimization engine for mobile game and app developers publishing to the **Google Play Store**.

Built to solve the regional pricing disparity dilemma (e.g. why a **€1.00 / $1.50** app feels cheap in Western markets but becomes an expensive barrier at **₹110+ in India** or **1,700 ARS in Argentina**), this tool computes mathematically precise prices across **176+ Google Play countries and regions** based on:
1. **Purchasing Power Parity (PPP)** elasticity and consumer willingness-to-pay.
2. **Economic Country Tiers** (Tier 1, Tier 2, Tier 3).
3. **Local VAT / GST Tax Rates** (inclusive vs. checkout tax models).
4. **Google Play Store Commission** (15% Tier 1 / <$1M annual revenue vs. 30% standard).
5. **Developer Buffer** (0.0% to 5.0% for Indian Sec 194O 0.1% TDS, credit card processing & forex spreads).
6. **Psychological Charm Pricing** (.99, .49, and Indian mobile gaming ladder: ₹29, ₹49, ₹89, ₹99, etc.).

---

## 🚀 Key Features

- **Base Currency Switching:** Toggle between **USD ($)**, **EUR (€)**, and **INR (₹)** as your anchor currency.
- **App Price Input:** Set your paid app base download price (or set to `0.00` for Free-to-Play games).
- **Catalogue Builder:** Manage customizable IAP SKU tiers with defaults:
  - *No Ads* ($1.50)
  - *Starter Pack* ($1.50)
  - *Gold 1* ($1.50)
  - *Gold 2* ($2.99)
  - *Gold 3* ($4.99)
  - *Gold 4* ($9.99)
  - *Gold 5* ($19.99)
  - *Gold 6* ($49.99)
- **4 Expandable & Collapsible Sections:**
  - 🌐 **Master List:** Full roster of 176 Google Play countries and territories.
  - 💎 **Tier 1:** 37 High-Income / High-ARPU markets (USA, UK, Germany, Japan, South Korea, Canada, Australia, Switzerland, etc.).
  - 🚀 **Tier 2:** 46 Mid-Income & High-Growth emerging digital markets (Brazil, Mexico, Poland, Czechia, Turkey, Malaysia, Chile, South Africa, etc.).
  - ⚡ **Tier 3:** 93 High-Volume / Price-Sensitive markets (India, Indonesia, Philippines, Pakistan, Nigeria, Egypt, Vietnam, etc.).
- **Live Currency Exchange Rates:** Automatically fetches from `open.er-api.com` with a built-in offline fallback cache covering all 65 local currencies.
- **Detailed Country Strategy Modal:** Click any country to see:
  - Full per-unit Revenue Waterfall (Gross Retail → Minus VAT → Net Base → Minus Google Play Cut → Minus Buffer → Developer Take-Home in local & base currency).
  - Consumer persona, player mindset, price resistance threshold, and preferred local payment channels (UPI, Pix, Cards, Carrier Billing).
- **Exporting Capabilities:**
  - **Export CSV:** Comprehensive CSV download containing all calculations across all catalogue items and countries.
  - **Copy Play Store Format:** Formatted for direct reference/import into the Google Play Console.

---

## 📐 Mathematical Formulation

### 1. Purchasing Power Parity (PPP) Target
```text
Target USD = Base Price (USD) × [ 1.0 + (Country PPP Ratio - 1.0) × PPP Strength ]
Raw Local Price = Target USD × Local FX Rate
```

### 2. VAT / Tax Cut
For tax-inclusive countries (European Union, United Kingdom, Australia, Japan, etc.):
```text
Tax Cut = Retail Price × [ VAT% / (100 + VAT%) ]
Net Revenue Base = Retail Price - Tax Cut
```
For tax-exclusive countries (United States, Canada):
```text
Tax Cut = 0 (Sales tax collected at checkout)
Net Revenue Base = Retail Price
```

### 3. Store Commission & Developer Take-Home
```text
Google Play Cut = Net Revenue Base × (15% or 30%)
Buffer Cut = Net Revenue Base × Buffer% (0% to 5%)
Developer Net Proceeds = Net Revenue Base - Google Play Cut - Buffer Cut
```

---

## 💻 Running Locally

This project is built with vanilla HTML5, CSS3, and modern JavaScript with **zero build step or npm dependency**.

1. **Via Live Server (VS Code / Antigravity IDE):**
   - Serve the root directory on port `5500`:
   - URL: `http://127.0.0.1:5500/`

2. **Via Python local HTTP server:**
   ```bash
   python -m http.server 5500
   ```
   Open `http://127.0.0.1:5500/` in your browser.

---

## 🌐 Deploying to GitHub Pages

1. Push your changes to the `main` branch on GitHub:
   ```bash
   git add .
   git commit -m "feat: complete PlayPrice Engine website"
   git push origin main
   ```
2. In your GitHub repository:
   - Navigate to **Settings** → **Pages**.
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select Branch: `main` / Folder: `/ (root)`.
   - Click **Save**.
3. Your website will be live at `https://<your-username>.github.io/<repo-name>/`.
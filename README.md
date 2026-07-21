# 💎 FinorAsset

A modern, high-performance **Personal Financial & Asset Management Web App** built with React, TanStack Start/Router, Vite, Tailwind CSS, and Supabase.

![FinorAsset App Banner](https://raw.githubusercontent.com/mahmudulmashrafe/FinorAsset/main/public/favicon.ico)

---

## ✨ Features

### 🏦 Account & Transaction Management
* **Multi-Account Tracking**: Manage Cash, Bank accounts, Cards, and Digital Wallets.
* **Transaction Types**: Income, Expense, and Transfer transactions.
* **Category Breakdown**: Custom icons, colors, and category budgeting.

### 🗓️ Event Grouping & Macro Automations
* **Event Transaction Groups**: Group related transactions (e.g., travel expenses, shopping trips) under a single Event.
* **1-Second Long-Press Manage Mode**: Press & hold any record in an event to enter manage mode to reorder records (Up/Down), degroup records, or shift records between events.
* **Macro Automations**: Trigger multi-step recurring transaction macros with a single click. First macro step appears at the bottom and last step at the top of the event.

### 📜 Warranties & Receipts
* **Warranty Tracker**: Track active, expiring, and expired asset warranties.
* **Receipt Preview Lightbox**: Upload and preview attachment receipts directly in the app.
* **Mobile-Friendly Popup Cards**: Tap summary cards on mobile devices to view lists instantly.

### 🤝 Loans & Debt Management
* **Loan & Debt Tracker**: Track money owed to or borrowed from contacts.
* **Automatic Transaction Sync**: Creating or updating loan payments automatically updates linked transactions.

### 🔔 PWA & Web Push Notifications
* **Progressive Web App (PWA)**: Installable on iOS (Safari "Add to Home Screen") and Android devices.
* **Push Notifications**: Receive background push notifications for bill reminders and budget alerts via Service Worker (`/sw.js`).

---

## 🛠️ Tech Stack

* **Frontend**: React 18, TanStack Router / TanStack Start, Vite, Tailwind CSS, Lucide Icons, Sonner Toasts
* **Backend & Database**: Supabase (PostgreSQL, Row Level Security, Auth, Realtime, Storage)
* **Deployment**: Vercel / Nitro

---

## ⚙️ Environment Variables

To run FinorAsset, create a `.env` file in the root directory and set the following variables:

```env
# Client-side (Exposed to browser bundle)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# Server-side (SSR / Node.js)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# Admin / Service Role Key (Required for server-side admin ops)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 🔍 How to Check Environment Variables in Vercel

To verify if your Supabase URL and Key are saved in Vercel:

1. **Via Vercel Dashboard**:
   * Go to [Vercel Dashboard](https://vercel.com/dashboard)
   * Select your **FinorAsset** project
   * Click **Settings** → **Environment Variables**
   * Check if `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`) are present for **Production**, **Preview**, and **Development** environments.

2. **Via Vercel CLI**:
   ```bash
   npx vercel env ls
   ```

---

## 🚀 Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mahmudulmashrafe/FinorAsset.git
   cd FinorAsset
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start dev server**:
   ```bash
   npm run dev
   ```

4. **Build for Production**:
   ```bash
   NITRO_PRESET=vercel npm run build
   ```

---

## 📄 License

MIT © [Mahmudul Mashrafe](https://github.com/mahmudulmashrafe)

# Walkthrough - Vercel & Git Setup

We cleaned up all Lovable dependencies, standardized the build configuration for TanStack Start and Nitro, pushed the codebase to GitHub, launched the project live on Vercel, and optimized the layout for desktop and mobile devices.

## Changes Made

1. **Lovable Clean-up**:
   - Uninstalled `@lovable.dev/vite-tanstack-config` and purged all transitive dependencies (HMR gate plugins, dev-server bridge plugins, and component taggers).
   - Deleted the Lovable guidelines file (`AGENTS.md`).

2. **Standardized Vite & Nitro Configurations**:
   - Updated `vite.config.ts` to use standard, native plugins: `@vitejs/plugin-react`, `@tanstack/react-start/plugin/vite`, `vite-tsconfig-paths`, `@tailwindcss/vite`, and `nitro/vite`.
   - Enabled Nitro build generation targeting Vercel (`preset: 'vercel'`).

3. **Git Integration**:
   - Added `.vercel/` to `.gitignore` to prevent tracking build cache.
   - Initialized Git locally, set up the default branch as `main`, and committed the codebase.
   - Generated an SSH key, verified connection with GitHub, and pushed the codebase to [mahmudulmashrafe/FinorAsset](https://github.com/mahmudulmashrafe/FinorAsset).
   - Amended the initial commit message to `"Initial commit"`.

4. **Vercel Deployments**:
   - Authorized Vercel CLI locally.
   - Linked the project to Vercel and connected it to your GitHub repository.
   - Added all necessary environment variables to the Vercel dashboard.
   - Triggered production builds using `npx vercel deploy --prod --yes`.

5. **Logo Sizing Adjustments**:
   - Scaled down the top header logo in the authenticated pages (`route.tsx`) from `text-4xl md:text-5xl` to `text-xl md:text-2xl`.
   - Scaled down the logo in the landing and login headers (`index.tsx` & `auth.tsx`) to `text-2xl md:text-3xl` for a cleaner, more professional balance.

6. **Sidebar Sizing and Styling**:
   - Shrunk the desktop sidebar width in `sidebar.tsx` from `20rem` to `15rem` (240px) to maximize the main work area.
   - Reduced sidebar menu button heights from `h-14` to `h-11`, shrunk font sizes from `text-xl md:text-2xl` to `text-sm md:text-base`, and scaled down icons from `h-7 w-7` to `h-5 w-5` to create a compact, sleek aesthetic.
   - Shrunk the profile menu avatar and font sizes at the bottom of the sidebar.

7. **Mobile Bottom Navigation & Profile Avatar**:
   - Completely removed the hamburger menu / sidebar trigger on mobile.
   - Added a sleek, glassmorphic bottom navigation menu (`MobileBottomNav`) visible only on mobile screens (`md:hidden`) with links to Dashboard, Transactions, Accounts, Budgets, and Stats.
   - Placed the user profile avatar dropdown in the top header on mobile (`HeaderProfileMenu`) next to the Add button, giving easy access to Categories, Settings, Profile, and Sign Out.
   - Added responsive bottom padding `pb-20` on mobile viewports so scrolling elements clear the bottom nav correctly.

8. **Compact Header (Top Bar)**:
   - Shrunk the top bar height from `h-28` (112px) to `h-20` (80px).
   - Reduced the greeting font size from `text-2xl md:text-3xl` to `text-lg md:text-xl font-black`.
   - Reduced the date font size from `text-sm md:text-base` to `text-[10px] md:text-xs`.

9. **Prevented Page Transitions Layout Shift**:
   - Added `scrollbar-gutter: stable;` to the `html` element inside `styles.css`. This ensures that navigating between pages with varying content heights does not shift the top bar header or other aligned items horizontally.
   - Forced the vertical scrollbar track to remain visible at all times (`overflow-y: scroll`) inside `styles.css` to prevent layout jumping when content heights shrink during account or month filtering.

10. **Mobile Greeting Placement**:
    - Positioned the personalized greeting message on the left of the `+` (Add Transaction) icon inside the top header on mobile.

11. **Overview Header Subtitle Removal**:
    - Removed the "Summary" subtitle above "Overview" inside the Dashboard header, simplifying it to only show the "Overview" title.

12. **Removed Page Subtitles and Main Headings**:
    - Cleaned up the top heading areas on Dashboard, Transactions, Accounts, Budgets, and Stats pages to make them look clean and modern. Subtitles and large headings are removed (the shared header top-bar handles page identity dynamically).

13. **Removed Duplicate Transactions Dialog Trigger**:
    - Removed the duplicate "New Transaction" action button from the Transactions page body, leaving only the primary shared header "Add Transaction" button.

14. **Transactions Table Viewport (8 Rows on Desktop, 6 Rows on Mobile)**:
    - Adjusted the table scrollbar wrapper container to use standard Tailwind sizing `max-h-[295px] md:max-h-[465px]`. This displays exactly 6 rows on mobile before showing a scrollbar, and 8 rows on desktop.
    - Set table element minimum width to `min-w-[650px] md:min-w-full`. This forces the table to scroll horizontally inside its `overflow-x-auto` wrapper instead of squeezing columns, guaranteeing Note and Amount data columns are never clipped on narrow mobile viewports.
    - Compacted table cell paddings (`py-1.5 px-2 md:py-3 md:px-4`) and font sizes on mobile, making edit/delete actions permanently visible on touch displays.

15. **Floating Action Buttons (FABs) for Accounts & Budgets**:
    - Relocated both the Add Account and Add Budget buttons as floating action buttons (FABs) fixed in the bottom-right corner (`fixed bottom-20 md:bottom-12 right-6 z-40`). Raised the desktop FAB position from `bottom-6` to `bottom-12` so they float elegantly above any page borders.
    - Sized down both FAB buttons responsively on mobile screens (`h-10 w-10` with a `h-5 w-5` icon) and expanded them on desktop (`md:h-14 md:w-14` with a `h-6 w-6` icon).
    - Removed the secondary duplicate floating action button from the Transactions page to rely solely on the main header add action button.

16. **Pop-up Filters & Month Selection (Transactions & Stats)**:
    - Added a month filtering option dropdown generating options for the last 12 months.
    - Implemented a responsive filter layout: on desktop, the filters display inline inside a card; on mobile, they collapse into a single "Filters" button with an active indicator badge that triggers a clean modal pop-up containing all filter dropdowns and inputs.
    - Added Account and Month filters to the Stats page as an inline header row on desktop and a pop-up filter trigger Dialog on mobile.
    - Resolved a z-index overlay bug where Radix select dropdown portals were rendered behind the mobile Dialog pop-up. Applied `className="z-[100]"` to all dropdown containers (`SelectContent`) inside Dialog components.

17. **Reduced Account Block Sizing**:
    - Compacted account cards inside the Accounts page grid: reduced card padding from `p-6` to `p-4`, shrunk the balance value from `text-3xl mt-6` to `text-xl mt-3.5`, and sized down type badges and labels accordingly to improve scannability.

18. **Compact Stats Insights Layout**:
    - Reduced spacing and heights across the Stats page to fit the viewport more efficiently.
    - Shrunk charts container heights from `h-60` (240px) to `h-40` (160px).
    - Reduced card padding to `p-3`, list spacing to `py-1`, and grid spacing to `gap-3`.
    - Compacted desktop inline stats filters to render side-by-side with labels and Select triggers at height `h-8`.

19. **Top Bar Header Mobilization Layout**:
    - Restored the FinorAsset logo on mobile by adjusting the expanded state check (`state === 'expanded' && !isMobile`) in the TopBarLogo component.
    - Kept a single-line top bar layout (`h-20` on all viewports) and positioned the personalized greeting and short date in the center of the bar next to the logo and action items. Removed the horizontal separator border line on mobile viewports.

## 14. Secure Account Deletion with Password Verification
- **Problem**: Users lacked the ability to permanently delete their accounts and wipe all transaction data from the platform.
- **Solution**:
  - **Supabase RPC Migration**: Created `20260714142000_add_delete_current_user.sql` which implements a database-level `SECURITY DEFINER` function `delete_current_user()` to securely delete the calling user's row in `auth.users` (which cascadingly wipes all profiles, accounts, loans, and transactions).
  - **Password Verification**: Integrated verification checks in both the Profile page and the Profile settings popup. Before the RPC is executed, the user is prompted to verify their password using `supabase.auth.signInWithPassword`.
  - **Danger Zone Layout**: Styled a red highlighted "Danger Zone" block at the bottom of the profile settings layouts containing the action button.

20. **Dashboard List Margin & Padding Enhancements**:
    - Added right padding (`pr-3`) to the scrollable lists inside the Accounts and Recent Transactions dashboard widgets. This keeps the vertical scrollbar separated from the balance and transaction amount text values.

21. **Email & Password Settings Panel updates**:
    - Added change email functionality (`supabase.auth.updateUser`) and change password options verifying old password before applying updates inside settings dialog.
    - Configured a read-only "Current Email Address" input field in settings email panel and refactored stats overview cards with text wrapping CSS class parameters (`break-all` and `select-all`) to guarantee long email strings are fully legible on all displays.

22. **Page Swapping Transitions & Centered Viewport Loader**:
    - Implemented a smooth GPU-accelerated page fade-in and slide-up transition animation on all page routes.
    - Positioned the loading overlay fixed at the absolute viewport root, ensuring it is always perfectly centered and never shifts on mobile or desktop during data fetching.

23. **One-Click Transaction Macros (Automation Page)**:
    - Created an **Automation** page enabling users to save templates for common/recurring transactions (macros).
    - Added an interactive trigger engine that logs transactions directly to Supabase with one click and dynamically syncs account balances and charts.
    - Registered the page in the main layout route menu tree to show in both the desktop sidebar and mobile bottom navigation bar.
  - **Danger Zone Layout**: Styled a red highlighted "Danger Zone" block at the bottom of the profile settings layouts containing the action button.

---

## 15. Catching Database Deletion Exceptions (RPC Diagnosis)
- **Problem**: When `delete_current_user()` failed inside Postgres (due to any database-level restriction or foreign key check), the generic RPC failure was swallowed, showing only a vague "deletion failed" message.
- **Solution**:
  - Overwrote the migration function in `20260714142000_add_delete_current_user.sql` to return `text` rather than `void`.
  - Wrapped the `DELETE FROM auth.users` call in a PL/pgSQL `EXCEPTION` block, capturing the exact Postgres error using `SQLERRM` and returning it back to the client.
  - The front-end now toasts the specific database error description on failure, providing immediate clarity.

---

## 16. Glassmorphic Transparent Dialog Backdrops
- **Problem**: Opening Dialogs or Alert Dialogs dimmed the page background to a heavy, near-solid pitch black overlay (`bg-black/80`), which felt jarring and disconnected.
- **Solution**:
  - Modified both `DialogOverlay` and `AlertDialogOverlay` component styles in the UI library.
  - Replaced the heavy `bg-black/80` overlay style with a sleek glassmorphic combination: a light tint (`bg-black/10`) coupled with a soft backdrop blur (`backdrop-blur-sm`).
  - This keeps the page background completely visible and elegantly blurred when modals open.

---

## 17. Updated Post-Deletion Redirect Location
- **Problem**: After deleting an account, the app redirected users to the `/login` route, which is not the correct auth endpoint.
- **Solution**: Updated both the Profile page and Profile settings popup handlers to redirect users to `/auth` after a successful account deletion.

---

## 18. Removed Subscriptions & Notifications
- **Problem**: The project owner requested to completely remove the Subscriptions tracking and the Notification Bell system.
- **Solution**:
  - **Layout Header**: Removed the `<NotificationBell>` component and its imports from both desktop and mobile header layouts inside `route.tsx`.
  - **Notification State & Logic**: Cleared out the `notifications` state, `useQuery` query loaders for subscription lists, and `useEffect` notification calculation hooks from the root authenticated layout.
  - **Auto-Deductions**: Removed the background auto-deduction effects that automatically generated billing entries for overdue subscriptions.
  - **Automation Creator Tabs**: Replaced the multi-tab layout (Macros vs. Subscriptions) on the **Automation Creator** page with a pure macros listing, and deleted all subscription form variables, dialog states, and mutation logic. *(Note: Restored in subsequent updates).*

---

## 19. Restored Subscriptions & Notifications
- **Problem**: The project owner requested to bring back both Subscriptions (with multi-account auto-deductions and pre-flight balance checking) and Notifications.
- **Solution**: Restored the code setup for both subsystems, rendering them exactly as requested under the Automation page tab selectors.

---

## 20. Fixed Mobile Loan Cards Overflow
- **Problem**: On narrow mobile viewports, the horizontal layout of loan records (name + status badge + dates + amount + three action buttons) overflowed past the right edge of the screen, clipping content.
- **Solution**:
  - **Inline Action Buttons**: Hid check/edit/delete buttons on mobile screen widths (`hidden md:flex`) to save space.
  - **Loan Details Dialog Action**: Added a red **Delete** button directly inside the Loan Details Dialog, so mobile users can manage all actions (mark paid, edit, delete) inside the popup.
  - **Responsive Layout Constraint**: Added `w-full min-w-0 overflow-hidden` and name text boundary limits to force cards to fit beautifully inside mobile screens.


---

## 19. Removed Automation Page Header Section
- **Problem**: The project owner requested to completely remove the top header section on the Automation page containing the "Creator" title and the "New Macro" button.
- **Solution**: Removed the top header layout container entirely from `automation.tsx`, creating an ultra-minimal list view for macro triggers.
---

## 21. Fixed TypeScript Compiler Reference & Type Warnings
- **Problem**: The restored codebase contained several TypeScript issues (missing `toast` imports, untyped custom database JSON arrays for splits, and undefined checks for `authUser`) which caused the application to crash or throw errors on load.
- **Solution**:
  - Imported `toast` inside `route.tsx`.
  - Added explicit type casting (`as any[]`) to the subscriptions database `splits` JSON field.
  - Cast `accounts` parameter inside `AccountSplitsSelectorProps` in `loans.tsx` from `Account` to `any[]` to match database structures.
  - Safely cast `supabase.rpc` call context to `any` for the custom secure RPC endpoint.
  - Verified compilation completes successfully and generates clean build outputs.

---

## 22. Persistent Database-Backed Notifications
- **Problem**: Notifications were previously calculated dynamically in client-side state. The user wanted a persistent database table (`notifications`) to track read states, show 0 on mark all read, but still display the last 5 records when clicking the bell.
- **Solution**:
  - **Database Schema**: Created `20260714204500_create_notifications.sql` adding `public.notifications` table with `read` boolean, `user_id`, type, and a composite `unique_user_notification_identifier` deduplication constraint.
  - **Dynamic Generation**: Set up a background `useEffect` in `route.tsx` that inspects subscriptions/loans, creates pending alerts, and pushes them to Supabase on-load.
  - **Badge & Bell UI**: Modified `<NotificationBell>` to display only the count of unread (`read: false`) notifications, added a "Mark all as read" button to trigger a database update, and configured the list to display the last 5 notifications.

---

## 23. Fixed Global Page Layout Shifting
- **Problem**: When a button was clicked to open a dialog modal, select input, or dropdown menu, the scrollbar lock mechanism in Radix UI recalculated and injected a padding-right adjustment onto the body. Because the viewport scrollbar gutter was already styled as stable, this caused the entire page layout to shift ~15px to the side.
- **Solution**: Added a global CSS rule in `styles.css` targeting `html[data-scroll-locked]`. When Radix UI locks the body, it overrides `--removed-body-scroll-bar-size` to `0px !important`, completely neutralizing layout shifts and keeping all content, buttons, and headers stationary.


---

## 24. Cleaned Automation Page Header
- **Problem**: The large text headers "Automation" and "Creator" occupied too much screen real estate and looked bulky.
- **Solution**: Removed the headers container entirely from `automation.tsx`. Repositioned the "+ New Macro" and "+ New Subscription" trigger buttons directly onto the right side of the **Tabs Selector row** (`flex justify-between`), making the interface compact and intuitive.

## 25. Fixed Modal Dialog Height Clipping on Mobile View
- **Problem**: In the Loan tab, when the "New Loan" or "Repay Loan" modal opened on small mobile screens, the form height exceeded the viewport. Since the dialog had no max-height or scroll properties, the header (title & cross button) and the footer (Cancel & Save buttons) were pushed outside the viewport and rendered unreachable.
- **Solution**: Updated `DialogContent` wrappers in `loans.tsx` to include `max-h-[90vh] overflow-y-auto thin-scroll` styles. This limits the overlay's maximum height on mobile screen viewports and wraps long forms in a clean, touch-friendly scroll layout, ensuring all headers, cross buttons, and Cancel/Save buttons are fully visible and clickable.


---

## 26. Optimizations for Mobile and Layout Limits
- **Dashboard Grid (2x2)**: Configured the dashboard KPI cards wrapper to use `grid-cols-2 lg:grid-cols-4`, displaying exactly 4 statistic blocks in 2 rows on mobile viewports. Reduced font sizes (`text-[9px]` for labels and `text-base` for numerical values) and icon sizes (`h-3.5 w-3.5`) on mobile widths to fit beautifully in the split 2-column configuration.
- **Loans Summary Stack & Click-to-View Popups (Mobile)**: Configured the loan summary statistics grid to stack as 1 column (3 rows) on mobile screens, ordering them: Net Position (1st), Borrowed (2nd), and Lent (3rd). Configured the Borrowed and Lent summary cards to act as click triggers in mobile view (showing a clean visual "Click to view" indicator); clicking them launches a full scrollable dialog list of the respective loan cards, hiding static inline lists on mobile viewports. Capped the inner list containers of these popups at `max-h-[360px]` to display exactly **5 records** before scrollbars activate.
- **Loans List Scroll Limit (4 Items)**: Capped the max-height of the active borrowed and lent list containers at `max-h-[290px]` globally. This enforces a limit of exactly 4 visible cards on both mobile viewports and desktop web view before vertical scrollbars initiate.
- **Automation Dynamic Bottom-Right FAB**: Removed the tab-level add buttons entirely. Programmed the existing bottom-right Floating Action Button (FAB) to check the active tab dynamically: clicking it launches **Add New Macro** if viewing the *Macros* tab, or **Add New Subscription** (resetting form fields) if viewing the *Subscriptions* tab.
- **Static Headers and Footers with Scrollable Forms (All Forms)**: Refactored all input dialogs/forms across the app (New/Edit Transaction, Account Creator, Macro Creator, Subscription Creator, Loan Creator, Repay Loan, Category Dialog, and Budget Dialogs) to use a responsive flex column layout (`max-h-[90vh] sm:max-h-[600px] flex flex-col p-0 overflow-hidden`). This layout lets the dialog wrap its input content closely when there is small content (eliminating gaps), while still scrolling correctly when the content is tall. It guarantees headers and footers remain completely locked in view while the form fields container (`overflow-y-auto`) scrolls vertically.
- **Fixed Transaction Form Toggle Buttons**: Moved the *Expense / Income / Transfer* toggle button group in the Transaction Creator Dialog (`transaction-dialog.tsx`) out of the middle scrollable area and placed it inside a static sub-header block right below the main header. The category transaction kind select remains static at the top and never scrolls out of view.
- **Optimized Page Heights and Spacings (Gap Removal)**:
  - Adjusted the main content wrapper's padding-bottom on mobile viewports in `route.tsx` from `pb-32` (128px gap) to `pb-20` (80px gap). This ensures the last item on every single page (Dashboard, Accounts, Transactions, Budgets, Categories, Loans, Automation, Stats, Profile) ends just a little above the floating mobile tab bar.
  - Adjusted the desktop height constraint of the transaction table parent container (`transactions.tsx`) from `md:h-[calc(100vh-12rem)]` to `md:h-[calc(100vh-8rem)]`, and optimized the mobile table height container constraint from `h-[calc(100svh-15rem)]` to `h-[calc(100svh-11rem)]` to stretch the table and align it beautifully just above the tab bar.
  - Removed `justify-between` from the main container flex-layout, and removed `flex-1` from the `<div key={path} className="page-transition relative">` wrapper in `route.tsx`. This prevents the page wrapper container from auto-stretching to fill the vertical viewport height, allowing it to size naturally to the content. The footer now directly follows the page content (e.g. immediately underneath the Dashboard's last three stat cards) instead of being pushed to the very bottom, eliminating large blank vertical gaps.
  - Reduced the web view footer container height and gap by refactoring its top margin/padding classes in `route.tsx` from `mt-12 pt-6` to `mt-6 pt-3`, pulling the footer text closer to the layout content.
- **Dynamic Category Labels in Macro Cards**: Refactored the macro section in `automation.tsx` to replace the static `"Template shortcuts"` text with the category (using icons and names, e.g. `🍔 Food`) of the actions. If a macro defines multiple actions with different categories, it displays only the first category on the card itself, while keeping the full list of all categories in the card's hover tooltip (title attribute). Displays `🔄 Transfer` for transfers and fallbacks to `Uncategorized`.
- **Styled Deletion Confirmation Dialogs for Macros & Subscriptions**: Integrated Radix `<AlertDialog>` components in `automation.tsx` to replace browser native confirm windows (for subscriptions) or lack of confirmation entirely (for macros). Users are now prompted with a styled confirmation pop-up before deleting automations. Once verified, a success toast pop-up notifies the user in the right side of the screen.
- **Static Headers and Footers in Macro Details Dialog**: Refactored the macro details view dialog in `automation.tsx` to use the flex-column layout. The title name and `"Transaction Shortcuts"` heading are now locked in a static top header block, while the Aggregate Total and Edit/Trigger action buttons are locked in a static bottom footer block. Only the list of transaction shortcuts scroll when the content is tall.
- **Subscription Details Dialog & Card Click Trigger**: Built a custom details view dialog for Subscriptions in `automation.tsx` that mirrors the Macro details dialog layout. Clicking anywhere on a subscription card now triggers this view. It shows payment amount, billing account (or split accounts if enabled), category, due/paid dates, and notes. The header (with name and Active/Overdue status badge) and footer (with Edit/Delete action buttons) remain static, and only the middle content area is scrollable.
- **Improved Subscription Payment, Concurrency Locks & Daily Overdue Notifications**:
  - Refactored the subscription notifications engine in `route.tsx` to insert a daily-checked notification (`sub-upcoming-...-[date]`) 3 days before payment. If sufficient funds exist, the alert informs the user that funds are available for auto-deduction; otherwise, a warning notification warns them of the shortage.
  - Set the overdue checks to run every day until there is a sufficient balance in the selected account(s). Once a refilled balance matches the subscription price, the auto-deduction loop immediately processes the payment.
  - **Fixed Timezone Calculation Discrepancies**: Overruled standard UTC string date parsing by introducing `parseLocalDate()` to compute calendar offsets strictly relative to the user's local timezone. Changed the diff check from `Math.ceil` to `Math.round` to handle DST transitions gracefully. This ensures overdue subscriptions (e.g. due yesterday) are immediately categorized as overdue (`diffDays < 0`) rather than being shifted to due today (`diffDays === 0`) due to timezone offsets.
  - **Transactional Batch Insert Bug Fix (Unique Constraint Protection)**: Discovered that when multiple overdue/upcoming checks are executed together, if a single notification item's identifier already exists in the database, Supabase cancels the entire batch insert with a `23505` duplicate key error, preventing other alerts from showing. Resolved this by comparing generated identifiers against `dbNotifications` before insertion, filtering out existing notifications to ensure all new alerts insert successfully.
  - **Comprehensive On-Demand Notification Syncing (`syncNotifications`)**: Upgraded the click handler on the `NotificationBell` to execute `syncNotifications()`. This function refetches the latest database state of all entities, re-runs verification logic on-the-fly, inserts any missing notifications, and forces a cache invalidation. Clicking the bell now loads all fresh notifications in real-time without page refresh.
  - **Daily Loan Overdue Reminders**: Upgraded the Loan notification check in `route.tsx` to parse loan due dates timezone-safely and key their database insert identifiers with `-${todayStr}`. Active loans in the past will trigger a fresh daily notification reminder until paid or updated, fixing missing overdue alerts.
  - **Batch Date Modification on Transactions (`transactions.tsx`)**: Added a **Change Date** button to the floating batch actions bar. When multiple transactions are checked, clicking it opens a Dialog containing a date picker. Saving the new date updates all selected transaction dates in a single bulk operation and propagates date changes to linked loans.
  - **Solved Double Payment / Multiple Deduction Bugs**:
    1. **Concurrency Lock (`processingSubIds` set)**: Prevented concurrent race condition triggers (such as React Strict Mode double-calling effects or rapid query refetch updates) by introducing an in-memory execution lock tracker. Once a subscription starts deduction, it is ignored by other concurrent effects.
    2. **Future Billing Date Math**: If a subscription was overdue by multiple months, instead of processing consecutive catch-up loops (deducting multiple times in a row), it now records exactly **one transaction** (to reactivate the subscription) and advances the next due date forward to the **next billing date in the future** matching the subscription's billing day.
  - Programmed overdue warnings to calculate the exact number of months missed (overdue periods) for several months of missing balances. Displays the exact missed count and total outstanding amount (e.g. *Netflix is overdue by 3 months! Total outstanding for auto-deduction: $30.00*) in the notification.
## Live URL

Your website is live at:
🚀 **[https://finorasset.vercel.app](https://finorasset.vercel.app)**
*(Alternative Preview URL: [finor-asset-gdsuzi3pd-mahmudul-mashrafes-projects-a3fb83c2.vercel.app](https://finor-asset-gdsuzi3pd-mahmudul-mashrafes-projects-a3fb83c2.vercel.app))*

---

## Verification & Build Results

We successfully verified the build locally and on Vercel's cloud builder:
```bash
npx vercel deploy --prod --yes
```
This compiled all assets and generated the serverless functions correctly under the Nitro engine on Vercel's serverless edge.

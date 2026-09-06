# ShopVerse Premium

A full-stack marketplace demo built with HTML/CSS/Vanilla JS + Node.js/Express + MongoDB.

## Quick start
1. Install Node.js 20+ and MongoDB/Compass. Start MongoDB.
2. Copy `.env.example` to `backend/.env`.
3. In `backend`: `npm install`
4. Seed: `npm run seed`
5. Run: `npm start`
6. Open `http://localhost:5000`

## Demo logins
- Admin: `admin@shopverse.local` / `Admin@12345`
- Customer: register from the website.

## Cashfree
Set `CASHFREE_CLIENT_ID` and `CASHFREE_CLIENT_SECRET` in `backend/.env`. The server creates payment sessions and verifies payment status from Cashfree; it never trusts the browser's payment result. Use sandbox keys while `CASHFREE_ENV=sandbox`.

## Images
The ZIP bundles local SVG product art, gallery images, 6 premium-style homepage banners and distinct 24-frame demo 360 sequences for selected products. Replace them with licensed product photography for real deployment.

## Real demo photography
This build uses real photographic demo imagery from Flickr through LoremFlickr for all seeded product cards/galleries and the six homepage hero slides. Each product uses a unique locked image URL. Because these are remote real photos, the browser needs an internet connection. The previous SVG artwork remains only as unused local fallback assets.

To avoid falsely claiming 360 photography, seeded products no longer use synthetic/repeated SVG frames as "real 360". The 360 viewer architecture remains in the code and activates when genuine multi-angle frame URLs are supplied for a product.

## Upgraded marketplace modules

This build adds working MongoDB-backed modules for coupons, homepage banner management, customer reviews, returns/replacements, notifications, support tickets, profile/address management, wallet/loyalty display, inventory transaction logs, categories/brands, comparison, dark mode, forgot/reset password via email OTP, and 30-day admin analytics.

### Demo accounts after `npm run seed`

Admin: `admin@shopverse.local` / `Admin@12345`



Admin panel: `http://localhost:5000/admin/index.html`

### Important database migration

`npm run seed` safely attempts to drop the obsolete MongoDB `orders.orderId_1` index used by older builds. Current orders use the required unique `orderNumber` field.

### Notes

Product/banner demo photography is loaded from remote image URLs, so internet access is required for those photos. Cashfree online checkout still requires valid Cashfree environment credentials. Forgot-password OTP is delivered by the configured SMTP account; configure SMTP credentials before use.


## Extended marketplace modules
This build also includes: local secure image uploads (JPG/PNG/WebP/AVIF), product variants with variant galleries/360 frame arrays, product Q&A, price-drop/back-in-stock subscriptions, recently viewed, recommendations, gift cards, loyalty-to-wallet redemption, flash sales, admin RBAC fields, audit logs, search analytics, customer suspension, wallet refund handling, delivery PIN availability endpoint, reorder, invoice-data endpoint, PWA offline fallback, dark mode, and advanced admin operation pages.

### External integrations
Cashfree production payments/refunds, SMTP delivery, courier APIs, Cloudinary and genuine 24/36-angle 360 photography require your own provider credentials/assets. The application does not fake those external provider results.


## Multi-vendor management panels
- Admin: `/admin/index.html`

After `npm run seed`, demo logins are:
- Admin: `admin@shopverse.local` / `Admin@12345`
- 
This build contains only the Admin panel and normal customer storefront/account experience. Seller and Delivery Partner roles/panels have been removed.


## Admin repair update
- Responsive Admin dashboard rebuilt for Admin + Customer only.
- Private product-specific customer chat is visible under Admin > Product Chat, with reply and resolve.
- Checkout and saved addresses now use PIN-first India-wide postal lookup and city/state/post-office suggestions.
- Customer Suspend/Unsuspend is active and enforced by auth middleware.

## Order-specific chat, call support and refunds

- Each order can open `/order-chat.html?order=<orderId>` as a private customer ↔ admin support thread.
- Admin → **Order Chats** shows the customer name, email, Order ID, order status, payment status, total and item count.
- Set `SUPPORT_PHONE=+91XXXXXXXXXX` in `backend/.env` to enable the **Call Support** button for customers.
- Customers can submit Return, Replacement or Refund requests from the same order chat page.
- Admin → **Returns & Refunds** can approve/update requests and process eligible refunds either to the ShopVerse Wallet or the original Cashfree payment method.

## Production OTP + Cashfree setup

### Forgot Password OTP
The Forgot Password page now uses Email OTP only.

Email OTP uses SMTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `backend/.env`.

Mobile/MSG91 OTP has been removed from this build. Configure SMTP only for password-reset OTP delivery.

### Cashfree Payment Gateway
Use `CASHFREE_ENV=sandbox` while testing. After your Cashfree Payment Gateway account is activated for production, set:

```
CASHFREE_ENV=production
CASHFREE_CLIENT_ID=your_production_app_id
CASHFREE_CLIENT_SECRET=your_production_secret
CASHFREE_API_VERSION=2025-01-01
FRONTEND_URL=https://your-domain.example
BACKEND_PUBLIC_URL=https://your-domain.example
```

Cashfree create-order happens only on the backend. Checkout receives only the payment session ID and selected Cashfree mode. Payment status is verified server-side and Cashfree webhook signatures are checked using the raw request body. In production, `BACKEND_PUBLIC_URL` must be a public HTTPS URL so Cashfree can deliver webhooks to `/api/webhooks/cashfree`.

### Saved Address checkout
Customers can save multiple addresses, set one as Default, and checkout automatically fills the default saved address. Selecting another saved address immediately fills the checkout form with that address.

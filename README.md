# NEXORA

A premium, responsive e-commerce demo built with vanilla HTML/CSS/JavaScript, Express and SQLite. Product prices, stock, carts and orders are backed by SQLite. Checkout is a simulated cash-on-delivery flow; no real payment is taken.

## Run locally

1. Install Node.js 22.13 or newer (uses the built-in `node:sqlite` module).
2. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`.
3. Install packages and start the server:

   ```sh
   npm install
   npm start
   ```

4. Visit [http://localhost:3000](http://localhost:3000). The app creates and seeds `data/nexora.db` on first start. To initialize it separately, run `npm run init-db`.

No demo account is pre-created. Create one from **Your account → Create account**. Use a real-looking email and a password of at least 8 characters. Guest checkout is disabled; sign in to keep your cart and place an order.

## Features

- Editorial storefront, responsive layout, product/category browsing, search, price filtering, sorting and load more.
- 127 seeded products across 12 categories with stock, discounts, demo ratings/review counts, specifications and Unsplash imagery.
- Product detail pages, related items, graceful image fallbacks and wishlist saving for signed-in customers.
- Hashed-password registration/login, server-side sessions and private customer carts.
- Cart quantity validation, removal, clear with confirmation, server-computed prices and totals.
- Checkout with shipping validation, transactional order creation and stock reduction, order confirmation and private order history/details.
- Newsletter signup validation (demo endpoint; does not send or persist emails).
- Security headers, parameterized SQL, SQLite foreign keys and indexes.

## Database

`db/init.js` idempotently creates and seeds the database. Tables: `users`, `categories`, `products`, `carts`, `orders`, `order_items`, `wishlists` and `sessions`; sessions are stored in SQLite and expire after seven days. Order items retain the name, image and charged price at purchase time. Foreign-key enforcement and WAL mode are enabled.

By default, `DB_PATH=./data/nexora.db`. Keep that file on persistent storage if you want customer accounts and orders to survive deployments.

## Deployment (Render or similar)

1. Push the project to a Git provider and create a Node web service from the repository.
2. Set the build command to `npm install` and start command to `npm start`.
3. Set `NODE_ENV=production`, `SESSION_SECRET` to a unique long random value, and `DB_PATH` to a file path on the service's mounted persistent disk (for example `/var/data/nexora.db`).
4. Attach a persistent disk at `/var/data` before first launch. SQLite on an ephemeral filesystem can be lost on redeploy/restart. For multiple application instances, use a shared persistent database service instead of local SQLite.
5. The app reads the hosting platform's `PORT` and binds to `0.0.0.0`.

## Scripts

- `npm start` — run the server.
- `npm run dev` — restart on source changes (Node watch mode).
- `npm run init-db` — create tables and seed products if no catalog exists.
- `npm test` — run the integration suite for the customer journey, search and filters.

## Limitations

This is a demo store. Use a single app instance with SQLite; configure persistent storage for the database file and keep `SESSION_SECRET` stable across restarts. Payment is cash-on-delivery simulation, newsletter signup is validation-only, and product images load from Unsplash over the network. Order status is initially `Processing`; no fulfillment or email integration is included.



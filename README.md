# SHOBA AI Backend

Secure server-side API layer for the SHOBA Connect WordPress business directory.

## Endpoints

- `GET /api/health` — confirms the backend can reach WordPress.
- `GET /api/listings` — searches and filters published `job_listing` posts.
- `GET /api/listings/:id` — retrieves one listing.

Supported `/api/listings` query parameters:

- `search`
- `location`
- `category`
- `region`
- `type`
- `tag`
- `page`
- `per_page`

Authentication for listing endpoints:

- `X-SHOBA-API-Key: <SHOBA_API_KEY>`
- or `Authorization: Bearer <SHOBA_API_KEY>`

## Vercel environment variables

Set these in Vercel. Never commit them to GitHub.

- `WORDPRESS_URL=https://shobaconnect.com`
- `WORDPRESS_USERNAME=<your WordPress username>`
- `WORDPRESS_APP_PASSWORD=<a WordPress Application Password>`
- `SHOBA_API_KEY=<a long random API key>`
- `ALLOWED_ORIGINS=https://shobaconnect.com,https://www.shobaconnect.com`

The WordPress application password is used only server-side. It is never sent to the browser or AI client.

## Intended architecture

SHOBA WordPress → Vercel backend → future AI chat interface.

The backend reads real WordPress data; it does not create fake businesses or modify the existing SHOBA WordPress site.

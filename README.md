# Chronicle

An interactive world history study site built with Next.js and deployed to Cloudflare Workers via OpenNext.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Cloudflare Deploy

Use these settings in the Cloudflare dashboard:

| Setting | Value |
|---|---|
| **Build command** | `npx opennextjs-cloudflare build` |
| **Deploy command** | `npx wrangler deploy` |

The build step compiles the app once. Deploy only uploads the existing `.open-next/` output — it should **not** run another build.

Optional: set `NEXT_PUBLIC_SITE_URL` in Cloudflare build variables if you use a custom domain for Open Graph links.

For local deploys:

```bash
npm run deploy
```

## Included Shape

- site code under `app/`
- `events.json` holds the full chronology
- optional D1/Drizzle examples under `examples/d1/` and `db/`

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: build with Next.js
- `npm run preview`: build and preview on the Workers runtime locally
- `npm run deploy`: build with OpenNext and deploy to Cloudflare
- `npm test`: verify deploy config and event count
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare)
- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

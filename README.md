# York Region Restaurants Roulette

- Just for fun! Idea is not original though.  

## Features  
### I. The Roulette Animation  
### II. Restaurant Exhibition when Roulette Stops  
### III. Restaurants List Auto-update  
### IV. Filter by City

## Maintenance sync

Local `wrangler dev` requests to `POST /api/sync` are allowed without a token. Deployed requests require the `SYNC_TOKEN` secret:

```sh
npx wrangler secret put SYNC_TOKEN
curl -X POST -H "Authorization: Bearer <token>" https://your-worker-domain/api/sync
```
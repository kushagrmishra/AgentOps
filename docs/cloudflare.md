# Cloudflare DNS (Stage 6)

Point your apex + app subdomain through Cloudflare (proxy orange-cloud optional for TLS/CDN).

| Host | Type | Target | Notes |
|------|------|--------|-------|
| `agentops.com` / `@` | CNAME | `cname.vercel-dns.com` (marketing Vercel) | Or A/AAAA from Vercel |
| `www` | CNAME | `agentops.com` | Redirect to apex in Vercel |
| `app.agentops.com` | CNAME | `cname.vercel-dns.com` (client Vercel) | Authenticated app |
| `api.agentops.com` | CNAME | Railway public domain | FastAPI |

Then set:

- `CLIENT_ORIGIN=https://app.agentops.com`
- `MARKETING_ORIGIN=https://agentops.com`
- `CORS_ORIGINS` ignored in production — API locks CORS to `CLIENT_ORIGIN` only
- Clerk allowed origins / redirect URLs for `app.agentops.com`

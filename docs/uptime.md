# Uptime monitoring (Stage 5)

Configure Better Uptime, UptimeRobot, or Cloudflare Health Checks against:

```
GET https://api.YOUR_DOMAIN/health
```

Expected JSON includes `"status": "ok"`. Check every 60s; alert on non-200 or body without `"ok"`.

This is external config only — no app code required beyond the existing `/health` route.

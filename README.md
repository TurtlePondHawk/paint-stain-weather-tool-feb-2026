# Paint/Stain Forecast (Static + Serverless)

This project ships as:
- Static frontend: `/public`
- Serverless API endpoint: `/api/forecast.js`

## What you get (v1)
- Location input (ZIP or city)
- Task toggle: Exterior Paint vs Deck Stain
- "Now" go/no-go + reasons
- "Next safe window" (earliest 3-hour window) + curing buffer rules
- Conservative, professional-safe thresholds in `/api/rules.config.json`

## Professional-safe thresholds (locked)
- Minimum temperature: 55°F during work window
- Overnight low: >= 50°F during next 24 hours
- Max humidity: Paint 75%, Stain 70%
- Rain probability: <= 15% during work window AND curing buffer
- Measurable precip: must be 0.0mm during work window AND curing buffer
- Wind: Paint <= 15 mph, Stain <= 20 mph
- Min window: 3 hours
- Curing buffer: Paint 12 hours, Stain 24 hours

## Deploy on Vercel
1. Create a new Vercel project from this folder.
2. Ensure the folder structure is preserved:
   - `/api/forecast.js`
   - `/api/rules.config.json`
   - `/public/index.html` etc.
3. Vercel will serve `public` as static and `api/*` as serverless.

Try locally (optional):
- `npx serve public` (frontend only, no API)
- For full API locally, use Vercel CLI or a Node dev server that routes `/api/forecast`.

## Deploy on Netlify
- Put frontend in `public`
- Convert `api/forecast.js` into a Netlify Function (similar signature).

## Weather data source
- Open-Meteo Forecast API (no key)
- Open-Meteo Geocoding API (no key)

## Notes
- This tool is conservative by design.
- It does not account for substrate moisture, sun/shade, or product label constraints.

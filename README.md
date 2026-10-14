# GenesysCloud Conversation Analysis

## Repository status and architecture

Local proof of concept for solution architects and support engineers. A Next.js UI calls the server-side `/api/investigate` route, which authenticates to Genesys Cloud using OAuth client credentials. Analytics, conversation details, flow information, and recording metadata use real services; there is no simulated backend. Use an authorized test organization and synthetic conversations.

The analytics query covers the preceding 31 days. Some 403 responses become unavailable sections; GET 404 responses return missing data. Other errors can fail the request. A fresh token is obtained for each investigation; rate-limit retries and explicit timeouts are not implemented.

The API route currently has no application-level user authentication. Add authentication and authorization before public hosting. The permission list below is inherited from the original project and has not been validated against current official documentation. Verify API payloads, roles, division access, and any required scopes before a pilot.

GitHub preparation verified a production build with Node.js 24.19.0. Next.js reports a React 18 deprecation warning. No live Genesys calls were made. Vercel deployment is deferred; verify hosting limits and configure server-side environment variables before deployment.

For a reproducible install use `npm ci`. On Windows, copy the example using `Copy-Item .env.local.example .env.local`, then fill in local credentials. Never commit `.env.local`. Run `npm run build` and `npm start` for a local production build. To demonstrate, enter an authorized test conversation ID and inspect the returned sections.

Web aplikacija za brzu analizu Genesys Cloud poziva po Conversation ID.

## Setup

### Lokalno

```bash
npm install
cp .env.local.example .env.local
# Popuni .env.local sa tvojim credentials
npm run dev
```

Otvori http://localhost:3000

### Vercel deploy

1. Push na GitHub
2. Import repo na vercel.com
3. Dodaj Environment Variables u Vercel dashboard:
   - `GENESYS_CLIENT_ID`
   - `GENESYS_CLIENT_SECRET`
   - `GENESYS_REGION` (npr. `mypurecloud.ie`)
4. Deploy

## Genesys OAuth permisije

OAuth client (Client Credentials) treba:
- Analytics > Conversation Detail > View
- Conversations > Conversation > View
- Architect > Flow Instance > View, Search *(za flow history)*
- Recording > Recording > View *(za snimke)*
- Telephony > SIP Traces > View *(za PCAP)*
- Users > User > View

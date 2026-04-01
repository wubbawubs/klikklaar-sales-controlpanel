

# PWA + Push Notificaties — Implementatieplan

## Overzicht

Het KlikKlaar Sales Control Panel wordt een installeerbare PWA met push-notificaties. Handmatige service worker (geen vite-plugin-pwa) met preview-guard zodat de Lovable editor niet breekt.

**Merkgegevens**: Teal primary (#0F9B7A), dark navy sidebar, KlikKlaar brand icon beschikbaar.

---

## Stappen

### 1. Manifest & Iconen
- Maak `public/manifest.json` (name: "KlikKlaar Control Center", short_name: "KlikKlaar", theme_color: "#0F9B7A", display: "standalone")
- Genereer `public/icons/icon-192.png` en `icon-512.png` op basis van bestaande `src/assets/klikklaar-icon.jpeg`
- Voeg manifest link + apple-mobile-web-app meta tags toe aan `index.html`

### 2. Service Worker (`public/sw.js`)
- Minimal shell cache (alleen "/")
- Network-first navigatie strategie
- Push event handler → toon notificatie met titel, body, icon, action_url
- Notification click handler → deep link naar action_url
- Badge support via `navigator.setAppBadge`

### 3. SW Registratie in `src/main.tsx`
- Guard: registreer NIET in iframes of op `id-preview--` / `lovableproject.com` hosts
- Bestaande service workers unregisteren in preview context

### 4. iOS Installatie Prompt Component
- Detecteer iPhone/iPad via userAgent
- Toon instructiebanner ("Deel → Zet op beginscherm") als niet standalone
- Dismiss opslaan in localStorage

### 5. Database Tabellen (3 migraties)
- `push_subscriptions` (user_id, endpoint, p256dh_key, auth_key, platform, is_installed, enabled, created_at)
- `notification_preferences` (user_id, push_enabled, email_enabled, quiet_hours_start, quiet_hours_end)
- `notifications` (user_id, title, body, type, action_url, is_read, metadata_json, created_at)
- RLS: users eigen data, admins alles
- Realtime enabled op `notifications` tabel

### 6. VAPID Keys
- Genereer VAPID keypair via edge function of script
- Sla op als secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- Frontend krijgt public key via `VITE_VAPID_PUBLIC_KEY` environment variable (of hardcoded public key)

### 7. Edge Functions (3 stuks)
- **register-push-subscription**: Slaat PushSubscription op per geauthenticeerde user
- **unregister-push-subscription**: Verwijdert subscription
- **send-push-notification**: Verstuurt web-push met VAPID auth naar alle actieve subscriptions van een user

### 8. Push Toggle Component
- Knop in Settings of header
- Vraagt permissie ALLEEN na klik
- Status: aan / uit / niet-ondersteund / geblokkeerd
- Roept register/unregister edge function aan

### 9. Notification Bell in Sidebar
- Bell icon met unread count badge in `AppSidebar.tsx`
- Realtime subscription op `notifications` tabel (user's eigen records, is_read = false)
- Max "99+" weergave
- Klik → navigeer naar `/notifications` pagina (nieuw)

### 10. Notifications Pagina
- Lijst van notificaties met titel, body, tijdstip, gelezen/ongelezen
- Markeer als gelezen bij klik
- Markeer alles als gelezen

### 11. Automatische Push bij Events
- Database trigger op `notifications` INSERT → roep `send-push-notification` aan via `pg_net`
- Check of user `push_enabled = true` in preferences
- Respecteer quiet hours

---

## Technische details

**Bestanden die worden aangemaakt:**
- `public/manifest.json`
- `public/icons/icon-192.png`, `icon-512.png`
- `public/sw.js`
- `src/components/pwa/IOSInstallPrompt.tsx`
- `src/components/pwa/PushToggle.tsx`
- `src/components/pwa/NotificationBell.tsx`
- `src/pages/NotificationsPage.tsx`
- `supabase/functions/register-push-subscription/index.ts`
- `supabase/functions/unregister-push-subscription/index.ts`
- `supabase/functions/send-push-notification/index.ts`
- 3 database migraties

**Bestanden die worden gewijzigd:**
- `index.html` — manifest link + meta tags
- `src/main.tsx` — SW registratie met preview guard
- `src/components/layout/AppSidebar.tsx` — NotificationBell toevoegen
- `src/App.tsx` — /notifications route toevoegen

**VAPID public key**: Wordt als publishable key in de codebase opgenomen (is veilig, het is een public key). Private key als Supabase secret.

**Geen vite-plugin-pwa** — handmatige SW voor volledige controle en preview-compatibiliteit.


# Environment Variable Setup

## Backend URL Configuration

The frontend uses an environment variable to configure the backend API URL. This allows you to easily switch between local development and tunneled/production URLs.

### Setup

1. **Copy the example file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** and set your backend URL:

   **For local development:**
   ```
   REACT_APP_API_URL=http://localhost:8080
   ```

   **For ngrok tunnel:**
   ```
   REACT_APP_API_URL=https://your-ngrok-url.ngrok-free.app
   ```

   **For localtunnel:**
   ```
   REACT_APP_API_URL=https://warhammer-backend.loca.lt
   ```

3. **Restart your development server** (if running):
   ```bash
   npm start
   ```

### How It Works

- The app reads `REACT_APP_API_URL` from your `.env` file
- All HTTP requests use this URL automatically
- WebSocket connections convert `http://` → `ws://` and `https://` → `wss://`
- If the variable is not set, it defaults to `http://localhost:8080`

### Sharing with Friends

1. **Start your backend**:
   ```bash
   cd warhammer-battle-helper-backend
   ./tmp/main
   ```

2. **Expose backend with ngrok/localtunnel**:
   ```bash
   # Option 1: ngrok
   ngrok http 8080

   # Option 2: localtunnel
   lt --port 8080 --subdomain warhammer-backend
   ```

3. **Update `.env`** with the tunnel URL:
   ```
   REACT_APP_API_URL=https://abc123.ngrok-free.app
   ```

4. **Restart frontend**:
   ```bash
   npm start
   ```

5. **Share the frontend URL** (also needs to be tunneled if you want others to access it):
   ```bash
   # In another terminal
   ngrok http 3000
   # or
   lt --port 3000 --subdomain warhammer-frontend
   ```

Now your friends can open the frontend URL and play with you!

### Notes

- The `.env` file is in `.gitignore` and won't be committed
- Use `.env.example` as a template for others
- Remember to restart the dev server after changing `.env`

### Google Analytics

`REACT_APP_GA_MEASUREMENT_ID` przechowuje identyfikator strumienia danych GA4
(format `G-XXXXXXXXXX`). Zmienna jest odczytywana w czasie budowania — po jej
zmianie trzeba przebudować obraz, samo `restart` nie wystarczy.

Pusta wartość (domyślna w dev) wyłącza analitykę całkowicie: skrypt Google nie jest
ładowany, a baner zgody się nie pokazuje. Zostaw ją pustą lokalnie, żeby `npm start`
nie zaśmiecał produkcyjnych danych.

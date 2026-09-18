# 🚀 Running Slipstream Locally

## Quick Start (3 Methods)

### Method 1: Python HTTP Server (Easiest)

If you have Python installed (comes with macOS):

```bash
# Navigate to the web folder
cd web

# Python 3 (most common)
python3 -m http.server 8000

# OR Python 2 (older systems)
python -m SimpleHTTPServer 8000
```

**Then open**: http://localhost:8000

---

### Method 2: npx serve (No installation needed)

```bash
# From project root
npx serve web -p 8000
```

**Then open**: http://localhost:8000

---

### Method 3: VS Code Live Server Extension

1. Install "Live Server" extension in VS Code
2. Right-click on `web/index.html`
3. Select "Open with Live Server"

**Auto-opens**: http://127.0.0.1:5500/web/

---

## Full Instructions for Each Method

### 📦 Method 1: Python HTTP Server (RECOMMENDED)

**Advantages**: 
- Already installed on macOS
- No dependencies needed
- Very simple

**Steps**:

```bash
# 1. Navigate to the web directory
cd "/Users/sumeet/Desktop/projects /SLIP-STREAM/web"

# 2. Start the server
python3 -m http.server 8000

# You'll see:
# Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

**3. Open your browser**: http://localhost:8000

**To stop**: Press `Ctrl + C`

---

### 🚀 Method 2: Using npx serve

**Advantages**:
- Professional development server
- Automatic port management
- Nice UI

**Steps**:

```bash
# From project root
npx serve web -p 8000
```

**Output**:
```
   ┌────────────────────────────────────────┐
   │                                        │
   │   Serving!                             │
   │                                        │
   │   Local:  http://localhost:8000        │
   │                                        │
   └────────────────────────────────────────┘
```

**To stop**: Press `Ctrl + C`

---

### 💻 Method 3: VS Code Live Server

**Advantages**:
- Auto-reload on save
- Great for development
- Built into VS Code

**Steps**:

1. Open VS Code
2. Install "Live Server" extension by Ritwick Dey
3. Open the project folder in VS Code
4. Right-click on `web/index.html`
5. Click "Open with Live Server"

**Auto-opens**: Browser at http://127.0.0.1:5500/web/

**Features**:
- ✅ Auto-reload when you save files
- ✅ Works with any browser
- ✅ Easy to use

---

## 🔧 Testing the Extension Locally

The landing page works on localhost, but to test the actual Chrome extension:

### Load Extension in Chrome:

1. Open Chrome/Edge/Brave
2. Go to `chrome://extensions`
3. Enable "Developer mode" (toggle top-right)
4. Click "Load unpacked"
5. Select the `extension/` folder (NOT the `web/` folder)

**The extension will load and you can test it on:**
- chatgpt.com
- claude.ai
- gemini.google.com
- copilot.microsoft.com
- grok.com
- perplexity.ai

---

## 🎯 Quick Command Reference

```bash
# View landing page locally
cd web && python3 -m http.server 8000

# Run tests
npm test

# Verify everything
npm run verify

# Create ZIP for distribution
npm run zip

# Deploy to Vercel
npm run deploy
```

---

## 🌐 Different URLs Explained

| URL | What It Is |
|-----|------------|
| `http://localhost:8000` | Your local landing page |
| `chrome://extensions` | Load extension for testing |
| `https://slipstream-lime.vercel.app` | Your live public site |
| `https://github.com/sumeetdk16/SLIP-STREAM` | Your GitHub repo |

---

## 🐛 Troubleshooting

### Port already in use?

```bash
# Try a different port
python3 -m http.server 3000
# Then open: http://localhost:3000
```

### Python not found?

```bash
# Check if Python is installed
python3 --version

# If not, install via Homebrew (macOS)
brew install python3
```

### Need to test on mobile?

Find your local IP:
```bash
ipconfig getifaddr en0
# Example output: 192.168.1.100
```

Then open on mobile: `http://192.168.1.100:8000`

---

## 📝 Development Workflow

### For Landing Page Development:

1. **Start server**:
   ```bash
   cd web && python3 -m http.server 8000
   ```

2. **Make changes** to `web/index.html`

3. **Refresh browser** to see changes

4. **When done**:
   ```bash
   git add web/index.html
   git commit -m "Update landing page"
   git push origin master
   ```

5. **Deploy** (if not auto-deploying):
   ```bash
   npm run deploy
   ```

### For Extension Development:

1. **Load extension** in `chrome://extensions`

2. **Make changes** to files in `extension/src/`

3. **Reload extension**:
   - Go to `chrome://extensions`
   - Click "Reload" button on Slipstream card
   - Refresh chat tabs

4. **Test** on supported platforms

5. **Run tests**:
   ```bash
   npm test
   ```

6. **Commit and push**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin master
   ```

---

## ✨ Pro Tips

1. **Use Python for quick testing** - It's already on your Mac
2. **Use VS Code Live Server for development** - Auto-reload is great
3. **Remember to refresh browser** after changes (unless using Live Server)
4. **The landing page is just HTML** - No build step needed
5. **Extensions need reload** - Both extension reload + tab refresh

---

**Need help?** Check the main README.md for more details!

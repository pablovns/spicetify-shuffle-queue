# Spicetify: Shuffle Next in Queue 🔀

[![Spicetify](https://img.shields.io/badge/Spicetify-Extension-1db954.svg?style=flat-square)](https://spicetify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A [Spicetify](https://spicetify.app/) extension that shuffles **only the user-enqueued tracks** (*"Next in queue"*), keeping your currently playing song and background playlist context completely untouched.

![Shuffle Next in Queue Preview](assets/preview.png)

---

## 💡 Why This Extension?

In official Spotify, there are two separate playback streams:
1. **Context Tracks (`Next from: <playlist/album>`)**: The background album or playlist stream. Spotify's built-in shuffle button *only* randomizes this context.
2. **User Queue (`Next in queue`)**: Songs manually added via *"Add to queue"*. Spotify enforces a strict FIFO (First-In, First-Out) order on these tracks and **never** shuffles them.

If you manually queue up 10–20 songs for an upcoming session and want them in a random order, Spotify gives you no option. **Shuffle Next in Queue** solves this directly!

---

## ✨ Features

- **Non-Destructive**: Shuffles *only* the manual queue. Does not restart, skip, or interrupt the currently playing track, and does not alter background playlist tracks.
- **True Randomness**: Implements the classic [Fisher–Yates shuffle](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle) algorithm for zero bias.
- **3 Fast Ways to Trigger**:
  1. **In-Queue Button**: Injected automatically right next to Spotify's native *"Clear queue"* button.
  2. **Topbar Button**: Quick-access shuffle icon on the top navigation bar.
  3. **Global Shortcuts**: Press <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Q</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>.
- **Internationalization (i18n)**: Automatically detects Spotify's language with built-in translations for English, Portuguese, and Spanish.

---

## 📦 Installation

### Option 1: Via Spicetify Marketplace (Recommended)

1. Open Spotify and go to the **Marketplace** tab in the left sidebar.
2. Under **Extensions**, search for `Shuffle Next in Queue`.
3. Click **Install** and reload Spotify.

> [!TIP]
> **Immediate Install via Custom Repositories:**  
> If the global Marketplace indexer hasn't synced yet, you can load it instantly:
> 1. In Marketplace, click the ⚙️ **Settings** icon (top right).
> 2. Paste `https://github.com/pablovns/spicetify-shuffle-queue` under **Custom Repositories**.
> 3. The card will appear right away in your Extensions list!

---

### Option 2: Quick CLI Installation

#### Linux / macOS:
```bash
curl -fsSL https://raw.githubusercontent.com/pablovns/spicetify-shuffle-queue/main/shuffle-queue.js -o ~/.config/spicetify/Extensions/shuffle-queue.js
spicetify config extensions shuffle-queue.js
spicetify apply
```

#### Windows (PowerShell):
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/pablovns/spicetify-shuffle-queue/main/shuffle-queue.js" -OutFile "$env:APPDATA\spicetify\Extensions\shuffle-queue.js"
spicetify config extensions shuffle-queue.js
spicetify apply
```

---

## ⌨️ Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Q</kbd> | Randomize user queue (*Next in queue*) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Alternative shortcut to randomize user queue |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

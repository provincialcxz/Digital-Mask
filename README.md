# [FSOCIETY] Digital-Mask: User-Agent Switcher    

> *"Hello, friend."*

> [Читать на русском](README_RU.md)

A Google Chrome extension for full browser fingerprint spoofing — User-Agent, Client Hints, JS properties, Canvas, WebGL, and WebRTC IP leak protection.



## Features

### User-Agent Spoofing
- Replaces the `User-Agent` header at the network level.
- Simultaneously replaces all **Client Hints** headers.
- Replaces `userAgentData` in the JS page context.
- Supports Chrome, Edge, Opera, Firefox, Safari, Googlebot — each browser is accurately emulated.

### Profile Database
- Built-in database of UA strings.
- Filter by category: **Desktop / Mobile / Bots / Saved**
- Random UA button from the active category.

### Custom Profiles
- Enter any UA string manually.
- Auto-save support.
- List of saved profiles with quick selection.

### Per-Site Rules
- Different UAs for different sites: `google.com`, `*.youtube.com`, `*tracker*`
- Rules take priority over the global setting.
- Enable/disable each rule individually.
- Patterns are automatically converted to valid DNR format.

### Privacy Protection (PRIVACY tab)

| Feature | Description |
|---|---|
| **WebRTC Leak Protection** | Blocks real IP leakage via WebRTC |
| **JS Fingerprint** | Spoofs standard browser parameters |
| **Canvas Noise** | Adds sub-pixel noise — breaks canvas fingerprinting |
| **WebGL Spoof** | Hides GPU vendor/renderer, replaces with typical Intel values |
| **Timezone Sync** | Synchronizes TimeZone with your real IP |

### Import / Export
- Export entire database to `.txt` (one UA per line) or `.json` (with per-site rules).
- Import from `.txt` and `.json` with deduplication.
- JSON export includes per-site rules.

### Interface
- Language toggle: **EN / RU**
- Spoofing activity indicator
- Displays the real browser UA



## Installation

**Preferred option:**  

Go to the extension page on [Google Chrome]().  


**Local assembly:**  
1. Download or clone the repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the extension folder



## Permissions

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | HTTP header modification |
| `declarativeNetRequestWithHostAccess` | Access to all hosts |
| `storage` | Saving settings and profiles |
| `privacy` | Managing WebRTC policy |



## Limitations

- **IP reputation**: If your IP is listed in VPN/datacenter provider databases (MaxMind, etc.) — this extension won't help. That check happens server-side.
- **Timezone for Date**: `Date.prototype` methods depend on the OS system timezone — the extension only patches `Intl.DateTimeFormat`, which covers most detectors.
- **After applying PRIVACY settings**: active tabs must be reloaded.



## Author

GitHub: [provincialcxz](https://github.com/provincialcxz)
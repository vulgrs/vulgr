## Fixes

- **You stay signed in to GitHub.** Sign-in tokens last 8 hours, and the app was signing you out when one ran out. It now renews them in the background; you're only signed out if GitHub withdraws access, never for being offline. After this update, sign in once more and it sticks.
- **Windows: Open folder… opens the folder picker again.** The window is brought forward before the dialog, the dialog opens on its own if it can't attach to the window, and any error now shows in the chat instead of nothing happening.

**Updating:** if you have 0.2.1-beta or newer, the gift icon at the bottom left installs this one. From 0.2.0-beta or older, download it below once.

**macOS:** the app isn't notarized by Apple yet. Move it to Applications, open it once, then click **Open Anyway** in *System Settings → Privacy & Security* (or run `xattr -dr com.apple.quarantine /Applications/Vulgr.app`).

## Fixes

- **Windows: team chats no longer end with an extra repair turn.** The local test check after a team chat couldn't start `npm` on Windows, so it counted as a failure and an agent was woken up to "fix" it, spending quota for nothing. It now runs the project's tests as it does on macOS and Linux.

New in 0.3.0-beta: team chat with `@claude @cursor …`, the same agent twice (`@claude @claude`), a model per agent and ⚡ Fast mode, and command approvals. See the [0.3.0-beta notes](https://github.com/vulgrs/vulgr/releases/tag/v0.3.0-beta).

**Updating:** if you have 0.2.1-beta or newer, the gift icon at the bottom left installs this one. From 0.2.0-beta or older, download it below once.

**macOS:** the app isn't notarized by Apple yet. Move it to Applications, open it once, then click **Open Anyway** in *System Settings → Privacy & Security* (or run `xattr -dr com.apple.quarantine /Applications/Vulgr.app`).

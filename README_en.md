<p align="right">
  <a href="./README.md">简体中文</a> | <b>English</b>
</p>

# Geek-Txt-Reader

A minimalist and stealthy reading extension embedded in the VS Code status bar.

Designed for developers, it maximizes the limited horizontal space of the status bar for a smooth and continuous reading experience without missing characters or abrupt breaks.

## ✨ Features

- 📖 **Smart Encoding & Chapter Splitting**: Automatically detects UTF-8 and GB18030/GBK encoding to eliminate garbled text; supports common web novel chapter splits.
- 🔄 **Smooth Cross-Chapter Scrolling**: Automatically advances to the next chapter at the end, and seamlessly returns to the tail of the previous chapter when rewinding.
- 🔍 **Fast Chapter Search**: Instantly brings up a quick-pick jump menu similar to code search via hotkeys.
- 🛡️ **Boss Key Masking**: One-click toggle between disguise placeholder text and complete invisibility.
- 🎯 **Accidental-Click Proof**: The status bar text is purely display-only; all controls and interactive options are neatly tucked inside the hover card.

## ⌨️ Shortcuts

| Shortcut | Function |
| :--- | :--- |
| `Alt + Right` | Page forward |
| `Alt + Left` | Page backward (cross-chapter rewinding supported) |
| `Alt + J` | Open chapter and progress jump palette |
| `Alt + Q` | Toggle boss-key hide / mask |

## ⚙️ Settings

Search for `geekTxtReader` in VS Code Settings (`Ctrl + ,` / `Cmd + ,` on macOS) to customize:
- `geekTxtReader.displayLength`: Number of characters displayed in the window (default `35`)
- `geekTxtReader.stepLength`: Step size (character count) shifted per shortcut trigger (default `28`)
- `geekTxtReader.showTitle`: Whether to persist the full chapter title in the status bar (default `false` for compact mode)
- `geekTxtReader.bossMaskText`: Custom mask text displayed when Boss Key is triggered

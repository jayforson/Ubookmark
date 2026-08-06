# Project Instructions

- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements — Manifest V3 UBookmark extension with a standalone, password-protected dashboard and split-incognito behavior.
- [x] Scaffold the Project — Created a no-build HTML, CSS, and JavaScript extension project.
- [x] Customize the Project — Implemented authentication, typed-confirmation vault reset, bookmark persistence, on-demand password updates, custom branding, split-incognito behavior, and time-aware theming.
- [x] Install Required Extensions — No extensions are required.
- [x] Compile the Project — JavaScript syntax and manifest JSON validation passed with no editor diagnostics.
- [x] Create and Run Task — No build task is required for this no-build extension.
- [ ] Launch the Project — Load unpacked through Chrome extensions when ready.
- [x] Ensure Documentation is Complete — README documents features, local installation, and storage limitations.

## Development Notes

- Use Manifest V3 APIs only.
- Keep passwords out of storage; store a PBKDF2 hash with a random salt instead.
- Persist user data using `chrome.storage.local`.
- Avoid external dependencies and inline scripts.

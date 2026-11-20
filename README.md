# UBookmark

UBookmark is a private, password-protected personal bookmark manager for Chrome. It provides a standalone dashboard for saving, organizing, searching, importing, and opening bookmarks without sending the vault to an external service.

## Features

- A dedicated UBookmark dashboard that opens when the extension toolbar button is selected.
- First-use password setup and a locked dashboard whenever it is opened or refreshed.
- Password hashes derived with PBKDF2 and a unique random salt; plaintext passwords are never stored.
- Add, remove, and open saved links in a new tab. Titles and URLs are required; comma-separated tags and notes are optional.
- Flexible link input: conventional addresses automatically receive `https://`, while supported links with another URI scheme are retained as entered. Unsafe `javascript:` and `data:` links are blocked.
- Search saved title, URL, tags, and notes. Matching bookmarks update as the user types.
- Website favicons are loaded from each saved website when available, with a letter-based fallback when a site has no favicon.
- The bookmark area is a folder-first tree. Create folders there, click a folder to expand or collapse its bookmarks, and drag folders to reorder them. Drag a bookmark onto a folder to move it. Drop on the upper half of another bookmark to place it before, or the lower half to place it after; use the drop area beneath an expanded folder to place it last. Bookmarks without a folder appear at the same level as folders. Select **Open all** to launch a folder's links in new tabs.
- Double-click a folder name to rename it. Empty folders delete immediately; deleting a folder with bookmarks requires confirmation and permanently removes its contents.
- Import selected native Chrome bookmarks or folders with **Import Chrome**. Imported Chrome folders become UBookmark folders; nested Chrome folders are imported as separate folders because UBookmark folders are one level deep.
- Export every folder and bookmark to a JSON file with **⇧ Export** in the **⚙ Settings** popup — a system save dialog lets you choose the folder and file name instead of saving to Downloads automatically — and import that file back with **⇩ Import** in the same popup — for backup, or to move a vault to another profile or device. Password data and the theme preference are never exported. Importing merges into the current vault without duplicating what is already there: a folder whose name already exists (ignoring letter case and surrounding spaces) is reused instead of created again, and a bookmark whose URL already exists in the target folder is skipped. The same URL in a different folder is kept. Invalid entries (for example an unsafe link or a missing title) are skipped and reported, without stopping the rest of the import.
- Persistent bookmarks, password data, and theme preference via `chrome.storage.local`.
- Light, dark, or automatic time-based theme selection. Auto mode uses light from 7:00 to 18:59 and dark otherwise.
- A **⚙ Settings** popup, opened from the gear icon in the header beside the Lock control, holding backup export/import and authenticated password change requiring the current password.
- Forgotten-password reset with a typed `DELETE` confirmation. It permanently removes the password and every saved bookmark, then lets the user create a new vault.
- Split incognito support: a dashboard launched from an incognito window stays in that window and does not share its bookmarks with the normal-profile vault.

## How to use

1. Select the UBookmark toolbar icon to open the standalone dashboard.
2. On first use, create a password. On later visits, enter the password to unlock the vault.
3. Save a link with a title and URL. Tags and notes are optional. New bookmarks appear at the top level.
4. Select **New folder** to create a folder. Drag a bookmark onto a folder to move it, then select a folder to expand or collapse its contents.
5. Select **Open all** on a folder to open its bookmarks in new tabs.
6. Use **Import Chrome** beside the Bookmarks heading to copy selected bookmarks or folders from the current Chrome browser.
7. Select the **⚙** icon in the header to open the Settings popup. Use **⇧ Export** to save all folders and bookmarks to a file and folder you choose (the suggested name is `ubookmark-export-<date>.json`; cancelling the save dialog exports nothing). Use **⇩ Import** to merge such a file back in; duplicates (same folder name, or same URL in the same folder) are skipped, and the result line in the popup reports what was imported and skipped. Select **✕** to close the popup.
8. Search by title, URL, tag, or note. Use the theme icon to cycle automatic, light, and dark modes.
9. Use the lock icon to end the current session. Select **⚙**, then **🔑 Change password** to expand the password form, and **🔑 Update** to change the password after authenticating with the current one.

## JSON export format

**⇧ Export** writes a single JSON document (version 1). Folders keep their display order and contain their bookmarks in display order; bookmarks without a folder are listed at the top level. Internal ids are not exported — on import, a folder is matched by name and a bookmark by its URL within its folder, which is what makes re-importing the same file safe.

```json
{
  "format": "ubookmark",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "folders": [
    {
      "name": "Work",
      "bookmarks": [
        { "title": "Docs", "url": "https://example.com/docs", "tags": ["work"], "note": "", "createdAt": 1700000000000 }
      ]
    }
  ],
  "bookmarks": [
    { "title": "News", "url": "https://news.example/", "tags": [], "note": "", "createdAt": 1700000000000 }
  ]
}
```

The export file contains your bookmark titles, URLs, tags, and notes in plain text. Store it somewhere private.

## Install locally

### Download a release package

1. Visit the [UBookmark releases page](https://github.com/jayforson/Ubookmark/releases).
2. Download `UBookmark-1.0.0.zip` from the latest release and extract it to a permanent folder.
3. Continue with the Chrome installation steps below, selecting the extracted folder.

### Load unpacked in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the downloaded package's extracted folder, or this project folder when developing locally.
4. Select the UBookmark toolbar icon to open the dashboard.

## Use in incognito

1. On `chrome://extensions`, select **Details** for UBookmark.
2. Enable **Allow in Incognito**.
3. Open the UBookmark toolbar action from an incognito window. The dashboard opens in that same incognito window with a separate, temporary vault.

## Privacy and storage

This extension is designed for personal use on a single Chrome profile. All UBookmark data is saved locally using `chrome.storage.local`: bookmarks, folders, theme preference, and only a random salt plus a PBKDF2 hash of the password. Plaintext passwords are never stored and no vault data is sent to an external server.

Chrome manages extension-profile storage; however, `chrome.storage.local` is not a dedicated encrypted vault. If the password is forgotten, it cannot be recovered. Use **Forgot password?** and type `DELETE` to permanently clear the vault and create a new one.

See the full [Privacy Policy](PRIVACY.md).

## Optional support

UBookmark is free to use for personal and commercial purposes. Selecting **Tip the developer** first displays a disclosure that confirms the contribution is entirely optional, is not required for any feature, and does not purchase a license, additional features, support, or future updates. Users may then optionally continue to [Buy Me a Coffee](https://buymeacoffee.com/jayforson), which handles payments under its own terms and privacy practices.

## Development

This is a no-build Manifest V3 extension with no external dependencies. After changing the source files, select **Reload** for UBookmark from `chrome://extensions` before testing the update.

The JSON export/import rules live in `backup.js` as pure functions (loaded by `dashboard.html` before `dashboard.js`), so they can be tested without a browser:

```sh
node --test tests/backup.test.js
```

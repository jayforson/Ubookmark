// Pure JSON export/import helpers for UBookmark. No DOM or chrome.* access,
// so the same file is loaded by dashboard.html and required by the Node tests.
// It attaches `UBookmarkBackup` to the global scope in the browser.
(function (globalScope) {
  "use strict";

  const EXPORT_FORMAT = "ubookmark";
  const EXPORT_VERSION = 1;

  // Mirrors the field limits enforced by the dashboard forms.
  const MAX_FOLDER_NAME_LENGTH = 80;
  const MAX_TITLE_LENGTH = 100;
  const MAX_URL_LENGTH = 2048;
  const MAX_NOTE_LENGTH = 1000;

  // Keep in sync with normalizedUrl() in dashboard.js, which the dashboard
  // passes in at runtime so imported links follow the exact same rules.
  function defaultNormalizeUrl(value) {
    const candidate = value.trim();
    if (!candidate) throw new Error("Enter a link.");
    let url;
    try {
      url = new URL(candidate);
    } catch {
      url = new URL(`https://${candidate}`);
    }
    if (["javascript:", "data:"].includes(url.protocol)) throw new Error("This link format cannot be opened safely.");
    return url.href;
  }

  function folderNameKey(name) {
    return name.trim().toLocaleLowerCase();
  }

  function normalizeTags(tags) {
    const rawTags = Array.isArray(tags)
      ? tags.filter((tag) => typeof tag === "string")
      : typeof tags === "string"
        ? tags.split(",")
        : [];
    return rawTags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, allTags) => allTags.findIndex((existingTag) => existingTag.toLocaleLowerCase() === tag.toLocaleLowerCase()) === index);
  }

  function exportBookmark(bookmark) {
    return {
      title: bookmark.title,
      url: bookmark.url,
      tags: [...(bookmark.tags || [])],
      note: bookmark.note || "",
      createdAt: bookmark.createdAt
    };
  }

  // Builds the JSON export document. Ids are deliberately omitted: on import a
  // folder is identified by its name and a bookmark by its URL within its
  // folder, so the file stays portable across vaults and profiles. Password
  // credentials and the theme preference are never exported.
  function createExportData(folders, bookmarks, exportedAt = new Date().toISOString()) {
    const folderIds = new Set(folders.map((folder) => folder.id));
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt,
      folders: folders.map((folder) => ({
        name: folder.name,
        bookmarks: bookmarks.filter((bookmark) => bookmark.folderId === folder.id).map(exportBookmark)
      })),
      // Bookmarks with no folder (or a folder that no longer exists) stay at the root.
      bookmarks: bookmarks.filter((bookmark) => !folderIds.has(bookmark.folderId)).map(exportBookmark)
    };
  }

  function validateBackup(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("This file is not a UBookmark export.");
    }
    if (data.format !== undefined && data.format !== EXPORT_FORMAT) {
      throw new Error("This file is not a UBookmark export.");
    }
    if (data.format === undefined && data.folders === undefined && data.bookmarks === undefined) {
      throw new Error("This file is not a UBookmark export.");
    }
    if (data.version !== undefined && data.version !== EXPORT_VERSION) {
      throw new Error(`Unsupported UBookmark export version: ${data.version}.`);
    }
    if (data.folders !== undefined && !Array.isArray(data.folders)) {
      throw new Error("This UBookmark export has an invalid \"folders\" list.");
    }
    if (data.bookmarks !== undefined && !Array.isArray(data.bookmarks)) {
      throw new Error("This UBookmark export has an invalid \"bookmarks\" list.");
    }
    return data;
  }

  // Merges a parsed export into the existing vault without mutating it and
  // returns the new folders/bookmarks plus import statistics.
  //
  // Deduplication rules:
  // - Folder identity is the name, compared trimmed and case-insensitively.
  //   An imported folder whose name already exists reuses that folder instead
  //   of creating a second one.
  // - Bookmark identity is the normalized URL within its folder (the root
  //   counts as its own folder). A bookmark already present in the target
  //   folder is skipped; the same URL in a different folder is kept.
  // The same rules apply to repeats inside the imported file itself.
  function mergeBackup(existingFolders, existingBookmarks, data, options = {}) {
    validateBackup(data);
    const createId = options.createId || (() => crypto.randomUUID());
    const now = options.now || (() => Date.now());
    const normalizeUrl = options.normalizeUrl || defaultNormalizeUrl;

    const stats = {
      foldersAdded: 0,
      foldersReused: 0,
      foldersSkippedInvalid: 0,
      bookmarksAdded: 0,
      bookmarksSkippedDuplicate: 0,
      bookmarksSkippedInvalid: 0
    };

    const folders = existingFolders.map((folder) => ({ ...folder }));
    const bookmarks = existingBookmarks.map((bookmark) => ({ ...bookmark, tags: [...(bookmark.tags || [])] }));

    const folderByNameKey = new Map();
    folders.forEach((folder) => {
      const key = folderNameKey(folder.name || "");
      if (key && !folderByNameKey.has(key)) folderByNameKey.set(key, folder);
    });

    const bookmarkKey = (folderId, url) => `${folderId || ""}\n${url}`;
    const seenBookmarkKeys = new Set();
    bookmarks.forEach((bookmark) => {
      let url;
      try {
        url = normalizeUrl(bookmark.url);
      } catch {
        url = String(bookmark.url || "").trim();
      }
      seenBookmarkKeys.add(bookmarkKey(bookmark.folderId || null, url));
    });

    const importBookmark = (rawBookmark, folderId) => {
      if (!rawBookmark || typeof rawBookmark !== "object" || Array.isArray(rawBookmark)) {
        stats.bookmarksSkippedInvalid += 1;
        return;
      }
      const title = typeof rawBookmark.title === "string" ? rawBookmark.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
      const rawUrl = typeof rawBookmark.url === "string" ? rawBookmark.url.trim().slice(0, MAX_URL_LENGTH) : "";
      if (!title || !rawUrl) {
        stats.bookmarksSkippedInvalid += 1;
        return;
      }
      let url;
      try {
        url = normalizeUrl(rawUrl);
      } catch {
        stats.bookmarksSkippedInvalid += 1;
        return;
      }
      const key = bookmarkKey(folderId, url);
      if (seenBookmarkKeys.has(key)) {
        stats.bookmarksSkippedDuplicate += 1;
        return;
      }
      seenBookmarkKeys.add(key);
      bookmarks.push({
        id: createId(),
        title,
        url,
        folderId: folderId || null,
        tags: normalizeTags(rawBookmark.tags),
        note: typeof rawBookmark.note === "string" ? rawBookmark.note.trim().slice(0, MAX_NOTE_LENGTH) : "",
        createdAt: Number.isFinite(rawBookmark.createdAt) ? rawBookmark.createdAt : now()
      });
      stats.bookmarksAdded += 1;
    };

    (data.folders || []).forEach((rawFolder) => {
      const name = rawFolder && typeof rawFolder.name === "string"
        ? rawFolder.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH)
        : "";
      const rawBookmarks = rawFolder && Array.isArray(rawFolder.bookmarks) ? rawFolder.bookmarks : [];
      if (!name) {
        stats.foldersSkippedInvalid += 1;
        stats.bookmarksSkippedInvalid += rawBookmarks.length;
        return;
      }
      const key = folderNameKey(name);
      let folder = folderByNameKey.get(key);
      if (folder) {
        stats.foldersReused += 1;
      } else {
        folder = { id: createId(), name };
        folders.push(folder);
        folderByNameKey.set(key, folder);
        stats.foldersAdded += 1;
      }
      rawBookmarks.forEach((rawBookmark) => importBookmark(rawBookmark, folder.id));
    });

    (data.bookmarks || []).forEach((rawBookmark) => importBookmark(rawBookmark, null));

    return { folders, bookmarks, stats };
  }

  const api = { EXPORT_FORMAT, EXPORT_VERSION, createExportData, validateBackup, mergeBackup };
  globalScope.UBookmarkBackup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

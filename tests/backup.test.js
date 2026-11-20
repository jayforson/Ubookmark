"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createExportData, mergeBackup, validateBackup } = require("../backup.js");

let nextId = 0;
const options = {
  createId: () => `new-${++nextId}`,
  now: () => 1700000000000
};

function sampleVault() {
  return {
    folders: [
      { id: "f-work", name: "Work" },
      { id: "f-empty", name: "Empty" }
    ],
    bookmarks: [
      { id: "b1", title: "Docs", url: "https://example.com/docs", folderId: "f-work", tags: ["work", "docs"], note: "Read me", createdAt: 111 },
      { id: "b2", title: "News", url: "https://news.example/", folderId: null, tags: [], note: "", createdAt: 222 },
      { id: "b3", title: "Mail", url: "https://mail.example/", folderId: "f-work", tags: [], note: "", createdAt: 333 }
    ]
  };
}

test("export then import into an empty vault round-trips folders, bookmarks, and order", () => {
  nextId = 0;
  const { folders, bookmarks } = sampleVault();
  const exported = createExportData(folders, bookmarks, "2026-01-01T00:00:00.000Z");

  assert.equal(exported.format, "ubookmark");
  assert.equal(exported.version, 1);
  assert.equal(exported.exportedAt, "2026-01-01T00:00:00.000Z");
  // Empty folders are preserved, root bookmarks stay at the root, ids are not exported.
  assert.deepEqual(exported.folders.map((folder) => folder.name), ["Work", "Empty"]);
  assert.deepEqual(exported.folders[0].bookmarks.map((bookmark) => bookmark.title), ["Docs", "Mail"]);
  assert.deepEqual(exported.folders[1].bookmarks, []);
  assert.deepEqual(exported.bookmarks.map((bookmark) => bookmark.title), ["News"]);
  assert.equal(JSON.stringify(exported).includes("f-work"), false);

  const merged = mergeBackup([], [], exported, options);
  assert.equal(merged.stats.bookmarksAdded, 3);
  assert.equal(merged.stats.foldersAdded, 2);
  assert.equal(merged.stats.bookmarksSkippedDuplicate, 0);

  // Re-exporting the merged vault yields the same file (apart from the timestamp).
  const reExported = createExportData(merged.folders, merged.bookmarks, exported.exportedAt);
  assert.deepEqual(reExported, exported);
});

test("import reuses an existing folder with the same name instead of duplicating it", () => {
  nextId = 0;
  const existing = sampleVault();
  const exported = createExportData(existing.folders, existing.bookmarks, "2026-01-01T00:00:00.000Z");
  // Same folder under different casing/spacing, plus one genuinely new bookmark.
  exported.folders[0].name = "  work ";
  exported.folders[0].bookmarks.push({ title: "Wiki", url: "https://wiki.example/", tags: [], note: "", createdAt: 444 });

  const merged = mergeBackup(existing.folders, existing.bookmarks, exported, options);
  assert.equal(merged.folders.length, 2);
  assert.equal(merged.stats.foldersAdded, 0);
  assert.ok(merged.stats.foldersReused >= 1);
  const workBookmarks = merged.bookmarks.filter((bookmark) => bookmark.folderId === "f-work");
  assert.deepEqual(workBookmarks.map((bookmark) => bookmark.title), ["Docs", "Mail", "Wiki"]);
});

test("import skips a bookmark whose URL already exists in the same folder, but allows it in another folder", () => {
  nextId = 0;
  const existing = sampleVault();
  const data = {
    format: "ubookmark",
    version: 1,
    folders: [
      // Same URL as "Docs", written without a scheme: still a duplicate in Work.
      { name: "Work", bookmarks: [{ title: "Docs copy", url: "example.com/docs", tags: [], note: "", createdAt: 1 }] },
      // The same URL in a different folder is a different bookmark and is kept.
      { name: "Reading", bookmarks: [{ title: "Docs again", url: "https://example.com/docs", tags: [], note: "", createdAt: 2 }] }
    ],
    // The same URL at the root is also a different scope and is kept.
    bookmarks: [{ title: "Docs at root", url: "https://example.com/docs", tags: [], note: "", createdAt: 3 }]
  };

  const merged = mergeBackup(existing.folders, existing.bookmarks, data, options);
  assert.equal(merged.stats.bookmarksSkippedDuplicate, 1);
  assert.equal(merged.stats.bookmarksAdded, 2);
  assert.equal(merged.bookmarks.filter((bookmark) => bookmark.url === "https://example.com/docs").length, 3);
  assert.equal(merged.bookmarks.some((bookmark) => bookmark.title === "Docs copy"), false);
});

test("import deduplicates repeated folders and bookmarks inside the file itself", () => {
  nextId = 0;
  const data = {
    format: "ubookmark",
    version: 1,
    folders: [
      { name: "Work", bookmarks: [{ title: "A", url: "https://a.example/", tags: [], note: "", createdAt: 1 }] },
      { name: "WORK", bookmarks: [
        { title: "A again", url: "https://a.example/", tags: [], note: "", createdAt: 2 },
        { title: "B", url: "https://b.example/", tags: [], note: "", createdAt: 3 }
      ] }
    ],
    bookmarks: []
  };

  const merged = mergeBackup([], [], data, options);
  assert.equal(merged.folders.length, 1);
  assert.deepEqual(merged.bookmarks.map((bookmark) => bookmark.title), ["A", "B"]);
  assert.equal(merged.stats.bookmarksSkippedDuplicate, 1);
});

test("re-importing the same export adds nothing the second time", () => {
  nextId = 0;
  const { folders, bookmarks } = sampleVault();
  const exported = createExportData(folders, bookmarks, "2026-01-01T00:00:00.000Z");
  const first = mergeBackup([], [], exported, options);
  const second = mergeBackup(first.folders, first.bookmarks, exported, options);
  assert.equal(second.stats.bookmarksAdded, 0);
  assert.equal(second.stats.foldersAdded, 0);
  assert.equal(second.stats.bookmarksSkippedDuplicate, 3);
  assert.deepEqual(second.folders, first.folders);
  assert.deepEqual(second.bookmarks, first.bookmarks);
});

test("invalid bookmarks are skipped without aborting valid ones, and tags are normalized", () => {
  nextId = 0;
  const data = {
    format: "ubookmark",
    version: 1,
    folders: [],
    bookmarks: [
      { title: "Good", url: "good.example", tags: [" Read ", "read", "Later"], note: " ok ", createdAt: "soon" },
      { title: "Unsafe", url: "javascript:alert(1)", tags: [], note: "", createdAt: 1 },
      { title: "", url: "https://no-title.example/", tags: [], note: "", createdAt: 1 },
      { title: "No URL", url: "  ", tags: [], note: "", createdAt: 1 },
      "not an object"
    ]
  };

  const merged = mergeBackup([], [], data, options);
  assert.equal(merged.stats.bookmarksAdded, 1);
  assert.equal(merged.stats.bookmarksSkippedInvalid, 4);
  const [good] = merged.bookmarks;
  assert.equal(good.url, "https://good.example/");
  assert.deepEqual(good.tags, ["Read", "Later"]);
  assert.equal(good.note, "ok");
  assert.equal(good.createdAt, 1700000000000);
});

test("a bookmark whose folder no longer exists is exported at the root instead of being lost", () => {
  const exported = createExportData([], [
    { id: "b9", title: "Orphan", url: "https://orphan.example/", folderId: "missing", tags: [], note: "", createdAt: 9 }
  ], "2026-01-01T00:00:00.000Z");
  assert.deepEqual(exported.bookmarks.map((bookmark) => bookmark.title), ["Orphan"]);
});

test("import generates fresh ids and does not mutate the existing vault", () => {
  nextId = 0;
  const existing = sampleVault();
  const snapshot = JSON.parse(JSON.stringify(existing));
  const exported = createExportData(existing.folders, existing.bookmarks, "2026-01-01T00:00:00.000Z");
  const merged = mergeBackup([], [], exported, options);
  assert.deepEqual(existing, snapshot);
  const ids = [...merged.folders.map((folder) => folder.id), ...merged.bookmarks.map((bookmark) => bookmark.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("new-")));
});

test("validateBackup rejects files that are not UBookmark exports", () => {
  assert.throws(() => validateBackup(null), /not a UBookmark export/i);
  assert.throws(() => validateBackup([]), /not a UBookmark export/i);
  assert.throws(() => validateBackup({ format: "other", version: 1, folders: [], bookmarks: [] }), /not a UBookmark export/i);
  assert.throws(() => validateBackup({ format: "ubookmark", version: 99, folders: [], bookmarks: [] }), /version/i);
  assert.throws(() => validateBackup({ format: "ubookmark", version: 1, folders: {} }), /folders/i);
  assert.throws(() => validateBackup({ format: "ubookmark", version: 1, bookmarks: "nope" }), /bookmarks/i);
  assert.throws(() => mergeBackup([], [], { format: "other" }, options), /not a UBookmark export/i);
  assert.doesNotThrow(() => validateBackup({ format: "ubookmark", version: 1, folders: [], bookmarks: [] }));
});

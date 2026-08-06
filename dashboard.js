const STORAGE_KEYS = {
  vault: "vaultCredentials",
  bookmarks: "bookmarks",
  folders: "folders",
  theme: "themeMode"
};

const elements = {
  setupView: document.querySelector("#setupView"),
  unlockView: document.querySelector("#unlockView"),
  appView: document.querySelector("#appView"),
  setupForm: document.querySelector("#setupForm"),
  unlockForm: document.querySelector("#unlockForm"),
  bookmarkForm: document.querySelector("#bookmarkForm"),
  passwordForm: document.querySelector("#passwordForm"),
  resetForm: document.querySelector("#resetForm"),
  setupPassword: document.querySelector("#setupPassword"),
  setupConfirm: document.querySelector("#setupConfirm"),
  unlockPassword: document.querySelector("#unlockPassword"),
  bookmarkTitle: document.querySelector("#bookmarkTitle"),
  bookmarkUrl: document.querySelector("#bookmarkUrl"),
  bookmarkTags: document.querySelector("#bookmarkTags"),
  bookmarkNote: document.querySelector("#bookmarkNote"),
  bookmarkSearch: document.querySelector("#bookmarkSearch"),
  currentPassword: document.querySelector("#currentPassword"),
  newPassword: document.querySelector("#newPassword"),
  newPasswordConfirm: document.querySelector("#newPasswordConfirm"),
  setupMessage: document.querySelector("#setupMessage"),
  unlockMessage: document.querySelector("#unlockMessage"),
  bookmarkMessage: document.querySelector("#bookmarkMessage"),
  passwordMessage: document.querySelector("#passwordMessage"),
  bookmarkCount: document.querySelector("#bookmarkCount"),
  emptyState: document.querySelector("#emptyState"),
  folderTree: document.querySelector("#folderTree"),
  createFolderButton: document.querySelector("#createFolderButton"),
  folderDialog: document.querySelector("#folderDialog"),
  folderDialogTitle: document.querySelector("#folderDialogTitle"),
  folderForm: document.querySelector("#folderForm"),
  folderName: document.querySelector("#folderName"),
  folderMessage: document.querySelector("#folderMessage"),
  saveFolderButton: document.querySelector("#saveFolderButton"),
  cancelFolderButton: document.querySelector("#cancelFolderButton"),
  importChromeButton: document.querySelector("#importChromeButton"),
  importDialog: document.querySelector("#importDialog"),
  importForm: document.querySelector("#importForm"),
  importTree: document.querySelector("#importTree"),
  importMessage: document.querySelector("#importMessage"),
  confirmImportButton: document.querySelector("#confirmImportButton"),
  cancelImportButton: document.querySelector("#cancelImportButton"),
  deleteFolderDialog: document.querySelector("#deleteFolderDialog"),
  deleteFolderDescription: document.querySelector("#deleteFolderDescription"),
  confirmDeleteFolderButton: document.querySelector("#confirmDeleteFolderButton"),
  cancelDeleteFolderButton: document.querySelector("#cancelDeleteFolderButton"),
  supportButton: document.querySelector("#supportButton"),
  supportDialog: document.querySelector("#supportDialog"),
  closeSupportButton: document.querySelector("#closeSupportButton"),
  themeModeButton: document.querySelector("#themeModeButton"),
  lockButton: document.querySelector("#lockButton"),
  passwordPanel: document.querySelector("#passwordPanel"),
  forgotPasswordButton: document.querySelector("#forgotPasswordButton"),
  resetDialog: document.querySelector("#resetDialog"),
  resetConfirmation: document.querySelector("#resetConfirmation"),
  resetMessage: document.querySelector("#resetMessage"),
  cancelResetButton: document.querySelector("#cancelResetButton"),
  showPasswordFormButton: document.querySelector("#showPasswordFormButton"),
  cancelPasswordButton: document.querySelector("#cancelPasswordButton")
};

let credentials = null;
let bookmarks = [];
let folders = [];
const expandedFolderIds = new Set();
let folderPendingDeletion = null;
let folderPendingRename = null;
let chromeBookmarkNodes = new Map();
let chromeBookmarkParentIds = new Map();
let authenticated = false;

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveHash(password, salt) {
  const passwordBytes = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(hash));
}

async function createCredentials(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToBase64(salt), hash: await deriveHash(password, salt) };
}

async function passwordMatches(password) {
  const calculatedHash = await deriveHash(password, base64ToBytes(credentials.salt));
  return calculatedHash === credentials.hash;
}

function setMessage(element, message = "", isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", Boolean(message) && !isError);
}

function showView(view) {
  elements.setupView.hidden = view !== "setup";
  elements.unlockView.hidden = view !== "unlock";
  elements.appView.hidden = view !== "app";
  const focusTarget = view === "setup" ? elements.setupPassword : view === "unlock" ? elements.unlockPassword : elements.bookmarkTitle;
  focusTarget.focus();
}

function closeResetDialog() {
  elements.resetForm.reset();
  setMessage(elements.resetMessage);
  elements.resetDialog.hidden = true;
}

function closeFolderDialog() {
  elements.folderForm.reset();
  setMessage(elements.folderMessage);
  elements.folderDialog.hidden = true;
  folderPendingRename = null;
  elements.folderDialogTitle.textContent = "Create a folder";
  elements.saveFolderButton.textContent = "Create folder";
}

function openFolderDialog(folder = null) {
  folderPendingRename = folder;
  elements.folderDialogTitle.textContent = folder ? "Rename folder" : "Create a folder";
  elements.saveFolderButton.textContent = folder ? "Save name" : "Create folder";
  elements.folderName.value = folder?.name || "";
  setMessage(elements.folderMessage);
  elements.folderDialog.hidden = false;
  elements.folderName.focus();
  if (folder) elements.folderName.select();
}

function closeImportDialog() {
  elements.importForm.reset();
  elements.importTree.replaceChildren();
  setMessage(elements.importMessage);
  elements.importDialog.hidden = true;
}

function closeDeleteFolderDialog() {
  folderPendingDeletion = null;
  elements.deleteFolderDialog.hidden = true;
}

function closeSupportDialog() {
  elements.supportDialog.hidden = true;
}

async function deleteFolder(folder, deleteBookmarks) {
  folders = folders.filter((item) => item.id !== folder.id);
  if (deleteBookmarks) bookmarks = bookmarks.filter((bookmark) => bookmark.folderId !== folder.id);
  else bookmarks = bookmarks.map((bookmark) => bookmark.folderId === folder.id ? { ...bookmark, folderId: null } : bookmark);
  expandedFolderIds.delete(folder.id);
  await storageSet({ [STORAGE_KEYS.folders]: folders, [STORAGE_KEYS.bookmarks]: bookmarks });
  renderFolders();
}

function renderImportTree(nodes, depth = 0, parentId = null) {
  const fragment = document.createDocumentFragment();
  nodes.forEach((node) => {
    if (!node.url && !node.children?.length) return;
    chromeBookmarkNodes.set(node.id, node);
    chromeBookmarkParentIds.set(node.id, parentId);
    const label = document.createElement("label");
    label.className = "import-tree-item";
    label.style.paddingInlineStart = `${depth * 1.15 + .2}rem`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "chromeBookmark";
    checkbox.value = node.id;
    const name = document.createElement("span");
    name.textContent = `${node.url ? "↗" : "▸"} ${node.title || node.url || "Untitled"}`;
    label.append(checkbox, name);
    fragment.append(label);
    if (node.children?.length) fragment.append(renderImportTree(node.children, depth + 1, node.id));
  });
  return fragment;
}

async function openImportDialog() {
  chromeBookmarkNodes = new Map();
  chromeBookmarkParentIds = new Map();
  elements.importTree.replaceChildren();
  setMessage(elements.importMessage, "Loading Chrome bookmarks…");
  elements.importDialog.hidden = false;
  try {
    const tree = await chrome.bookmarks.getTree();
    elements.importTree.replaceChildren(renderImportTree(tree.flatMap((root) => root.children || [])));
    setMessage(elements.importMessage);
  } catch {
    setMessage(elements.importMessage, "Chrome bookmarks could not be loaded. Reload the extension and allow bookmark access.", true);
  }
}

function createImportedFolder(name) {
  const baseName = name || "Imported folder";
  const names = new Set(folders.map((folder) => folder.name.toLocaleLowerCase()));
  let finalName = baseName;
  let number = 2;
  while (names.has(finalName.toLocaleLowerCase())) finalName = `${baseName} (${number++})`;
  const folder = { id: crypto.randomUUID(), name: finalName };
  folders.push(folder);
  return folder.id;
}

function importChromeNode(node, folderId = null) {
  if (node.url) {
    bookmarks.unshift({
      id: crypto.randomUUID(),
      title: node.title || node.url,
      url: node.url,
      folderId,
      tags: [],
      note: "",
      createdAt: Date.now()
    });
    return;
  }
  if (!node.children?.length) return;
  const importedFolderId = createImportedFolder(node.title);
  node.children.forEach((child) => importChromeNode(child, importedFolderId));
}

function hidePasswordForm() {
  elements.passwordForm.reset();
  elements.passwordForm.hidden = true;
  elements.passwordPanel.hidden = true;
  elements.showPasswordFormButton.hidden = false;
  setMessage(elements.passwordMessage);
}

function getAutoTheme() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode === "auto" ? getAutoTheme() : mode;
}

function updateThemeButton(mode) {
  const themeDetails = {
    auto: { icon: "◐", label: "Theme: automatic" },
    light: { icon: "☀", label: "Theme: light" },
    dark: { icon: "☾", label: "Theme: dark" }
  }[mode];
  elements.themeModeButton.textContent = themeDetails.icon;
  elements.themeModeButton.dataset.mode = mode;
  elements.themeModeButton.setAttribute("aria-label", `${themeDetails.label}. Click to change.`);
  elements.themeModeButton.title = `${themeDetails.label}. Click to change.`;
}

function normalizedUrl(value) {
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

function faviconFor(url) {
  try {
    const parsedUrl = new URL(url);
    return ["http:", "https:"].includes(parsedUrl.protocol) ? `${parsedUrl.origin}/favicon.ico` : "";
  } catch {
    return "";
  }
}

function matchesSearch(bookmark, searchTerm) {
  if (!searchTerm) return true;
  const searchableText = [
    bookmark.title,
    bookmark.url,
    bookmark.note || "",
    ...(bookmark.tags || [])
  ].join(" ").toLocaleLowerCase();
  return searchableText.includes(searchTerm);
}

function createBookmarkElement(bookmark) {
  const item = document.createElement("li");
  item.className = "bookmark-item";
  item.draggable = true;
  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", bookmark.id);
    item.classList.add("is-dragging");
  });
  item.addEventListener("dragend", () => item.classList.remove("is-dragging"));

  const link = document.createElement("a");
  link.className = "bookmark-link";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `Open ${bookmark.title} in a new tab`;

  const initial = document.createElement("span");
  initial.className = "site-initial";
  initial.textContent = bookmark.title.charAt(0).toUpperCase();

  const faviconUrl = faviconFor(bookmark.url);
  if (faviconUrl) {
    const favicon = document.createElement("img");
    favicon.className = "site-favicon";
    favicon.src = faviconUrl;
    favicon.alt = "";
    favicon.addEventListener("load", () => initial.replaceChildren(favicon), { once: true });
  }

  const labels = document.createElement("span");
  labels.className = "bookmark-labels";
  const title = document.createElement("strong");
  title.textContent = bookmark.title;
  const host = document.createElement("small");
  try {
    host.textContent = new URL(bookmark.url).hostname || bookmark.url;
  } catch {
    host.textContent = bookmark.url;
  }
  labels.append(title, host);
  if (bookmark.tags?.length) {
    const tags = document.createElement("span");
    tags.className = "bookmark-tags";
    tags.textContent = bookmark.tags.map((tag) => `#${tag}`).join("  ");
    labels.append(tags);
  }
  if (bookmark.note) {
    const note = document.createElement("small");
    note.className = "bookmark-note";
    note.textContent = bookmark.note;
    labels.append(note);
  }
  link.append(initial, labels);

  const removeButton = document.createElement("button");
  removeButton.className = "icon-button";
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", `Remove ${bookmark.title}`);
  removeButton.textContent = "×";
  removeButton.addEventListener("click", async () => {
    bookmarks = bookmarks.filter((itemToKeep) => itemToKeep.id !== bookmark.id);
    await storageSet({ [STORAGE_KEYS.bookmarks]: bookmarks });
    renderBookmarks();
    renderFolders();
  });

  item.append(link, removeButton);
  return item;
}

function renderBookmarks() {
  renderFolders();
}

async function moveBookmarkToFolder(bookmarkId, folderId) {
  bookmarks = bookmarks.map((bookmark) => bookmark.id === bookmarkId ? { ...bookmark, folderId } : bookmark);
  await storageSet({ [STORAGE_KEYS.bookmarks]: bookmarks });
  renderBookmarks();
  renderFolders();
}

function renderFolders() {
  const searchTerm = elements.bookmarkSearch.value.trim().toLocaleLowerCase();
  const visibleBookmarks = bookmarks.filter((bookmark) => matchesSearch(bookmark, searchTerm));
  const createBookmarkNode = (bookmark, isRootBookmark = false) => {
    const item = createBookmarkElement(bookmark);
    item.classList.add("tree-bookmark-item");
    if (isRootBookmark) item.classList.add("root-bookmark-item");
    item.setAttribute("role", "treeitem");
    return item;
  };

  const createFolderNode = (folder) => {
    const allFolderBookmarks = bookmarks.filter((bookmark) => bookmark.folderId === folder.id);
    const folderBookmarks = visibleBookmarks.filter((bookmark) => bookmark.folderId === folder.id);
    const isExpanded = expandedFolderIds.has(folder.id) || Boolean(searchTerm && folderBookmarks.length);
    const row = document.createElement("div");
    row.className = "folder-tree-row";
    row.setAttribute("role", "treeitem");
    row.tabIndex = 0;
    const label = document.createElement("button");
    label.className = "folder-select-button";
    label.type = "button";
    label.setAttribute("aria-expanded", String(isExpanded));
    label.textContent = `${isExpanded ? "▾" : "▸"} ${folder.name}`;
    const toggleFolder = () => {
      if (expandedFolderIds.has(folder.id)) expandedFolderIds.delete(folder.id);
      else expandedFolderIds.add(folder.id);
      renderFolders();
    };
    label.addEventListener("click", toggleFolder);
    label.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFolderDialog(folder);
    });
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") toggleFolder(); });
    row.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; row.classList.add("is-drop-target"); });
    row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.classList.remove("is-drop-target");
      const bookmarkId = event.dataTransfer.getData("text/plain");
      if (bookmarkId) await moveBookmarkToFolder(bookmarkId, folder.id);
    });
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = allFolderBookmarks.length;
    const openButton = document.createElement("button");
    openButton.className = "folder-open-button";
    openButton.type = "button";
    openButton.textContent = "Open all";
    openButton.disabled = allFolderBookmarks.length === 0;
    openButton.addEventListener("click", async () => {
      await Promise.all(allFolderBookmarks.map((bookmark) => chrome.tabs.create({ url: bookmark.url, active: false })));
    });
    const deleteButton = document.createElement("button");
    deleteButton.className = "folder-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete folder ${folder.name}`);
    deleteButton.addEventListener("click", async () => {
      if (allFolderBookmarks.length === 0) {
        await deleteFolder(folder, false);
        return;
      }
      folderPendingDeletion = folder;
      elements.deleteFolderDescription.textContent = `Deleting “${folder.name}” will permanently delete its ${allFolderBookmarks.length} ${allFolderBookmarks.length === 1 ? "bookmark" : "bookmarks"}. This cannot be undone.`;
      elements.deleteFolderDialog.hidden = false;
      elements.confirmDeleteFolderButton.focus();
    });
    row.append(label, count, openButton, deleteButton);
    const nodes = [row];
    if (isExpanded) nodes.push(...folderBookmarks.map((bookmark) => createBookmarkNode(bookmark)));
    return nodes;
  };

  const rootBookmarks = visibleBookmarks.filter((bookmark) => !bookmark.folderId);
  const nodes = [];
  folders.sort((left, right) => left.name.localeCompare(right.name)).forEach((folder) => {
    nodes.push(...createFolderNode(folder));
  });
  nodes.push(...rootBookmarks.map((bookmark) => createBookmarkNode(bookmark, true)));
  elements.folderTree.replaceChildren(...nodes);
  elements.emptyState.hidden = nodes.length > 0;
  elements.emptyState.querySelector("h3").textContent = searchTerm ? "No matching bookmarks" : "No bookmarks or folders yet";
  elements.emptyState.querySelector("p").textContent = searchTerm ? "Try another word from a title, URL, tag, or note." : "Create a folder or save a bookmark to get started.";
  elements.bookmarkCount.textContent = searchTerm ? `${visibleBookmarks.length} of ${bookmarks.length} shown` : `${bookmarks.length} saved`;
}

async function initialize() {
  const stored = await storageGet([STORAGE_KEYS.vault, STORAGE_KEYS.bookmarks, STORAGE_KEYS.folders, STORAGE_KEYS.theme]);
  credentials = stored[STORAGE_KEYS.vault] || null;
  bookmarks = Array.isArray(stored[STORAGE_KEYS.bookmarks]) ? stored[STORAGE_KEYS.bookmarks] : [];
  folders = Array.isArray(stored[STORAGE_KEYS.folders]) ? stored[STORAGE_KEYS.folders] : [];
  const legacyFolderNames = [...new Set(bookmarks.map((bookmark) => bookmark.folder?.trim()).filter(Boolean))];
  if (legacyFolderNames.length) {
    const folderIdByName = new Map(folders.map((folder) => [folder.name.toLocaleLowerCase(), folder.id]));
    legacyFolderNames.forEach((name) => {
      if (!folderIdByName.has(name.toLocaleLowerCase())) {
        const folder = { id: crypto.randomUUID(), name };
        folders.push(folder);
        folderIdByName.set(name.toLocaleLowerCase(), folder.id);
      }
    });
    bookmarks = bookmarks.map(({ folder, ...bookmark }) => ({ ...bookmark, folderId: bookmark.folderId || folderIdByName.get(folder?.trim().toLocaleLowerCase()) || null }));
    await storageSet({ [STORAGE_KEYS.bookmarks]: bookmarks, [STORAGE_KEYS.folders]: folders });
  }
  const themeMode = ["auto", "light", "dark"].includes(stored[STORAGE_KEYS.theme]) ? stored[STORAGE_KEYS.theme] : "auto";
  applyTheme(themeMode);
  updateThemeButton(themeMode);
  renderBookmarks();
  renderFolders();
  showView(credentials ? "unlock" : "setup");
}

elements.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = elements.setupPassword.value;
  if (password !== elements.setupConfirm.value) {
    setMessage(elements.setupMessage, "Passwords do not match.", true);
    return;
  }
  credentials = await createCredentials(password);
  await storageSet({ [STORAGE_KEYS.vault]: credentials, [STORAGE_KEYS.bookmarks]: bookmarks });
  elements.setupForm.reset();
  authenticated = true;
  showView("app");
});

elements.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (await passwordMatches(elements.unlockPassword.value)) {
    elements.unlockForm.reset();
    setMessage(elements.unlockMessage);
    authenticated = true;
    showView("app");
  } else {
    setMessage(elements.unlockMessage, "Incorrect password. Please try again.", true);
    elements.unlockPassword.select();
  }
});

elements.bookmarkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const url = normalizedUrl(elements.bookmarkUrl.value);
    const title = elements.bookmarkTitle.value.trim();
    if (!title) throw new Error("Enter a title for this bookmark.");
    const tags = elements.bookmarkTags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, allTags) => allTags.findIndex((existingTag) => existingTag.toLocaleLowerCase() === tag.toLocaleLowerCase()) === index);
    bookmarks.unshift({ id: crypto.randomUUID(), title, url, folderId: null, tags, note: elements.bookmarkNote.value.trim(), createdAt: Date.now() });
    await storageSet({ [STORAGE_KEYS.bookmarks]: bookmarks });
    elements.bookmarkForm.reset();
    setMessage(elements.bookmarkMessage, "Bookmark saved.");
    renderBookmarks();
    renderFolders();
    elements.bookmarkTitle.focus();
  } catch (error) {
    setMessage(elements.bookmarkMessage, error.message || "Enter a valid website address.", true);
  }
});

elements.bookmarkSearch.addEventListener("input", renderBookmarks);

elements.createFolderButton.addEventListener("click", () => {
  openFolderDialog();
});

elements.cancelFolderButton.addEventListener("click", closeFolderDialog);

elements.importChromeButton.addEventListener("click", openImportDialog);

elements.cancelImportButton.addEventListener("click", closeImportDialog);

elements.importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const checkedIds = [...elements.importForm.querySelectorAll('input[name="chromeBookmark"]:checked')].map((input) => input.value);
  const selectedIds = checkedIds.filter((id) => {
    let parentId = chromeBookmarkParentIds.get(id);
    while (parentId) {
      if (checkedIds.includes(parentId)) return false;
      parentId = chromeBookmarkParentIds.get(parentId);
    }
    return true;
  });
  if (!selectedIds.length) {
    setMessage(elements.importMessage, "Select at least one bookmark or folder to import.", true);
    return;
  }
  elements.confirmImportButton.disabled = true;
  try {
    selectedIds.forEach((id) => {
      const node = chromeBookmarkNodes.get(id);
      if (node) importChromeNode(node);
    });
    await storageSet({ [STORAGE_KEYS.bookmarks]: bookmarks, [STORAGE_KEYS.folders]: folders });
    closeImportDialog();
    renderFolders();
  } finally {
    elements.confirmImportButton.disabled = false;
  }
});

elements.folderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.folderName.value.trim();
  if (folders.some((folder) => folder.id !== folderPendingRename?.id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    setMessage(elements.folderMessage, "A folder with that name already exists.", true);
    return;
  }
  if (folderPendingRename) {
    folders = folders.map((folder) => folder.id === folderPendingRename.id ? { ...folder, name } : folder);
  } else {
    folders.push({ id: crypto.randomUUID(), name });
  }
  await storageSet({ [STORAGE_KEYS.folders]: folders });
  closeFolderDialog();
  renderFolders();
});

elements.cancelDeleteFolderButton.addEventListener("click", closeDeleteFolderDialog);

elements.supportButton.addEventListener("click", () => {
  elements.supportDialog.hidden = false;
  elements.closeSupportButton.focus();
});

elements.closeSupportButton.addEventListener("click", closeSupportDialog);

elements.confirmDeleteFolderButton.addEventListener("click", async () => {
  if (!folderPendingDeletion) return;
  const folder = folderPendingDeletion;
  closeDeleteFolderDialog();
  await deleteFolder(folder, true);
});

elements.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const newPassword = elements.newPassword.value;
  if (!(await passwordMatches(elements.currentPassword.value))) {
    setMessage(elements.passwordMessage, "The current password is incorrect.", true);
    return;
  }
  if (newPassword !== elements.newPasswordConfirm.value) {
    setMessage(elements.passwordMessage, "New passwords do not match.", true);
    return;
  }
  credentials = await createCredentials(newPassword);
  await storageSet({ [STORAGE_KEYS.vault]: credentials });
  elements.passwordForm.reset();
  setMessage(elements.passwordMessage, "Password updated successfully.");
});

elements.showPasswordFormButton.addEventListener("click", () => {
  elements.passwordPanel.hidden = false;
  elements.passwordForm.hidden = false;
  elements.showPasswordFormButton.hidden = true;
  elements.currentPassword.focus();
});

elements.cancelPasswordButton.addEventListener("click", hidePasswordForm);

elements.forgotPasswordButton.addEventListener("click", () => {
  elements.resetDialog.hidden = false;
  elements.resetConfirmation.focus();
});

elements.cancelResetButton.addEventListener("click", closeResetDialog);

elements.resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (elements.resetConfirmation.value.trim() !== "DELETE") {
    setMessage(elements.resetMessage, "Type DELETE exactly to confirm the reset.", true);
    elements.resetConfirmation.select();
    return;
  }

  await storageRemove([STORAGE_KEYS.vault, STORAGE_KEYS.bookmarks, STORAGE_KEYS.folders]);
  credentials = null;
  bookmarks = [];
  folders = [];
  authenticated = false;
  renderBookmarks();
  renderFolders();
  closeResetDialog();
  elements.unlockForm.reset();
  setMessage(elements.unlockMessage);
  showView("setup");
});

elements.themeModeButton.addEventListener("click", async () => {
  const modes = ["auto", "light", "dark"];
  const currentMode = modes.find((mode) => elements.themeModeButton.dataset.mode === mode) || "auto";
  const mode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
  applyTheme(mode);
  updateThemeButton(mode);
  await storageSet({ [STORAGE_KEYS.theme]: mode });
});

elements.lockButton.addEventListener("click", () => {
  authenticated = false;
  hidePasswordForm();
  elements.unlockForm.reset();
  setMessage(elements.unlockMessage);
  showView("unlock");
});

window.addEventListener("focus", () => {
  if (elements.themeModeButton.dataset.mode === "auto") applyTheme("auto");
});

initialize().catch(() => {
  setMessage(elements.unlockMessage, "Unable to open the vault. Please reload this page.", true);
  showView("unlock");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "STITCH_BOTH_TABS") {
    stitchBothTabs(msg.tabId, msg.layoutMode).catch(console.error);
  }
});

// Wait for a tab to finish loading after navigation
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Collect Bearish image URLs from the current page
async function collectBearUrls(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const imgs = Array.from(document.querySelectorAll("img[alt^='BEARISH #']"));
      return imgs
        .map(img => img.currentSrc || img.src)
        .filter(Boolean);
    }
  });
  return Array.isArray(result) ? result : [];
}

// Stitch provided URLs on the page (downloads PNG)
async function stitchFromUrls(tabId, urls, layoutMode) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (urls, layoutMode) => {
      const padding = 16;
      const bg = "#ffffff";
      const fitMode = "contain";

      function uniq(arr) {
        return Array.from(new Set(arr));
      }

      async function loadDrawable(src) {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${src}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const im = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = url;
        });

        return { im, url };
      }

      function drawFit(ctx, img, x, y, w, h) {
        const iw = img.width, ih = img.height;
        const scale = fitMode === "cover"
          ? Math.max(w / iw, h / ih)
          : Math.min(w / iw, h / ih);

        const dw = iw * scale;
        const dh = ih * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      const clean = uniq(urls);
      if (!clean.length) {
        alert("No bears found across both tabs. Please try again, and do not select the 'Include both tabs' button.");
        return;
      }

      // Load
      const loaded = [];
      for (const src of clean) {
        try {
          loaded.push(await loadDrawable(src));
        } catch (e) {
          console.warn("Failed to load", src, e);
        }
      }
      if (!loaded.length) {
        alert("Found bears, but could not load images for stitching.");
        return;
      }

      const n = loaded.length;

      // Layout choice:
      // - "square" => NxN perfect square grid
      // - "tight"  => minimal empty cells
      let cols, rows;
      if (layoutMode === "square") {
        const N = Math.ceil(Math.sqrt(n));
        cols = N; rows = N;
      } else {
        cols = Math.ceil(Math.sqrt(n));
        rows = Math.ceil(n / cols);
      }

      // Square tiles (keeps clean look)
      const tile = Math.max(...loaded.map(x => Math.max(x.im.width, x.im.height)));

      const canvasW = cols * tile + (cols + 1) * padding;
      const canvasH = rows * tile + (rows + 1) * padding;

      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvasW, canvasH);

      for (let i = 0; i < loaded.length; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = padding + c * (tile + padding);
        const y = padding + r * (tile + padding);
        drawFit(ctx, loaded[i].im, x, y, tile, tile);
      }

      for (const { url } of loaded) URL.revokeObjectURL(url);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = layoutMode === "square"
        ? "bearish-both-tabs-perfect-square.png"
        : "bearish-both-tabs-tight-grid.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    args: [urls, layoutMode]
  });
}

async function stitchBothTabs(tabId, layoutMode) {
  // Remember where the user was
  const tab = await chrome.tabs.get(tabId);
  const originalUrl = tab.url || "";

  // Always use these two URLs
  const denUrl = "https://www.bearish.af/den";
  const hibUrl = "https://www.bearish.af/den?tab=hibernate";

  // Navigate to /den, collect
  await chrome.tabs.update(tabId, { url: denUrl });
  await waitForTabComplete(tabId);
  const urlsA = await collectBearUrls(tabId);

  // Navigate to hibernate, collect
  await chrome.tabs.update(tabId, { url: hibUrl });
  await waitForTabComplete(tabId);
  const urlsB = await collectBearUrls(tabId);

  // Combine, dedupe
  const all = [...urlsA, ...urlsB];

  // Stitch on whichever page we’re currently on (hibernate)
  await stitchFromUrls(tabId, all, layoutMode);

  // Optional: return user to where they started
  if (originalUrl && originalUrl.startsWith("https://www.bearish.af/")) {
    chrome.tabs.update(tabId, { url: originalUrl }).catch(() => {});
  }
}

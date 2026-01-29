// content.js
(async () => {
  try {
    const imgSelector = "img[alt^='BEARISH #']";
    const padding = 16;
    const bg = "#ffffff";
    const fitMode = "contain";
    const maxImages = 800;

    // Read layout mode from extension storage (set by popup)
    const layoutMode = await new Promise((resolve) => {
      chrome.storage.local.get(["bearish_layout_mode"], (res) => {
        resolve(res?.bearish_layout_mode || "tight"); // "tight" or "square"
      });
    });

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await sleep(700); // small settle for lazy images

    const imgs = Array.from(document.querySelectorAll(imgSelector))
      .filter(img => img?.naturalWidth > 0 && img?.naturalHeight > 0)
      .slice(0, maxImages);

    if (!imgs.length) {
      alert("No BEARISH images found on this page.");
      return;
    }

    // Load images as blobs
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

    const loaded = [];
    for (const img of imgs) {
      const src = img.currentSrc || img.src;
      try {
        loaded.push(await loadDrawable(src));
      } catch (e) {
        console.warn("Failed to load", src, e);
      }
    }

    if (!loaded.length) {
      alert("Images were found, but none could be loaded for stitching.");
      return;
    }

    const n = loaded.length;

    // Decide grid dims
    let cols, rows;
    if (layoutMode === "square") {
      const N = Math.ceil(Math.sqrt(n));
      cols = N;
      rows = N;
    } else {
      cols = Math.ceil(Math.sqrt(n));
      rows = Math.ceil(n / cols);
    }

    // Use square tiles based on max dimension
    const tile = Math.max(...loaded.map(x => Math.max(x.im.width, x.im.height)));

    const canvasW = cols * tile + (cols + 1) * padding;
    const canvasH = rows * tile + (rows + 1) * padding;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    function drawFit(img, x, y, w, h) {
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

    for (let i = 0; i < loaded.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = padding + c * (tile + padding);
      const y = padding + r * (tile + padding);
      drawFit(loaded[i].im, x, y, tile, tile);
    }

    for (const { url } of loaded) URL.revokeObjectURL(url);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = layoutMode === "square"
      ? "bearish-stitched-perfect-square.png"
      : "bearish-stitched-tight-grid.png";
    document.body.appendChild(a);
    a.click();
    a.remove();

  } catch (e) {
    console.error(e);
    alert("Stitch failed: " + (e?.message || e));
  }
})();

const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
const openBtn = document.getElementById("open");
const hintEl = document.getElementById("hint");
const optionsWrap = document.getElementById("optionsWrap");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `msg ${kind}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isBearish(url) {
  try {
    return new URL(url).origin === "https://www.bearish.af";
  } catch {
    return false;
  }
}

function isDen(url) {
  try {
    const u = new URL(url);
    return u.origin === "https://www.bearish.af" && u.pathname === "/den";
  } catch {
    return false;
  }
}

async function goToDen(tab, mode = "mybears") {
  const url =
    mode === "hibernate"
      ? "https://www.bearish.af/den?tab=hibernate"
      : "https://www.bearish.af/den";

  await chrome.tabs.update(tab.id, { url });
  window.close();
}

async function inspectDenState(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ bearCount: document.querySelectorAll("img[alt^='BEARISH #']").length })
  });
  return result || { bearCount: 0 };
}

async function runStitch(tabId) {
  const selected = document.querySelector("input[name='layout']:checked");
  const layoutMode = selected ? selected.value : "tight";
  const includeBoth = document.getElementById("bothTabs")?.checked === true;

  if (!includeBoth) {
    await chrome.storage.local.set({ bearish_layout_mode: layoutMode });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    window.close();
    return;
  }

  chrome.runtime.sendMessage({ type: "STITCH_BOTH_TABS", tabId, layoutMode });
  window.close();
}

(async () => {
  try {
    const tab = await getActiveTab();
    const url = tab?.url || "";

    // Default: hide options until we confirm /den
    optionsWrap.style.display = "none";
    runBtn.style.display = "none";
    openBtn.style.display = "none";
    hintEl.textContent = "";

    // Not on bearish.af → only show open button
    if (!isBearish(url)) {
      setStatus("You’re not on bearish.af.", "warn");
      openBtn.style.display = "block";
      openBtn.textContent = "Open My Bears (/den)";
      hintEl.textContent = "Go to your Den page first and click the Stitcher again.";
      openBtn.onclick = () => goToDen(tab, "mybears");
      return;
    }

    // On bearish.af but not /den → only show open button
    if (!isDen(url)) {
      setStatus("Open your Den first (/den).", "warn");
      openBtn.style.display = "block";
      openBtn.textContent = "Open My Bears (/den)";
      hintEl.textContent = "Then you’ll see stitch options here.";
      openBtn.onclick = () => goToDen(tab, "mybears");
      return;
    }

    // On /den → show options
    optionsWrap.style.display = "block";
    setStatus("Checking your Den…");

    const { bearCount } = await inspectDenState(tab.id);

    if (bearCount === 0) {
      setStatus("No bears found in this tab.", "warn");
      openBtn.style.display = "block";
      openBtn.textContent = "Switch tab";
      hintEl.textContent = "Try My Bears or Hibernating.";

      openBtn.onclick = async () => {
        const u = new URL(url);
        const isHibernate = u.searchParams.get("tab") === "hibernate";
        await goToDen(tab, isHibernate ? "mybears" : "hibernate");
      };
      return;
    }

    setStatus(`Found ${bearCount} bears ✅ Ready to stitch.`, "ok");
    openBtn.style.display = "block";
    openBtn.textContent = "Switch tab";
    runBtn.style.display = "block";
    hintEl.textContent = "Stitch will grab whatever bears are currently shown.";

    runBtn.onclick = () => runStitch(tab.id);
    openBtn.onclick = async () => {
      const u = new URL(url);
      const isHibernate = u.searchParams.get("tab") === "hibernate";
      await goToDen(tab, isHibernate ? "mybears" : "hibernate");
    };
  } catch (e) {
    console.error(e);
    optionsWrap.style.display = "none";
    runBtn.style.display = "none";
    openBtn.style.display = "block";
    setStatus("Something went wrong.", "warn");
    hintEl.textContent = "Try reloading the Den page and the extension.";
  }
})();

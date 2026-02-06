(() => {
  // Safe element getter by id
  const $ = (id) => document.getElementById(id) || null;

  // Grab elements (may be null if HTML changed)
  const locEl = $("loc");
  const checkBtn = $("checkBtn");
  const shareBtn = $("shareBtn");
  const results = $("results");
  const headline = $("headline");
  const whereWhen = $("whereWhen");
  const badge = $("badge");
  const nowSummary = $("nowSummary");
  const nowReasons = $("nowReasons");
  const nextSummary = $("nextSummary");
  const nextWindow = $("nextWindow");
  const thresholds = $("thresholds");
  const coffeeLink = $("coffeeLink");

  // If essential elements are missing, do not crash.
  // This prevents "button not working" caused by early JS exceptions.
  if (!locEl || !checkBtn) {
    console.error("Missing required elements: loc and/or checkBtn. Check your public/index.html IDs.");
    return;
  }

  // Optional elements: guard before use
  if (coffeeLink) {
    // Replace with your real link
    coffeeLink.href = "https://www.buymeacoffee.com/";
    coffeeLink.target = "_blank";
    coffeeLink.rel = "noopener noreferrer";
  }

  let task = "paint";

  function setTask(next) {
    task = next;
    document.querySelectorAll(".segbtn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.task === next);
    });
  }

  // Segmented buttons are optional; no crash if missing
  document.querySelectorAll(".segbtn").forEach((btn) => {
    btn.addEventListener("click", () => setTask(btn.dataset.task));
  });

  function fmt(dtIso) {
    if (!dtIso) return "";
    const d = new Date(dtIso);
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function setBadge(go, risk) {
    if (!badge) return;
    badge.className = "badge";
    const r = (risk || "medium").toUpperCase();

    if (go) {
      badge.textContent = `GO · ${r} RISK`;
      badge.classList.add("good");
    } else {
      badge.textContent = `NO-GO · ${r} RISK`;
      badge.classList.add((risk || "medium") === "high" ? "bad" : "warn");
    }
  }

  function renderReasons(list) {
    if (!nowReasons) return;
    nowReasons.innerHTML = "";

    if (!list || list.length === 0) {
      const li = document.createElement("li");
      li.textContent = "All thresholds are satisfied for the work window and curing buffer.";
      nowReasons.appendChild(li);
      return;
    }

    list.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r.message || String(r);
      nowReasons.appendChild(li);
    });
  }

  function getErrorMessage(data, fallback) {
    // Supports:
    // - old shape: { error: "..." }
    // - new shape: { error: { message: "...", hint: "..."} }
    const e = data?.error;
    if (!e) return fallback;

    if (typeof e === "string") return e;

    if (typeof e === "object") {
      const msg = e.message || fallback;
      const hint = e.hint ? ` ${e.hint}` : "";
      return (msg + hint).trim();
    }

    return fallback;
  }

  async function run() {
    const loc = locEl.value.trim();
    if (!loc) {
      alert("Enter a ZIP or City.");
      return;
    }

    checkBtn.disabled = true;
    const originalBtnText = checkBtn.textContent;
    checkBtn.textContent = "Checking…";

    try {
      const url = `/api/forecast?task=${encodeURIComponent(task)}&loc=${encodeURIComponent(loc)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Request failed"));
      }

      if (headline) headline.textContent = `${data?.thresholds?.label || ""}`;

      if (whereWhen) {
        const name = data?.location?.name || "";
        const admin1 = data?.location?.admin1 ? `, ${data.location.admin1}` : "";
        const country = data?.location?.country ? `, ${data.location.country}` : "";
        const evaluated = data?.now?.start ? ` · Evaluated from ${fmt(data.now.start)}` : "";
        whereWhen.textContent = `${name}${admin1}${country}${evaluated}`;
      }

      setBadge(!!data?.now?.go, data?.now?.risk);

      if (nowSummary) nowSummary.textContent = data?.now?.summary || "";
      renderReasons(data?.now?.reasons);

      if (nextSummary) nextSummary.textContent = data?.next_window?.summary || "";

      if (nextWindow) {
        nextWindow.textContent = data?.next_window?.start
          ? `Best window: ${fmt(data.next_window.start)} to ${fmt(data.next_window.end)} (${data.next_window.duration_hours}h)`
          : "No safe window found in the next few days.";
      }

      if (thresholds) thresholds.textContent = JSON.stringify(data?.thresholds || {}, null, 2);

      if (results) {
        results.hidden = false;
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = originalBtnText || "Check Conditions";
    }
  }

  checkBtn.addEventListener("click", run);

  locEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });

  // Share button is optional
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const loc = locEl.value.trim();
      if (!loc) {
        alert("Enter a location first.");
        return;
      }
      const shareUrl = `${location.origin}/?task=${encodeURIComponent(task)}&loc=${encodeURIComponent(loc)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        shareBtn.textContent = "Copied";
        setTimeout(() => (shareBtn.textContent = "Copy Share Link"), 900);
      } catch {
        prompt("Copy link:", shareUrl);
      }
    });
  }

  // Auto-fill from query string
  const params = new URLSearchParams(location.search);
  const qTask = params.get("task");
  const qLoc = params.get("loc");
  if (qTask === "paint" || qTask === "stain") setTask(qTask);
  if (qLoc) locEl.value = qLoc;
})();


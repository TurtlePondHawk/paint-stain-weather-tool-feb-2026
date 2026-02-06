(() => {
  const $ = (id) => document.getElementById(id);

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

  // Replace with your real link later:
  coffeeLink.href = "https://www.buymeacoffee.com/";

  let task = "paint";

  function setTask(next) {
    task = next;
    document.querySelectorAll(".segbtn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.task === next);
    });
  }

  document.querySelectorAll(".segbtn").forEach(btn => {
    btn.addEventListener("click", () => setTask(btn.dataset.task));
  });

  function fmt(dtIso) {
    if (!dtIso) return "";
    const d = new Date(dtIso);
    return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function setBadge(go, risk) {
    badge.className = "badge";
    if (go) {
      badge.textContent = `GO · ${risk.toUpperCase()} RISK`;
      badge.classList.add("good");
    } else {
      badge.textContent = `NO-GO · ${risk.toUpperCase()} RISK`;
      badge.classList.add(risk === "high" ? "bad" : "warn");
    }
  }

  function renderReasons(list) {
    nowReasons.innerHTML = "";
    if (!list || list.length === 0) {
      const li = document.createElement("li");
      li.textContent = "All thresholds are satisfied for the work window and curing buffer.";
      nowReasons.appendChild(li);
      return;
    }
    list.forEach(r => {
      const li = document.createElement("li");
      li.textContent = r.message;
      nowReasons.appendChild(li);
    });
  }

  async function run() {
    const loc = locEl.value.trim();
    if (!loc) {
      alert("Enter a ZIP or City.");
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = "Checking…";

    try {
      const url = `/api/forecast?task=${encodeURIComponent(task)}&loc=${encodeURIComponent(loc)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");

      headline.textContent = `${data.thresholds.label}`;
      whereWhen.textContent = `${data.location.name}${data.location.admin1 ? ", " + data.location.admin1 : ""}${data.location.country ? ", " + data.location.country : ""} · Evaluated from ${fmt(data.now.start)}`;

      setBadge(data.now.go, data.now.risk);
      nowSummary.textContent = data.now.summary;
      renderReasons(data.now.reasons);

      nextSummary.textContent = data.next_window.summary || "";
      nextWindow.textContent = data.next_window.start
        ? `Best window: ${fmt(data.next_window.start)} to ${fmt(data.next_window.end)} (${data.next_window.duration_hours}h)`
        : "No safe window found in the next few days.";

      thresholds.textContent = JSON.stringify(data.thresholds, null, 2);

      results.hidden = false;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = "Check Conditions";
    }
  }

  checkBtn.addEventListener("click", run);
  locEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });

  shareBtn.addEventListener("click", async () => {
    const loc = locEl.value.trim();
    if (!loc) { alert("Enter a location first."); return; }
    const shareUrl = `${location.origin}/?task=${encodeURIComponent(task)}&loc=${encodeURIComponent(loc)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareBtn.textContent = "Copied";
      setTimeout(() => shareBtn.textContent = "Copy Share Link", 900);
    } catch {
      prompt("Copy link:", shareUrl);
    }
  });

  // Auto-fill from query string
  const params = new URLSearchParams(location.search);
  const qTask = params.get("task");
  const qLoc = params.get("loc");
  if (qTask === "paint" || qTask === "stain") setTask(qTask);
  if (qLoc) locEl.value = qLoc;
})();

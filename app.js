(function () {
  "use strict";

  /* ================= Setup ================= */
  const $ = (id) => document.getElementById(id);
  const cfg = window.STUDYFLOW_CONFIG || {};
  const LOCAL_KEY = "floxovo.v1";
  const THEME_KEY = "floxovo.theme";
  const MAX_FILE_MB = 10;
  const MAX_SOURCE_CHARS = 50000;
  const MAX_PDF_PAGES = 100;
  const STOP = new Set(("the a an and or of to in on for with is are was were be by as at from that this it its " +
    "into their they them which who have has had can will").split(" "));

  const configured = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/YOUR-/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  let user = null;                                   // signed-in Supabase user, or null (local mode)
  let db = { sets: [], progress: { quizRight: 0, quizTotal: 0 } };
  let activeSet = null;
  let current = null;                                // flashcard currently shown
  let authMode = "signin";
  const chatHistory = [];

  /* ================= Small helpers ================= */
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function el(tag, text, className) {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function toast(msg) {
    const t = el("div", msg, "toast");
    $("toastZone").appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#5b5ce2", "#ff8a5b", "#2fa36b", "#ffd166", "#ef476f"];
    for (let i = 0; i < 40; i++) {
      const c = el("div", null, "confetti");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function errText(err) {
    return (err && err.message) ? err.message : "Something went wrong. Please try again.";
  }

  /* ================= Theme (syncs with the device) ================= */
  const themeBtn = $("themeBtn");
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    themeBtn.textContent = dark ? "☀️" : "🌙";
  }
  function isDarkNow() {
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "dark" || (!attr && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  let themePref = "system";
  try { themePref = localStorage.getItem(THEME_KEY) || "system"; } catch (e) { /* storage blocked */ }
  applyTheme(themePref);
  themeBtn.onclick = () => {
    themePref = isDarkNow() ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, themePref); } catch (e) { /* ignore */ }
    applyTheme(themePref);
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themePref === "system") applyTheme("system");
  });

  /* ================= Navigation ================= */
  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    document.querySelectorAll("nav button").forEach(b => {
      if (b.dataset.view === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (name === "library") renderLibrary();
    if (name === "progress") renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("nav button").forEach(b => b.onclick = () => showView(b.dataset.view));

  /* ================= Content generation (runs in the browser) ================= */
  function sentences(text) {
    return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);
  }
  function paragraphs(text) {
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  function makeCards(text) {
    const out = [];
    sentences(text).forEach(s => {
      const m = s.match(/^([^:]{2,60}):\s*(.+)$/);
      if (m) out.push({ q: m[1].trim(), a: m[2].trim(), box: 1 });
    });
    return out;
  }
  function makeQuiz(text) {
    const items = [];
    sentences(text).forEach(s => {
      const words = s.split(" ").map((w, i) => ({ i, clean: w.replace(/[^A-Za-z]/g, "") }))
        .filter(x => x.clean.length >= 5 && !STOP.has(x.clean.toLowerCase()));
      if (!words.length) return;
      const pick = words.slice().sort((a, b) => b.clean.length - a.clean.length)[0];
      const prompt = s.split(" ").map((w, i) => i === pick.i ? "_____" : w).join(" ");
      items.push({ prompt, answer: pick.clean });
    });
    return items.slice(0, 15);
  }
  function makeNotes(text) {
    return paragraphs(text).map(p => {
      const ss = sentences(p);
      return ss.length ? { heading: ss[0], points: ss.slice(1) } : null;
    }).filter(Boolean);
  }
  function buildSet(title, source) {
    const clean = source.slice(0, MAX_SOURCE_CHARS);
    return {
      id: newId(),
      title: (title || clean.split(/\s+/).slice(0, 6).join(" ") || "Untitled").slice(0, 120),
      source: clean,
      created: new Date().toISOString(),
      cards: makeCards(clean),
      quiz: makeQuiz(clean),
      notes: makeNotes(clean)
    };
  }

  /* ================= Storage: local (guest) or cloud (signed in) ================= */
  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { sets: Array.isArray(d.sets) ? d.sets : [], progress: d.progress || { quizRight: 0, quizTotal: 0 } };
      }
    } catch (e) { /* corrupt data: start fresh */ }
    return { sets: [], progress: { quizRight: 0, quizTotal: 0 } };
  }
  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); } catch (e) { toast("Could not save on this device."); }
  }
  async function loadCloud() {
    const [setsRes, progRes] = await Promise.all([
      sb.from("study_sets").select("id,title,source,data,created_at").order("created_at", { ascending: false }),
      sb.from("progress").select("quiz_right,quiz_total").maybeSingle()
    ]);
    if (setsRes.error) throw setsRes.error;
    if (progRes.error) throw progRes.error;
    db.sets = setsRes.data.map(r => ({
      id: r.id, title: r.title, source: r.source, created: r.created_at,
      cards: r.data.cards || [], quiz: r.data.quiz || [], notes: r.data.notes || []
    }));
    db.progress = progRes.data
      ? { quizRight: progRes.data.quiz_right, quizTotal: progRes.data.quiz_total }
      : { quizRight: 0, quizTotal: 0 };
  }
  async function persistSet(set) {
    if (!user) return saveLocal();
    const { error } = await sb.from("study_sets").upsert({
      id: set.id,
      user_id: user.id,
      title: set.title,
      source: set.source,
      data: { cards: set.cards, quiz: set.quiz, notes: set.notes }
    });
    if (error) throw error;
  }
  async function removeSet(id) {
    if (user) {
      const { error } = await sb.from("study_sets").delete().eq("id", id);
      if (error) throw error;
    }
    db.sets = db.sets.filter(s => s.id !== id);
    if (!user) saveLocal();
  }
  async function persistProgress() {
    if (!user) return saveLocal();
    const { error } = await sb.from("progress").upsert({
      user_id: user.id,
      quiz_right: db.progress.quizRight,
      quiz_total: db.progress.quizTotal
    });
    if (error) console.error("Progress sync failed:", error.message);
  }

  /* Saves a set, showing a friendly message if it fails. */
  async function saveSet(set) {
    try { await persistSet(set); }
    catch (err) { toast("Couldn't sync that change: " + errText(err)); }
  }

  /* ================= Sign-in state ================= */
  function setSyncStatus(text) { $("syncStatus").textContent = text; }

  async function onSignedIn(session) {
    user = session.user;
    // Move any sets made in guest mode into the account, once.
    const legacy = readLocal();
    if (legacy.sets.length) {
      for (const s of legacy.sets) {
        try { await persistSet(s); } catch (e) { console.error(e); }
      }
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
      toast("Your guest sets were saved to your account");
    }
    await loadCloud();
    setSyncStatus("Synced to your account");
  }
  function onSignedOut() {
    user = null;
    db = readLocal();
    setSyncStatus(configured ? "Guest mode: saved on this device" : "Local mode: saved on this device");
  }
  function renderAccount() {
    const btn = $("accountBtn");
    if (!configured) { btn.textContent = "Local mode"; btn.onclick = () => toast("Accounts aren't connected yet. See SETUP.md."); return; }
    if (user) {
      btn.textContent = "Sign out";
      btn.onclick = async () => {
        if (!confirm("Sign out of Floxovo?")) return;
        const { error } = await sb.auth.signOut();
        if (error) toast(errText(error));
      };
    } else {
      btn.textContent = "Sign in";
      btn.onclick = () => openAuth("signin");
    }
  }
  function renderAll() {
    renderAccount();
    renderLibrary();
    renderProgress();
  }

  /* ================= Auth modal ================= */
  const modal = $("authModal");
  function openAuth(mode) {
    modal.classList.add("open");
    const recovering = mode === "recover";
    $("authLogin").classList.toggle("hidden", recovering);
    $("recoverForm").classList.toggle("hidden", !recovering);
    if (!recovering) setAuthMode(mode || "signin");
    $("authMsg").textContent = "";
    $("googleBtn").classList.toggle("hidden", !configured);
    $("forgotBtn").classList.toggle("hidden", !configured);
    setTimeout(() => (recovering ? $("newPassword") : $("authEmail")).focus(), 50);
  }
  function closeAuth() { modal.classList.remove("open"); }
  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    $("tabSignin").setAttribute("aria-selected", String(!signup));
    $("tabSignup").setAttribute("aria-selected", String(signup));
    $("authSubmit").textContent = signup ? "Create account" : "Sign in";
    $("authTitle").textContent = signup ? "Join Floxovo 🎒" : "Welcome back 👋";
    $("authPassword").autocomplete = signup ? "new-password" : "current-password";
    $("ageRow").classList.toggle("hidden", !signup);
    $("ageCheck").required = signup;
  }
  function showAuthMsg(text) { $("authMsg").textContent = text; }

  $("authClose").onclick = closeAuth;
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAuth(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAuth(); });
  $("tabSignin").onclick = () => setAuthMode("signin");
  $("tabSignup").onclick = () => setAuthMode("signup");
  $("accountBtn").onclick = () => { if (!user) openAuth("signin"); };

  $("authForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!sb) return showAuthMsg("Accounts aren't connected yet. See SETUP.md.");
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (password.length < 8) return showAuthMsg("Use at least 8 characters for your password.");
    try {
      if (authMode === "signup") {
        if (!$("ageCheck").checked) return showAuthMsg("Please confirm the age statement to create an account.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/app.html" } });
        if (error) throw error;
        showAuthMsg(data.session ? "Account created. You're signed in!"
          : "Almost there! Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuth();
      }
    } catch (err) { showAuthMsg(errText(err)); }
  };

  $("googleBtn").onclick = async () => {
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + "/app.html" }
    });
    if (error) showAuthMsg(errText(error));
  };

  $("forgotBtn").onclick = async () => {
    if (!sb) return;
    const email = $("authEmail").value.trim();
    if (!email) return showAuthMsg("Type your email above first, then tap Forgot password again.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/app.html" });
    showAuthMsg(error ? errText(error) : "If that email has an account, a reset link is on its way.");
  };

  $("recoverForm").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("newPassword").value });
    if (error) return toast(errText(error));
    toast("Password saved! Welcome back.");
    $("newPassword").value = "";
    closeAuth();
  };

  /* ================= Library ================= */
  function renderLibrary() {
    const list = $("setList");
    list.innerHTML = "";
    if (!db.sets.length) {
      list.append(el("p", "No study sets yet. Upload or paste something on Home to create one.", "muted"));
      return;
    }
    db.sets.forEach(s => {
      const card = el("div", null, "card set-item");
      const h = el("h3", s.title);
      const meta = el("div",
        `${s.cards.length} flashcards · ${s.quiz.length} quiz questions · ${s.notes.length} note sections`, "muted");
      const row = el("div", null, "row");
      row.style.marginTop = "12px";
      const open = el("button", "Open");
      open.onclick = () => openSet(s.id);
      const del = el("button", "Delete", "soft");
      del.onclick = async () => {
        if (!confirm(`Delete "${s.title}"? This can't be undone.`)) return;
        try { await removeSet(s.id); renderLibrary(); renderProgress(); toast("Study set deleted"); }
        catch (err) { toast(errText(err)); }
      };
      row.append(open, del);
      card.append(h, meta, row);
      list.append(card);
    });
  }

  function openSet(id) {
    activeSet = db.sets.find(s => s.id === id) || null;
    if (!activeSet) return toast("That study set could not be found.");
    $("studyTitle").textContent = activeSet.title;
    showView("study");
    showMode(activeSet.cards.length ? "cards" : "quiz");
  }

  /* ================= Flashcards (Leitner boxes) ================= */
  function nextCard() {
    if (!activeSet || !activeSet.cards.length) return null;
    const cards = activeSet.cards;
    const minBox = Math.min(...cards.map(c => c.box));
    const pool = cards.filter(c => c.box <= minBox + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function showCard() {
    $("flip").classList.remove("is-flipped");
    current = nextCard();
    const has = !!current;
    $("wrongBtn").disabled = !has;
    $("rightBtn").disabled = !has;
    if (!has) {
      $("frontFace").textContent = activeSet ? "No flashcards in this set. Use the format Term: definition." : "Open a study set from your Library";
      $("backFace").textContent = "";
      $("cardBox").textContent = "Box 1";
      $("cardCount").textContent = "";
      return;
    }
    $("frontFace").textContent = current.q;
    $("backFace").textContent = current.a;
    $("cardBox").textContent = "Box " + current.box;
    const mastered = activeSet.cards.filter(c => c.box >= 4).length;
    $("cardCount").textContent = mastered + " of " + activeSet.cards.length + " mastered";
  }
  async function grade(correct) {
    if (!current || !activeSet) return;
    current.box = correct ? Math.min(5, current.box + 1) : 1;
    if (correct && current.box >= 4) confetti();
    showCard();
    await saveSet(activeSet);
  }
  function flipCard() { if (current) $("flip").classList.toggle("is-flipped"); }
  $("flip").onclick = flipCard;
  $("flip").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipCard(); } };
  $("rightBtn").onclick = () => grade(true);
  $("wrongBtn").onclick = () => grade(false);

  /* ================= Quiz ================= */
  function updateQuizScore() {
    const p = db.progress;
    $("quizScore").textContent = p.quizTotal ? "Overall: " + Math.round(100 * p.quizRight / p.quizTotal) + "%" : "";
  }
  function renderQuiz() {
    const area = $("quizArea");
    area.innerHTML = "";
    if (!activeSet || !activeSet.quiz.length) {
      area.append(el("p", "No quiz questions in this set yet.", "muted"));
      updateQuizScore();
      return;
    }
    activeSet.quiz.forEach((q, i) => {
      const row = el("div", null, "q");
      const label = el("div", (i + 1) + ". " + q.prompt);
      label.style.fontWeight = "700";
      const line = el("div", null, "row");
      line.style.marginTop = "8px";
      const input = el("input");
      input.type = "text";
      input.placeholder = "Type the missing word";
      input.setAttribute("aria-label", "Answer for question " + (i + 1));
      input.style.maxWidth = "280px";
      const check = el("button", "Check", "soft");
      const fb = el("span", null, "feedback");
      check.onclick = async () => {
        if (row.dataset.done) return;
        const ok = input.value.trim().toLowerCase() === q.answer.toLowerCase();
        row.dataset.done = "1";
        input.disabled = true; check.disabled = true;
        fb.classList.add(ok ? "good" : "bad");
        fb.textContent = ok ? "Yes! 🎉" : "Answer: " + q.answer;
        if (!ok) row.classList.add("shake");
        db.progress.quizTotal++;
        if (ok) { db.progress.quizRight++; confetti(); }
        updateQuizScore();
        if (user) await persistProgress(); else saveLocal();
      };
      input.onkeydown = (e) => { if (e.key === "Enter") check.click(); };
      line.append(input, check, fb);
      row.append(label, line);
      area.append(row);
    });
    updateQuizScore();
  }
  $("newQuizBtn").onclick = () => {
    if (activeSet) shuffle(activeSet.quiz);
    renderQuiz();
  };

  /* ================= Notes ================= */
  function renderNotes() {
    const box = $("notesArea");
    box.innerHTML = "";
    if (!activeSet || !activeSet.notes.length) {
      box.append(el("p", "No notes in this set yet.", "muted"));
      return;
    }
    activeSet.notes.forEach(n => {
      box.append(el("h3", n.heading));
      if (n.points.length) {
        const ul = el("ul");
        n.points.forEach(p => ul.append(el("li", p)));
        box.append(ul);
      }
    });
  }

  /* ================= Study mode switch ================= */
  function showMode(mode) {
    ["cards", "quiz", "notes"].forEach(m => $("mode-" + m).classList.toggle("hidden", m !== mode));
    document.querySelectorAll("[data-mode]").forEach(b => {
      b.className = b.dataset.mode === mode ? "" : "ghost";
    });
    if (mode === "cards") showCard();
    if (mode === "quiz") renderQuiz();
    if (mode === "notes") renderNotes();
  }
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => showMode(b.dataset.mode));

  /* ================= Home: input, upload, create ================= */
  const SAMPLE = `Photosynthesis: the process plants use to turn sunlight, water, and carbon dioxide into sugar and oxygen.

Chlorophyll is the green pigment that absorbs light energy inside the leaves. The light-dependent reactions happen in the thylakoid membranes.

Mitosis: the type of cell division that produces two genetically identical daughter cells. Mitosis has four main stages: prophase, metaphase, anaphase, and telophase.`;

  function updateWordCount() {
    const n = $("source").value.trim().split(/\s+/).filter(Boolean).length;
    $("wordCount").textContent = n ? n + " words" : "";
  }
  $("source").oninput = updateWordCount;
  $("sampleBtn").onclick = () => { $("source").value = SAMPLE; $("titleInput").value ||= "Photosynthesis and mitosis"; updateWordCount(); };
  $("clearBtn").onclick = () => { $("source").value = ""; $("titleInput").value = ""; $("homeMsg").textContent = ""; updateWordCount(); };

  async function extractText(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      if (!window.pdfjsLib) throw new Error("The PDF reader didn't load. Check your internet connection.");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
      let out = "";
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map(item => item.str).join(" ") + "\n\n";
      }
      return out;
    }
    if (name.endsWith(".docx")) {
      if (!window.mammoth) throw new Error("The Word reader didn't load. Check your internet connection.");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }
    if (name.endsWith(".txt") || name.endsWith(".md")) return await file.text();
    throw new Error("Please choose a PDF, DOCX, TXT, or MD file.");
  }

  $("fileInput").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return ($("homeMsg").textContent = `That file is over ${MAX_FILE_MB} MB. Try a smaller one.`);
    }
    $("homeMsg").textContent = "Reading your file… 📖";
    try {
      const text = (await extractText(file)).trim();
      if (text.length < 40) {
        throw new Error("We couldn't find readable text. Scanned pictures of pages aren't supported yet.");
      }
      $("source").value = text.slice(0, MAX_SOURCE_CHARS);
      $("titleInput").value ||= file.name.replace(/\.[^.]+$/, "").slice(0, 120);
      updateWordCount();
      $("homeMsg").textContent = "File loaded! Check the text, then create your study set.";
    } catch (err) {
      $("homeMsg").textContent = errText(err);
    }
  };

  $("makeBtn").onclick = async () => {
    const text = $("source").value.trim();
    if (text.length < 40) {
      $("homeMsg").textContent = "A few more sentences will help. Try at least a short paragraph.";
      $("source").classList.add("shake");
      setTimeout(() => $("source").classList.remove("shake"), 400);
      return;
    }
    const set = buildSet($("titleInput").value.trim(), text);
    db.sets.unshift(set);
    $("makeBtn").disabled = true;
    try {
      await persistSet(set);
      $("homeMsg").textContent = "";
      confetti();
      toast("Study set ready! 🎉");
      $("source").value = ""; $("titleInput").value = ""; updateWordCount();
      openSet(set.id);
    } catch (err) {
      db.sets = db.sets.filter(s => s.id !== set.id);
      $("homeMsg").textContent = "Couldn't save your study set: " + errText(err);
    } finally {
      $("makeBtn").disabled = false;
    }
  };

  /* ================= Progress ================= */
  function renderProgress() {
    const all = db.sets.flatMap(s => s.cards);
    const total = all.length;
    const mastered = all.filter(c => c.box >= 4).length;
    const pct = total ? Math.round(100 * mastered / total) : 0;
    $("statMastered").textContent = mastered;
    $("statTotal").textContent = total;
    const p = db.progress;
    $("statQuiz").textContent = p.quizTotal ? Math.round(100 * p.quizRight / p.quizTotal) + "%" : "0%";
    $("masteryBar").style.width = pct + "%";
    $("masteryText").textContent = total
      ? pct + "% of your flashcards are in the mastered boxes. Keep going! 💪"
      : "Create a study set to start tracking your progress.";
    updateQuizScore();
  }
  $("resetBtn").onclick = async () => {
    if (!confirm("Delete all study sets and reset your progress? This can't be undone.")) return;
    try {
      if (user) {
        const [a, b] = await Promise.all([
          sb.from("study_sets").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
          sb.from("progress").delete().eq("user_id", user.id)
        ]);
        if (a.error) throw a.error;
        if (b.error) throw b.error;
      }
      db = { sets: [], progress: { quizRight: 0, quizTotal: 0 } };
      activeSet = null;
      if (!user) saveLocal();
      renderAll();
      toast("Everything has been reset");
    } catch (err) {
      toast(errText(err));
    }
  };

  /* ================= AI Tutor (calls our server, never the AI API directly) ================= */
  function addBubble(role, text) {
    const div = el("div", text, "bubble " + (role === "user" ? "user" : "ai"));
    $("chat").appendChild(div);
    $("chat").scrollTop = $("chat").scrollHeight;
    return div;
  }
  async function sendQuestion() {
    const input = $("chatInput");
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    addBubble("user", q);
    chatHistory.push({ role: "user", content: q });
    $("sendBtn").disabled = true;

    const typing = el("div", null, "bubble ai typing");
    typing.innerHTML = "<span></span><span></span><span></span>";
    $("chat").appendChild(typing);
    $("chat").scrollTop = $("chat").scrollHeight;

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory.slice(-12),
          context: activeSet ? activeSet.source.slice(0, 4000) : ""
        })
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok) throw new Error(data.error || "The tutor is resting. Try again soon.");
      addBubble("ai", data.reply);
      chatHistory.push({ role: "assistant", content: data.reply });
      $("tutorMsg").textContent = "";
    } catch (err) {
      typing.remove();
      chatHistory.pop();
      $("tutorMsg").textContent = errText(err) + " (The tutor works once the app is deployed on Vercel with your key set.)";
    } finally {
      $("sendBtn").disabled = false;
      input.focus();
    }
  }
  $("sendBtn").onclick = sendQuestion;
  $("chatInput").onkeydown = (e) => { if (e.key === "Enter") sendQuestion(); };

  /* ================= Boot ================= */
  async function boot() {
    updateWordCount();
    setAuthMode("signin");
    showMode("cards");
    renderAccount();
    if (location.hash === "#login" && sb) openAuth("signin");

    if (!sb) {
      onSignedOut();
      renderAll();
      return;
    }

    // Fires once on load (INITIAL_SESSION), then on every sign-in, sign-out, and token refresh.
    sb.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "PASSWORD_RECOVERY") { openAuth("recover"); return; }
        if (session) {
          if (!user || user.id !== session.user.id) await onSignedIn(session);
        } else {
          onSignedOut();
        }
      } catch (err) {
        toast("Couldn't load your account data: " + errText(err));
      }
      renderAll();
    });
  }
  boot();
})();

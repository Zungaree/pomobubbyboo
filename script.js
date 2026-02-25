// ---------- Pomodoro Timer ----------

/**
 * Developer Mode - testing durations
 * Normal (production): 25m focus / 5m short break / 15m long break
 * Developer: 10s focus / 5s short break / 8s long break
 */
const REAL_FOCUS_DURATION = 25 * 60; // seconds
const REAL_SHORT_BREAK_DURATION = 5 * 60;
const REAL_LONG_BREAK_DURATION = 15 * 60;

const DEV_FOCUS_DURATION = 10; // seconds
const DEV_SHORT_BREAK_DURATION = 5;
const DEV_LONG_BREAK_DURATION = 8;

let isDeveloperMode = false;

let timerInterval = null;
let timerEndsAt = null; // timestamp (ms) when current phase ends — used so timer stays accurate when tab is in background
let remainingSeconds = REAL_FOCUS_DURATION;
let currentPhase = "focus"; // "focus" | "short_break" | "long_break"
let isRunning = false;
let completedFocusSessions = 0;

// Elements
let timerDisplay;
let timerModeLabel;
let startBtn;
let pauseBtn;
let resetBtn;
let sessionCountEl;
let devModeToggle;

// ---------- Kanban ----------
let newTaskColumnSelect;
let addTaskBtn;
let taskLists;
let taskModalOverlay;
let modalTaskTitleInput;
let modalTaskDescInput;
let modalAddBtn;
let modalCancelBtn;

// ---------- Music / YouTube ----------
let musicUrlInput;
let loadMusicBtn;
let musicPlayBtn;
let musicPauseBtn;
let musicVolumeSlider;
let musicLoopCheckbox;

let player = null;
let youtubeApiReady = false;
let pendingVideoId = null;
let initialVideoId = null;
let isLooping = false;

// ---------- Theme ----------
let themeToggleCheckbox;

// ---------- Initialization ----------

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  initTheme();
  initPomodoro();
  initKanban();
  initMusic();
  initKeyboardShortcuts();
  requestNotificationPermissionIfNeeded();
  initVisibilityListener();
  updateNotificationHint();
  if (window._notificationEnableBtn) {
    window._notificationEnableBtn.addEventListener("click", function () {
      if (!("Notification" in window)) return;
      Notification.requestPermission().then(function () {
        updateNotificationHint();
        closeNotificationPermissionPopup();
      });
    });
  }
  initNotificationPermissionPopup();
});

function cacheElements() {
  timerDisplay = document.getElementById("timer");
  timerModeLabel = document.getElementById("timer-mode-label");
  startBtn = document.getElementById("start-btn");
  pauseBtn = document.getElementById("pause-btn");
  resetBtn = document.getElementById("reset-btn");
  sessionCountEl = document.getElementById("session-count");
  devModeToggle = document.getElementById("dev-mode-toggle");
  window._notificationHintEl = document.getElementById("notification-hint");
  window._notificationEnableBtn = document.getElementById("notification-enable-btn");
  window._notificationPermissionOverlay = document.getElementById("notification-permission-overlay");
  window._notificationPermissionEnableBtn = document.getElementById("notification-permission-enable");
  window._notificationPermissionDismissBtn = document.getElementById("notification-permission-dismiss");

  newTaskColumnSelect = document.getElementById("new-task-column");
  addTaskBtn = document.getElementById("add-task-btn");
  taskLists = document.querySelectorAll(".task-list");
  taskModalOverlay = document.getElementById("task-modal-overlay");
  modalTaskTitleInput = document.getElementById("modal-task-title");
  modalTaskDescInput = document.getElementById("modal-task-desc");
  modalAddBtn = document.getElementById("modal-add-btn");
  modalCancelBtn = document.getElementById("modal-cancel-btn");

  musicUrlInput = document.getElementById("music-url-input");
  loadMusicBtn = document.getElementById("load-music-btn");
  musicPlayBtn = document.getElementById("music-play-btn");
  musicPauseBtn = document.getElementById("music-pause-btn");
  musicVolumeSlider = document.getElementById("music-volume");
  musicLoopCheckbox = document.getElementById("music-loop");

  themeToggleCheckbox = document.getElementById("theme-toggle-checkbox");
}

// ---------- Theme / Dark Mode ----------

function initTheme() {
  const savedTheme = localStorage.getItem("pomo_theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const shouldUseDark = savedTheme
    ? savedTheme === "dark"
    : prefersDark;

  if (shouldUseDark) {
    document.body.classList.add("dark");
    if (themeToggleCheckbox) themeToggleCheckbox.checked = true;
  }

  if (themeToggleCheckbox) {
    themeToggleCheckbox.addEventListener("change", () => {
      const isDark = themeToggleCheckbox.checked;
      document.body.classList.toggle("dark", isDark);
      localStorage.setItem("pomo_theme", isDark ? "dark" : "light");
    });
  }
}

// ---------- Pomodoro Logic ----------

function initPomodoro() {
  const storedCount = parseInt(
    localStorage.getItem("pomo_session_count") || "0",
    10
  );
  completedFocusSessions = isNaN(storedCount) ? 0 : storedCount;
  updateSessionCountDisplay();

  remainingSeconds = getPhaseDuration(currentPhase);
  updateTimerDisplay();
  updatePhaseLabel();

  startBtn.addEventListener("click", startTimer);
  pauseBtn.addEventListener("click", pauseTimer);
  resetBtn.addEventListener("click", resetTimer);

  initDeveloperModeToggle();
}

// ---------- Developer Mode (testing durations) ----------

function initDeveloperModeToggle() {
  if (!devModeToggle) return;

  devModeToggle.checked = false;

  devModeToggle.addEventListener("change", () => {
    isDeveloperMode = devModeToggle.checked;

    const wasRunning = isRunning;
    if (wasRunning) {
      pauseTimer();
    }

    remainingSeconds = getPhaseDuration(currentPhase);
    updateTimerDisplay();

    if (wasRunning) {
      startTimer();
    }
  });
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;

  // Use end timestamp so the timer stays correct when the tab is in the background
  // (browsers throttle setInterval; we recompute remaining from the end time each tick)
  timerEndsAt = Date.now() + remainingSeconds * 1000;

  // If permission not granted, show the popup so the user knows to turn on notifications (user gesture = good time to ask).
  if ("Notification" in window && Notification.permission !== "granted") {
    openNotificationPermissionPopup();
  }

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  function tick() {
    remainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    updateTimerDisplay();
    if (remainingSeconds <= 0) {
      handleTimerComplete();
      return;
    }
  }

  timerInterval = setInterval(tick, 250);
  tick();
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  timerEndsAt = null;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  pauseTimer();
  remainingSeconds = getPhaseDuration(currentPhase);
  updateTimerDisplay();
}

function handleTimerComplete() {
  pauseTimer();
  playBeep();
  showTimerNotification();

  if (currentPhase === "focus") {
    completedFocusSessions++;
    saveSessionCount();
    updateSessionCountDisplay();
    // After 4 focus sessions, start a long break
    if (completedFocusSessions % 4 === 0) {
      switchPhase("long_break");
    } else {
      switchPhase("short_break");
    }
  } else {
    // After any break, go back to focus
    switchPhase("focus");
  }

  // Auto-start the next phase
  startTimer();
}

function switchPhase(phase) {
  currentPhase = phase;
  remainingSeconds = getPhaseDuration(phase);
  updatePhaseLabel();
  updateTimerDisplay();
}

function getPhaseDuration(phase) {
  const focus = isDeveloperMode ? DEV_FOCUS_DURATION : REAL_FOCUS_DURATION;
  const shortBreak = isDeveloperMode
    ? DEV_SHORT_BREAK_DURATION
    : REAL_SHORT_BREAK_DURATION;
  const longBreak = isDeveloperMode
    ? DEV_LONG_BREAK_DURATION
    : REAL_LONG_BREAK_DURATION;

  if (phase === "short_break") return shortBreak;
  if (phase === "long_break") return longBreak;
  return focus;
}

function updateTimerDisplay() {
  const minutes = Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (remainingSeconds % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${minutes}:${seconds}`;
}

function updatePhaseLabel() {
  let text = "Focus";
  if (currentPhase === "short_break") text = "Short Break";
  if (currentPhase === "long_break") text = "Long Break";
  timerModeLabel.textContent = text;
}

function saveSessionCount() {
  localStorage.setItem(
    "pomo_session_count",
    String(completedFocusSessions)
  );
}

function updateSessionCountDisplay() {
  if (sessionCountEl) {
    sessionCountEl.textContent = String(completedFocusSessions);
  }
}

// ---------- Sound & Notifications ----------

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (err) {
    console.error("Unable to play beep:", err);
  }
}

function requestNotificationPermissionIfNeeded() {
  // Permission is now requested only when the user clicks "Turn on notifications" in the popup or hint.
  updateNotificationHint();
}

// Show or hide the "Enable notifications" hint based on permission.
function updateNotificationHint() {
  var hint = window._notificationHintEl;
  if (!hint) return;
  if (!("Notification" in window)) {
    hint.setAttribute("hidden", "");
    return;
  }
  if (Notification.permission === "granted") {
    hint.setAttribute("hidden", "");
  } else {
    hint.removeAttribute("hidden");
  }
}

// Popup above the page when notification permission is not granted.
function openNotificationPermissionPopup() {
  var overlay = window._notificationPermissionOverlay;
  if (!overlay || !("Notification" in window) || Notification.permission === "granted") return;
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeNotificationPermissionPopup() {
  var overlay = window._notificationPermissionOverlay;
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}

function initNotificationPermissionPopup() {
  var overlay = window._notificationPermissionOverlay;
  var enableBtn = window._notificationPermissionEnableBtn;
  var dismissBtn = window._notificationPermissionDismissBtn;
  if (!overlay) return;

  if (enableBtn) {
    enableBtn.addEventListener("click", function () {
      if (!("Notification" in window)) return;
      Notification.requestPermission().then(function (permission) {
        updateNotificationHint();
        closeNotificationPermissionPopup();
      });
    });
  }
  if (dismissBtn) {
    dismissBtn.addEventListener("click", closeNotificationPermissionPopup);
  }
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeNotificationPermissionPopup();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) {
      closeNotificationPermissionPopup();
    }
  });

  // Show popup on load when permission is not granted (after a short delay so the page is visible).
  if ("Notification" in window && Notification.permission !== "granted") {
    setTimeout(openNotificationPermissionPopup, 400);
  }
}

// When the tab is in the background, browsers throttle timers. This listener
// checks on visibility change so we still fire "time's up" and show the notification
// when the user had the tab in the background.
function initVisibilityListener() {
  if (!document.addEventListener) return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !isRunning || timerEndsAt == null) return;
    if (Date.now() >= timerEndsAt) {
      handleTimerComplete();
    }
  });
}

// Show a desktop (OS) notification so the user sees "time's up" even when this tab
// is in the background or they're in another app. Requires notification permission.
function showTimerNotification() {
  if (!("Notification" in window)) return;

  const title = "PomoBubby — Time's up!";
  const body =
    currentPhase === "focus"
      ? "Focus session complete. Time for a break."
      : "Break finished. Time to focus.";

  function showNotification() {
    try {
      // requireInteraction: true keeps the popup visible until the user dismisses it
      // (better when tab is in background or user is in another app)
      const n = new Notification(title, {
        body: body,
        tag: "pomodoro-timer",
        requireInteraction: true,
        silent: false,
      });
      n.onclick = () => {
        try {
          window.focus();
          n.close();
        } catch (_) {}
      };
    } catch (err) {
      console.warn("Notification failed:", err);
    }
  }

  if (Notification.permission === "granted") {
    showNotification();
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then(function (permission) {
      updateNotificationHint();
      if (permission === "granted") {
        showNotification();
      }
    });
  }
}

// ---------- Keyboard Shortcuts ----------

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;

    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      return; // don't hijack spacebar while typing
    }

    event.preventDefault();
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });
}

// ---------- Kanban Board ----------

function initKanban() {
  // open modal when clicking the main Add button
  addTaskBtn.addEventListener("click", openTaskModal);

  // ----- Modal logic (Kanban add task) -----
  if (modalAddBtn) {
    modalAddBtn.addEventListener("click", handleAddTaskFromModal);
  }
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", closeTaskModal);
  }
  if (taskModalOverlay) {
    taskModalOverlay.addEventListener("click", (e) => {
      if (e.target === taskModalOverlay) {
        closeTaskModal();
      }
    });
  }
  if (modalTaskTitleInput) {
    modalTaskTitleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTaskFromModal();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isTaskModalOpen()) {
      closeTaskModal();
    }
  });

  taskLists.forEach((list) => {
    list.addEventListener("dragover", handleDragOver);
    list.addEventListener("drop", handleDropOnList);
  });

  loadTasksFromStorage();
}

function isTaskModalOpen() {
  return taskModalOverlay && taskModalOverlay.classList.contains("is-open");
}

function openTaskModal() {
  if (!taskModalOverlay) return;
  if (modalTaskTitleInput) modalTaskTitleInput.value = "";
  if (modalTaskDescInput) modalTaskDescInput.value = "";
  taskModalOverlay.classList.add("is-open");
  if (modalTaskTitleInput) {
    setTimeout(() => modalTaskTitleInput.focus(), 10);
  }
}

function closeTaskModal() {
  if (!taskModalOverlay) return;
  taskModalOverlay.classList.remove("is-open");
}

// create task from modal fields and insert into To Do
function handleAddTaskFromModal() {
  if (!modalTaskTitleInput) return;
  const title = modalTaskTitleInput.value.trim();
  if (!title) {
    modalTaskTitleInput.focus();
    return;
  }
  const description = modalTaskDescInput ? modalTaskDescInput.value.trim() : "";
  const id = String(Date.now()) + "-" + Math.floor(Math.random() * 10000);
  const task = {
    id,
    title,
    description,
    status: "todo",
  };
  createTaskCard(task);
  saveTasksToStorage();
  closeTaskModal();
}

// create a task card in the correct column using structured task data
function createTaskCard(task) {
  const column = task.status || "todo";
  const list = document.querySelector(`.task-list[data-column="${column}"]`);
  if (!list) return;

  const card = document.createElement("div");
  card.className = "task-card";
  card.draggable = true;
  card.dataset.id = task.id;

  const main = document.createElement("div");
  main.className = "task-card-main";

  const header = document.createElement("div");
  header.className = "task-header";

  const titleEl = document.createElement("div");
  titleEl.className = "task-title";
  titleEl.textContent = task.title;

  const iconEl = document.createElement("div");
  iconEl.className = "task-status-icon";
  iconEl.setAttribute("aria-hidden", "true");

  header.appendChild(titleEl);
  header.appendChild(iconEl);

  const descEl = document.createElement("div");
  descEl.className = "task-desc";
  if (task.description) {
    descEl.textContent = task.description;
  }

  main.appendChild(header);
  main.appendChild(descEl);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "task-delete-btn";
  deleteBtn.type = "button";
  deleteBtn.setAttribute("aria-label", "Delete task");
  deleteBtn.textContent = "×";

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    card.remove();
    saveTasksToStorage();
  });

  card.addEventListener("dragstart", handleDragStart);
  card.addEventListener("dragend", handleDragEnd);

  card.appendChild(main);
  card.appendChild(deleteBtn);
  list.appendChild(card);

  setCardStatusVisuals(card, column);
}

let draggedCardId = null;

function handleDragStart(e) {
  draggedCardId = this.dataset.id;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedCardId);
}

function handleDragEnd() {
  draggedCardId = null;
  this.classList.remove("dragging");
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDropOnList(e) {
  e.preventDefault();
  const list = this;
  const cardId = e.dataTransfer.getData("text/plain") || draggedCardId;
  if (!cardId) return;

  const card = document.querySelector(`.task-card[data-id="${cardId}"]`);
  if (!card) return;

  const previousParent = card.parentElement;
  list.appendChild(card);

  const column = list.getAttribute("data-column") || "todo";
  // ----- Drag-and-drop status update -----
  setCardStatusVisuals(card, column);

  if (column === "done" && previousParent !== list) {
    triggerConfetti();
  }

  saveTasksToStorage();
}

// ----- Status icon & color update logic -----
function setCardStatusVisuals(card, status) {
  card.classList.remove("task-status-todo", "task-status-doing", "task-status-done");

  let icon = "📝";
  if (status === "doing") {
    icon = "🚧";
    card.classList.add("task-status-doing");
  } else if (status === "done") {
    icon = "✅";
    card.classList.add("task-status-done");
  } else {
    card.classList.add("task-status-todo");
  }

  const iconEl = card.querySelector(".task-status-icon");
  if (iconEl) {
    iconEl.textContent = icon;
  }
}

// ----- localStorage structure for tasks -----
function saveTasksToStorage() {
  const tasks = [];
  taskLists.forEach((list) => {
    const column = list.getAttribute("data-column");
    list.querySelectorAll(".task-card").forEach((card) => {
      const id = card.dataset.id;
      const title = card.querySelector(".task-title")?.textContent || "";
      const description = card.querySelector(".task-desc")?.textContent || "";
      tasks.push({ id, title, description, status: column || "todo" });
    });
  });

  localStorage.setItem("pomo_tasks", JSON.stringify(tasks));
}

function loadTasksFromStorage() {
  const stored = localStorage.getItem("pomo_tasks");
  if (!stored) return;

  try {
    const raw = JSON.parse(stored);
    if (!Array.isArray(raw)) return;

    const normalized = raw.map((item, index) => {
      const status = item.status || item.column || "todo";
      const title = item.title || item.text || "Untitled task";
      const description = item.description || "";
      const id = item.id || String(Date.now() + index);
      return { id, title, description, status };
    });

    normalized.forEach((task) => createTaskCard(task));

    // persist upgraded structure with title/description/status
    localStorage.setItem("pomo_tasks", JSON.stringify(normalized));
  } catch (err) {
    console.error("Failed to parse stored tasks", err);
  }
}

// ---------- Confetti ----------

function triggerConfetti() {
  const container = document.getElementById("confetti-container");
  if (!container) return;

  const colors = ["#4f46e5", "#6366f1", "#22c55e", "#f97316", "#ec4899"];
  const count = 120;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 2 + Math.random() * 1.2 + "s";
    piece.style.transform = `translate3d(0, -100vh, 0) rotate(${
      Math.random() * 360
    }deg)`;
    container.appendChild(piece);

    setTimeout(() => {
      piece.remove();
    }, 3500);
  }
}

// ---------- Music / YouTube IFrame ----------

function initMusic() {
  // Load saved music URL
  const savedUrl = localStorage.getItem("pomo_music_url");
  if (savedUrl && musicUrlInput) {
    musicUrlInput.value = savedUrl;
    initialVideoId = extractYouTubeId(savedUrl);
  }

  loadMusicBtn.addEventListener("click", handleLoadMusic);
  musicPlayBtn.addEventListener("click", () => {
    if (player && youtubeApiReady) {
      player.playVideo();
    }
  });
  musicPauseBtn.addEventListener("click", () => {
    if (player && youtubeApiReady) {
      player.pauseVideo();
    }
  });

  musicVolumeSlider.addEventListener("input", () => {
    if (player && youtubeApiReady) {
      const value = parseInt(musicVolumeSlider.value, 10);
      if (!isNaN(value)) player.setVolume(value);
    }
  });

  musicLoopCheckbox.addEventListener("change", () => {
    isLooping = musicLoopCheckbox.checked;
  });

  loadYouTubeIframeApi();
}

function handleLoadMusic() {
  const url = musicUrlInput.value.trim();
  if (!url) return;

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    alert("Please paste a valid YouTube video URL.");
    return;
  }

  localStorage.setItem("pomo_music_url", url);

  if (youtubeApiReady && player) {
    player.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

function extractYouTubeId(url) {
  try {
    // short-circuit if user pastes just an ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    const a = document.createElement("a");
    a.href = url;

    if (a.hostname.includes("youtu.be")) {
      return a.pathname.slice(1);
    }

    if (a.hostname.includes("youtube.com")) {
      const params = new URLSearchParams(a.search);
      const v = params.get("v");
      if (v) return v;
      // e.g. /embed/{id}
      const parts = a.pathname.split("/");
      const embedIndex = parts.indexOf("embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch (err) {
    console.error("Failed to parse YouTube URL:", err);
  }
  return null;
}

function loadYouTubeIframeApi() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript.parentNode.insertBefore(tag, firstScript);
}

window.onYouTubeIframeAPIReady = function () {
  youtubeApiReady = true;

  player = new YT.Player("player", {
    height: "180",
    width: "100%",
    videoId: initialVideoId || "",
    playerVars: {
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
};

function onPlayerReady(event) {
  // Set default volume
  const volume = parseInt(musicVolumeSlider.value, 10);
  if (!isNaN(volume)) {
    event.target.setVolume(volume);
  }

  // If there's a pending video, cue it
  const videoIdToUse = pendingVideoId || initialVideoId;
  if (videoIdToUse) {
    event.target.cueVideoById(videoIdToUse);
  }
}

function onPlayerStateChange(event) {
  if (
    event.data === YT.PlayerState.ENDED &&
    isLooping &&
    player &&
    youtubeApiReady
  ) {
    player.seekTo(0);
    player.playVideo();
  }
}
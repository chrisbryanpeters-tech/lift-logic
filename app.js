const STORAGE_KEY = "setclock.workouts.v1";
const DRAFT_KEY = "setclock.draft.v1";
const SESSION_KEY = "setclock.session.v1";
const ACTIVE_WORKOUT_KEY = "setclock.activeWorkoutId.v1";

const state = {
  workoutStartedAt: null,
  workoutElapsedBeforePause: 0,
  restDuration: 90,
  restRemaining: 90,
  restEndsAt: null,
  restPausedRemaining: 90,
};

const $ = (selector, root = document) => root.querySelector(selector);
const exerciseList = $("#exerciseList");
const historyDrawer = $("#historyDrawer");
const workoutDetailDrawer = $("#workoutDetailDrawer");
let confirmAction = null;
let lastAutosaveAt = 0;

function formatClock(totalSeconds, includeHours = true) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (!includeHours) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function currentWorkoutSeconds() {
  const activeSeconds = state.workoutStartedAt ? (Date.now() - state.workoutStartedAt) / 1000 : 0;
  return state.workoutElapsedBeforePause + activeSeconds;
}

function loadWorkouts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveWorkouts(workouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  refreshExerciseLibrary();
}

function normalizeExerciseName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function getExerciseLibrary() {
  const names = new Map();
  loadWorkouts().forEach((workout) => {
    if (workout.status === "in-progress") return;
    workout.exercises.forEach((exercise) => {
      const cleaned = exercise.name.trim().replace(/\s+/g, " ");
      if (!cleaned || cleaned === "Untitled exercise") return;
      const key = normalizeExerciseName(cleaned);
      if (!names.has(key)) names.set(key, cleaned);
    });
  });
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function refreshExerciseLibrary() {
  const suggestions = $("#exerciseSuggestions");
  if (!suggestions) return;
  suggestions.innerHTML = getExerciseLibrary()
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
}

function findPreviousExercise(name) {
  const key = normalizeExerciseName(name);
  if (!key) return null;

  for (const workout of loadWorkouts()) {
    if (workout.status === "in-progress") continue;
    const match = workout.exercises.find((exercise) => normalizeExerciseName(exercise.name) === key);
    if (match?.sets?.length) {
      return {
        date: workout.date,
        sets: match.sets,
      };
    }
  }
  return null;
}

function renderPreviousLift(exercise) {
  const name = $(".exercise-name", exercise).value;
  const previous = findPreviousExercise(name);
  const panel = $(".previous-lift", exercise);

  if (!previous) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const date = new Date(previous.date);
  const sets = previous.sets.map(formatSetSummary).join(", ");
  panel.hidden = false;
  panel.innerHTML = `
    <span>Last time</span>
    <strong>${escapeHtml(sets)}</strong>
    <time>${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</time>
  `;
}

function renderExerciseSuggestions(exercise) {
  const input = $(".exercise-name", exercise);
  const suggestions = $(".exercise-suggestions", exercise);
  const search = normalizeExerciseName(input.value);
  const matches = search
    ? getExerciseLibrary().filter((name) => normalizeExerciseName(name).includes(search)).slice(0, 5)
    : [];

  if (!matches.length) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }

  suggestions.hidden = false;
  suggestions.innerHTML = matches
    .map((name) => `<button class="suggestion-chip" type="button">${escapeHtml(name)}</button>`)
    .join("");
  suggestions.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.textContent;
      suggestions.hidden = true;
      suggestions.innerHTML = "";
      saveDraft();
      renderPreviousLift(exercise);
    });
  });
}

function refreshPreviousLifts() {
  document.querySelectorAll(".exercise").forEach(renderPreviousLift);
}

function collectDraft() {
  return {
    notes: $("#workoutNotes").value,
    exercises: [...document.querySelectorAll(".exercise")].map((exercise) => ({
      name: $(".exercise-name", exercise).value,
      sets: [...exercise.querySelectorAll(".set-row")].map((row) => ({
        weight: $(".weight", row).value,
        reps: $(".reps", row).value,
        rir: $(".rir", row).value,
      })),
    })),
  };
}

function getMeaningfulWorkout() {
  const draft = collectDraft();
  const exercises = draft.exercises
    .map((exercise) => ({
      name: exercise.name.trim() || "Untitled exercise",
      sets: exercise.sets.filter((set) => set.weight || set.reps || set.rir),
    }))
    .filter((exercise) => exercise.sets.length || exercise.name !== "Untitled exercise");

  return {
    duration: Math.floor(currentWorkoutSeconds()),
    notes: draft.notes.trim(),
    exercises,
  };
}

function hasWorkoutContent(workout = getMeaningfulWorkout()) {
  return Boolean(workout.duration || workout.notes || workout.exercises.length);
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
  saveSession();
  autoSaveWorkout();
  updateActionStates();
}

function saveSession() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      workoutStartedAt: state.workoutStartedAt,
      workoutElapsedBeforePause: state.workoutElapsedBeforePause,
      restDuration: state.restDuration,
      restRemaining: state.restRemaining,
      restEndsAt: state.restEndsAt,
      restPausedRemaining: state.restPausedRemaining,
    })
  );
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!saved) return;
    Object.assign(state, {
      workoutStartedAt: saved.workoutStartedAt || null,
      workoutElapsedBeforePause: saved.workoutElapsedBeforePause || 0,
      restDuration: saved.restDuration || 90,
      restRemaining: saved.restRemaining || saved.restDuration || 90,
      restEndsAt: saved.restEndsAt || null,
      restPausedRemaining: saved.restPausedRemaining || saved.restDuration || 90,
    });
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}

function resetCurrentWorkout() {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  state.workoutStartedAt = null;
  state.workoutElapsedBeforePause = 0;
  state.restRemaining = state.restDuration;
  state.restEndsAt = null;
  state.restPausedRemaining = state.restDuration;
  loadDraft();
  renderHistory();
  refreshExerciseLibrary();
  setWorkoutRunning(false);
  updateRestUi();
  updateActionStates();
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `workout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setAutosaveStatus(message) {
  const status = $("#autosaveStatus");
  if (status) status.textContent = message;
}

function autoSaveWorkout(force = false) {
  const workout = getMeaningfulWorkout();
  if (!hasWorkoutContent(workout)) {
    setAutosaveStatus("Autosave ready");
    return;
  }

  const now = Date.now();
  if (!force && now - lastAutosaveAt < 1000) return;
  lastAutosaveAt = now;

  const activeId = localStorage.getItem(ACTIVE_WORKOUT_KEY) || createId();
  localStorage.setItem(ACTIVE_WORKOUT_KEY, activeId);
  const workouts = loadWorkouts();
  const existingIndex = workouts.findIndex((saved) => saved.id === activeId);
  const existing = existingIndex >= 0 ? workouts[existingIndex] : null;
  const autosaved = {
    id: activeId,
    date: existing?.date || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    duration: workout.duration,
    notes: workout.notes,
    exercises: workout.exercises,
    status: "in-progress",
  };

  if (existingIndex >= 0) workouts[existingIndex] = autosaved;
  else workouts.unshift(autosaved);

  saveWorkouts(workouts);
  renderHistory();
  setAutosaveStatus(`Autosaved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
}

function updateActionStates() {
  const hasContent = hasWorkoutContent();
  $("#finishWorkout").disabled = !hasContent;
  $("#deleteCurrentWorkout").disabled = !hasContent;
}

function addSet(exercise, set = {}) {
  const template = $("#setTemplate").content.cloneNode(true);
  const row = $(".set-row", template);
  $(".weight", row).value = set.weight || "";
  $(".reps", row).value = set.reps || "";
  $(".rir", row).value = set.rir || "";
  row.querySelectorAll(".step-button").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $(`.${button.dataset.target}`, row);
      const delta = Number(button.dataset.delta);
      const current = Number(input.value) || 0;
      input.value = Math.max(0, current + delta);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  $(".remove-set", row).addEventListener("click", () => {
    row.remove();
    renumberSets(exercise);
    saveDraft();
  });
  row.addEventListener("input", saveDraft);
  $(".sets", exercise).append(row);
  renumberSets(exercise);
}

function renumberSets(exercise) {
  exercise.querySelectorAll(".set-number").forEach((label, index) => {
    label.textContent = index + 1;
  });
}

function addExercise(exercise = { name: "", sets: [{}] }) {
  const template = $("#exerciseTemplate").content.cloneNode(true);
  const card = $(".exercise", template);
  const nameInput = $(".exercise-name", card);
  nameInput.value = exercise.name || "";
  nameInput.addEventListener("input", () => {
    saveDraft();
    renderExerciseSuggestions(card);
    renderPreviousLift(card);
  });
  nameInput.addEventListener("change", () => renderPreviousLift(card));
  nameInput.addEventListener("focus", () => renderExerciseSuggestions(card));
  nameInput.addEventListener("blur", () => {
    setTimeout(() => {
      const suggestions = $(".exercise-suggestions", card);
      suggestions.hidden = true;
    }, 150);
  });
  $(".remove-exercise", card).addEventListener("click", () => {
    card.remove();
    saveDraft();
  });
  $(".add-set", card).addEventListener("click", () => {
    addSet(card);
    saveDraft();
  });
  exerciseList.append(card);
  (exercise.sets?.length ? exercise.sets : [{}]).forEach((set) => addSet(card, set));
  renderPreviousLift(card);
}

function loadDraft() {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
  } catch {
    draft = null;
  }
  $("#workoutNotes").value = draft?.notes || "";
  exerciseList.innerHTML = "";
  (draft?.exercises?.length ? draft.exercises : [{ name: "", sets: [{}] }]).forEach(addExercise);
}

function setWorkoutRunning(isRunning) {
  $("#workoutToggle").textContent = isRunning ? "Pause Workout" : state.workoutElapsedBeforePause ? "Resume Workout" : "Start Workout";
  updateActionStates();
}

function toggleWorkout() {
  if (state.workoutStartedAt) {
    state.workoutElapsedBeforePause = currentWorkoutSeconds();
    state.workoutStartedAt = null;
    setWorkoutRunning(false);
    saveDraft();
    return;
  }
  state.workoutStartedAt = Date.now();
  setWorkoutRunning(true);
  saveDraft();
}

function updateRestUi() {
  $("#restTime").textContent = formatClock(state.restRemaining, false);
  $("#restToggle").textContent = state.restEndsAt ? "Pause Rest" : state.restRemaining < state.restDuration ? "Resume Rest" : "Start Rest";
  $("#restStatus").textContent = state.restEndsAt ? "Counting down" : state.restRemaining === 0 ? "Done" : "Ready";
  $("#restCard").classList.toggle("active", Boolean(state.restEndsAt));
}

function toggleRest() {
  if (state.restEndsAt) {
    state.restPausedRemaining = state.restRemaining;
    state.restEndsAt = null;
  } else {
    const remaining = state.restRemaining > 0 ? state.restRemaining : state.restDuration;
    state.restEndsAt = Date.now() + remaining * 1000;
    state.restPausedRemaining = remaining;
  }
  updateRestUi();
  saveSession();
}

function changeRestDuration(delta) {
  state.restDuration = Math.max(15, state.restDuration + delta);
  if (!state.restEndsAt) {
    state.restRemaining = state.restDuration;
    state.restPausedRemaining = state.restDuration;
  }
  updateRestUi();
  saveSession();
}

function skipRest() {
  state.restEndsAt = null;
  state.restRemaining = state.restDuration;
  state.restPausedRemaining = state.restDuration;
  updateRestUi();
  saveSession();
}

function finishWorkout() {
  const workout = getMeaningfulWorkout();
  if (!hasWorkoutContent(workout)) return;

  const workouts = loadWorkouts();
  const activeId = localStorage.getItem(ACTIVE_WORKOUT_KEY);
  const existingIndex = activeId ? workouts.findIndex((saved) => saved.id === activeId) : -1;
  const completed = {
    id: activeId || createId(),
    date: new Date().toISOString(),
    duration: workout.duration,
    notes: workout.notes,
    exercises: workout.exercises,
    status: "complete",
  };

  if (existingIndex >= 0) workouts[existingIndex] = completed;
  else workouts.unshift(completed);

  saveWorkouts(workouts);
  resetCurrentWorkout();
}

function deleteWorkout(id) {
  openConfirm({
    title: "Delete workout?",
    message: "This workout and its sets will be permanently removed.",
    action: () => {
      saveWorkouts(loadWorkouts().filter((workout) => workout.id !== id));
      if (localStorage.getItem(ACTIVE_WORKOUT_KEY) === id) resetCurrentWorkout();
      renderHistory();
      refreshPreviousLifts();
    },
  });
}

function deleteCurrentWorkout() {
  openConfirm({
    title: "Delete current workout?",
    message: "This clears the current workout, including any autosaved copy in history.",
    action: () => {
      const activeId = localStorage.getItem(ACTIVE_WORKOUT_KEY);
      if (activeId) saveWorkouts(loadWorkouts().filter((workout) => workout.id !== activeId));
      resetCurrentWorkout();
      setAutosaveStatus("Workout deleted");
    },
  });
}

function renderHistory() {
  const workouts = loadWorkouts();
  const list = $("#historyList");
  list.innerHTML = "";
  if (!workouts.length) {
    list.innerHTML = '<p class="empty">Saved workouts will appear here.</p>';
    return;
  }
  workouts.forEach((workout) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const date = new Date(workout.date);
    const exercises = workout.exercises
      .map((exercise) => {
        const sets = exercise.sets.map(formatSetSummary).join(", ");
        return `<li><strong>${escapeHtml(exercise.name)}</strong> ${escapeHtml(sets)}</li>`;
      })
      .join("");
    item.innerHTML = `
      <header>
        <div>
          <strong>${formatClock(workout.duration)}</strong>
          <time>${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
        </div>
        ${workout.status === "in-progress" ? '<span class="status-pill">Autosaved</span>' : ""}
      </header>
      ${exercises ? `<ul>${exercises}</ul>` : ""}
      ${workout.notes ? `<p>${escapeHtml(workout.notes)}</p>` : ""}
      <div class="history-actions">
        <button class="text-button view-workout" type="button">View</button>
        <button class="text-button delete-workout" type="button">Delete</button>
      </div>
    `;
    $(".view-workout", item).addEventListener("click", () => openWorkoutDetail(workout.id));
    $(".delete-workout", item).addEventListener("click", () => deleteWorkout(workout.id));
    list.append(item);
  });
}

function openWorkoutDetail(id) {
  const workout = loadWorkouts().find((saved) => saved.id === id);
  if (!workout) return;

  const date = new Date(workout.date);
  $("#workoutDetail").innerHTML = `
    <section class="detail-meta">
      <strong>${formatClock(workout.duration)}</strong>
      <time>${date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })} at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      ${workout.status === "in-progress" ? '<span class="status-pill">Autosaved</span>' : ""}
    </section>
    ${workout.exercises.length ? workout.exercises.map(renderWorkoutExerciseDetail).join("") : '<p class="empty">No exercises saved.</p>'}
    ${workout.notes ? `<section class="detail-notes"><h3>Notes</h3><p>${escapeHtml(workout.notes)}</p></section>` : ""}
  `;
  workoutDetailDrawer.classList.add("open");
  workoutDetailDrawer.setAttribute("aria-hidden", "false");
}

function renderWorkoutExerciseDetail(exercise) {
  return `
    <section class="detail-exercise">
      <h3>${escapeHtml(exercise.name)}</h3>
      <div class="detail-sets">
        ${exercise.sets.map((set, index) => `
          <div class="detail-set">
            <strong>${index + 1}</strong>
            <span>Weight <strong>${escapeHtml(set.weight || 0)}</strong></span>
            <span>Reps <strong>${escapeHtml(set.reps || 0)}</strong></span>
            <span>RIR <strong>${escapeHtml(set.rir || 0)}</strong></span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function closeWorkoutDetail() {
  workoutDetailDrawer.classList.remove("open");
  workoutDetailDrawer.setAttribute("aria-hidden", "true");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function formatSetSummary(set) {
  const base = `${set.weight || 0} x ${set.reps || 0}`;
  return set.rir ? `${base} @ ${set.rir} RIR` : base;
}

function tick() {
  $("#workoutTime").textContent = formatClock(currentWorkoutSeconds());
  if (state.restEndsAt) {
    state.restRemaining = Math.max(0, Math.ceil((state.restEndsAt - Date.now()) / 1000));
    if (state.restRemaining === 0) {
      state.restEndsAt = null;
      state.restRemaining = state.restDuration;
      state.restPausedRemaining = state.restDuration;
      if ("vibrate" in navigator) navigator.vibrate([120, 60, 120]);
    }
    updateRestUi();
  }
  if (state.workoutStartedAt && Date.now() - lastAutosaveAt > 10000) {
    saveSession();
    autoSaveWorkout(true);
    updateActionStates();
  }
}

function openConfirm({ title, message, action }) {
  confirmAction = action;
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmLayer").classList.add("open");
  $("#confirmLayer").setAttribute("aria-hidden", "false");
}

function closeConfirm() {
  confirmAction = null;
  $("#confirmLayer").classList.remove("open");
  $("#confirmLayer").setAttribute("aria-hidden", "true");
}

function runConfirmAction() {
  const action = confirmAction;
  closeConfirm();
  if (action) action();
}

function openHistory() {
  renderHistory();
  historyDrawer.classList.add("open");
  historyDrawer.setAttribute("aria-hidden", "false");
}

function closeHistory() {
  historyDrawer.classList.remove("open");
  historyDrawer.setAttribute("aria-hidden", "true");
}

$("#addExercise").addEventListener("click", () => {
  addExercise();
  saveDraft();
});
$("#workoutToggle").addEventListener("click", toggleWorkout);
$("#finishWorkout").addEventListener("click", finishWorkout);
$("#deleteCurrentWorkout").addEventListener("click", deleteCurrentWorkout);
$("#restToggle").addEventListener("click", toggleRest);
$("#restSkip").addEventListener("click", skipRest);
$("#restMinus").addEventListener("click", () => changeRestDuration(-15));
$("#restPlus").addEventListener("click", () => changeRestDuration(15));
$("#workoutNotes").addEventListener("input", saveDraft);
$("#historyToggle").addEventListener("click", openHistory);
$("#closeHistory").addEventListener("click", closeHistory);
$("#closeWorkoutDetail").addEventListener("click", closeWorkoutDetail);
$("#cancelConfirm").addEventListener("click", closeConfirm);
$("#confirmDelete").addEventListener("click", runConfirmAction);
historyDrawer.addEventListener("click", (event) => {
  if (event.target === historyDrawer) closeHistory();
});
workoutDetailDrawer.addEventListener("click", (event) => {
  if (event.target === workoutDetailDrawer) closeWorkoutDetail();
});
$("#confirmLayer").addEventListener("click", (event) => {
  if (event.target === $("#confirmLayer")) closeConfirm();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

loadSession();
loadDraft();
renderHistory();
refreshExerciseLibrary();
refreshPreviousLifts();
setWorkoutRunning(false);
updateRestUi();
updateActionStates();
setInterval(tick, 250);

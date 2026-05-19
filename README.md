<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#121515">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Lift Logic">
    <title>Lift Logic Workout Tracker</title>
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="apple-touch-icon" href="assets/lift-logic-logo.png">
    <link rel="stylesheet" href="styles.css?v=9">
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <img class="brand-logo" src="assets/lift-logic-logo.png" alt="Lift Logic logo">
          <div>
            <p class="eyebrow">Workout Tracker</p>
            <h1>Lift Logic</h1>
          </div>
        </div>
        <button class="icon-button" id="historyToggle" type="button" aria-label="Open workout history" title="History">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 6.3L3 8"/><path d="M12 7v6l4 2"/></svg>
        </button>
      </header>

      <section class="summary-band" aria-label="Workout timers">
        <div class="time-block">
          <span>Total time</span>
          <strong id="workoutTime">00:00:00</strong>
        </div>
        <div class="time-block rest" id="restCard">
          <span>Rest timer</span>
          <strong id="restTime">01:30</strong>
          <small id="restStatus">Ready</small>
        </div>
      </section>

      <section class="controls" aria-label="Workout controls">
        <button class="primary" id="workoutToggle" type="button">Start Workout</button>
        <button class="secondary" id="finishWorkout" type="button" disabled>Finish Workout</button>
        <button class="danger" id="deleteCurrentWorkout" type="button" disabled>Delete Workout</button>
      </section>
      <p class="autosave-status" id="autosaveStatus">Autosave ready</p>

      <section class="rest-controls" aria-label="Rest controls">
        <button class="icon-button" id="restMinus" type="button" aria-label="Reduce rest time" title="Reduce rest time">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
        </button>
        <button class="primary compact" id="restToggle" type="button">Start Rest</button>
        <button class="secondary compact" id="restSkip" type="button">Skip Rest</button>
        <button class="icon-button" id="restPlus" type="button" aria-label="Increase rest time" title="Increase rest time">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        </button>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>Exercise Log</h2>
          <button class="text-button" id="addExercise" type="button">Add Exercise</button>
        </div>
        <div id="exerciseList" class="exercise-list"></div>
      </section>

      <section class="panel">
        <label class="field-label" for="workoutNotes">Workout notes</label>
        <textarea id="workoutNotes" rows="4" placeholder="Energy, pain, form cues, what to change next time..."></textarea>
      </section>
    </main>

    <aside class="drawer" id="historyDrawer" aria-hidden="true">
      <div class="drawer-panel">
        <div class="panel-title">
          <h2>History</h2>
          <button class="icon-button" id="closeHistory" type="button" aria-label="Close history" title="Close">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div id="historyList" class="history-list"></div>
      </div>
    </aside>

    <aside class="confirm-layer" id="confirmLayer" aria-hidden="true">
      <div class="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <h2 id="confirmTitle">Delete workout?</h2>
        <p id="confirmMessage">This cannot be undone.</p>
        <div class="confirm-actions">
          <button class="secondary" id="cancelConfirm" type="button">Cancel</button>
          <button class="danger" id="confirmDelete" type="button">Delete</button>
        </div>
      </div>
    </aside>

    <template id="exerciseTemplate">
      <article class="exercise">
        <div class="exercise-head">
          <input class="exercise-name" type="text" placeholder="Exercise name" aria-label="Exercise name" list="exerciseSuggestions" autocomplete="off">
          <button class="icon-button remove-exercise" type="button" aria-label="Remove exercise" title="Remove exercise">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
          </button>
        </div>
        <div class="exercise-suggestions" hidden></div>
        <div class="previous-lift" hidden></div>
        <div class="sets"></div>
        <button class="text-button add-set" type="button">Add Set</button>
      </article>
    </template>

    <template id="setTemplate">
      <div class="set-row">
        <span class="set-number"></span>
        <label>
          <span>Weight</span>
          <div class="stepper">
            <button class="step-button" type="button" data-target="weight" data-delta="-5" aria-label="Decrease weight">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
            </button>
            <input class="weight" inputmode="decimal" type="number" min="0" step="5" placeholder="0" aria-label="Weight">
            <button class="step-button" type="button" data-target="weight" data-delta="5" aria-label="Increase weight">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </button>
          </div>
        </label>
        <label>
          <span>Reps</span>
          <div class="stepper">
            <button class="step-button" type="button" data-target="reps" data-delta="-1" aria-label="Decrease reps">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
            </button>
            <input class="reps" inputmode="numeric" type="number" min="0" step="1" placeholder="0" aria-label="Reps">
            <button class="step-button" type="button" data-target="reps" data-delta="1" aria-label="Increase reps">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </button>
          </div>
        </label>
        <label>
          <span>RIR</span>
          <div class="stepper">
            <button class="step-button" type="button" data-target="rir" data-delta="-1" aria-label="Decrease reps in reserve">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
            </button>
            <input class="rir" inputmode="numeric" type="number" min="0" step="1" placeholder="0" aria-label="Reps in reserve">
            <button class="step-button" type="button" data-target="rir" data-delta="1" aria-label="Increase reps in reserve">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </button>
          </div>
        </label>
        <button class="icon-button remove-set" type="button" aria-label="Remove set" title="Remove set">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
        </button>
      </div>
    </template>

    <datalist id="exerciseSuggestions"></datalist>
    <script src="app.js?v=9"></script>
  </body>
</html>

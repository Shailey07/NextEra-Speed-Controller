"use strict";

/* =========================================
   NextEra — Popup Controller
   ========================================= */

const MIN_SPEED = 0.5;
const MAX_SPEED = 30;
const STEP = 0.5;
const DEFAULT_SPEED = 1;


/* =========================================
   STATE
   ========================================= */

let currentSpeed = DEFAULT_SPEED;
let enabled = true;


/* =========================================
   ELEMENTS
   ========================================= */

const enabledToggle =
  document.getElementById("enabled");

const currentSpeedValue =
  document.getElementById("currentSpeedValue");

const statusText =
  document.getElementById("statusText");

const turboBadge =
  document.getElementById("turboBadge");

const audioBadge =
  document.getElementById("audioBadge");

const decreaseBtn =
  document.getElementById("decreaseBtn");

const increaseBtn =
  document.getElementById("increaseBtn");

const resetBtn =
  document.getElementById("resetBtn");

const skipBtn =
  document.getElementById("skipBtn");

const statusMessage =
  document.getElementById("status");

const speedButtons =
  document.querySelectorAll(
    ".speed-grid button[data-speed]"
  );


/* =========================================
   ACTIVE TAB
   ========================================= */

async function getActiveTab() {

  const tabs =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

  return tabs[0];
}


/* =========================================
   FORMAT SPEED
   ========================================= */

function formatSpeed(speed) {

  const value =
    Number(speed);

  if (Number.isInteger(value)) {
    return `${value}x`;
  }

  return `${value.toFixed(1)}x`;
}


/* =========================================
   STATUS MESSAGE
   ========================================= */

let statusTimer = null;

function showStatus(
  message,
  error = false
) {

  clearTimeout(statusTimer);

  statusMessage.textContent =
    message;

  statusMessage.classList.add(
    "show"
  );

  statusMessage.classList.toggle(
    "error",
    error
  );

  statusTimer =
    setTimeout(() => {

      statusMessage.classList.remove(
        "show"
      );

    }, 1600);
}


/* =========================================
   UPDATE UI
   ========================================= */

function updateUI() {

  currentSpeedValue.textContent =
    formatSpeed(currentSpeed);


  /*
   * Toggle
   */

  enabledToggle.checked =
    enabled;


  /*
   * Enabled / Disabled body
   */

  document.body.classList.toggle(
    "disabled",
    !enabled
  );


  /*
   * Status
   */

  statusText.textContent =
    enabled
      ? "Enabled"
      : "Disabled";


  const dot =
    document.querySelector(
      ".status-dot"
    );

  if (dot) {

    dot.style.background =
      enabled
        ? "#00ff88"
        : "#555";

    dot.style.boxShadow =
      enabled
        ? "0 0 7px rgba(0,255,136,.9)"
        : "none";

  }


  /*
   * Turbo state
   */

  const turbo =
    currentSpeed > 16;

  turboBadge.style.opacity =
    turbo ? "1" : "0.45";

  turboBadge.innerHTML =
    turbo
      ? "<span>⚡</span> Turbo Mode Active"
      : "<span>⚡</span> Native Mode";


  /*
   * Audio state
   */

  audioBadge.style.opacity =
    turbo ? "1" : "0.45";

  audioBadge.innerHTML =
    turbo
      ? "<span>🔇</span> Audio Muted"
      : "<span>🔊</span> Audio Active";


  /*
   * Speed buttons
   */

  speedButtons.forEach(button => {

    const speed =
      Number(button.dataset.speed);

    button.classList.toggle(
      "active",
      Math.abs(
        speed - currentSpeed
      ) < 0.001
    );

  });

}


/* =========================================
   SAVE SETTINGS
   ========================================= */

async function saveSettings() {

  try {

    await chrome.storage.local.set({

      videoSpeed:
        currentSpeed,

      videoEnabled:
        enabled

    });

  } catch (error) {

    console.warn(
      "NextEra: unable to save settings",
      error
    );

  }

}


/* =========================================
   SEND MESSAGE TO PAGE
   ========================================= */

async function sendToPage(message) {

  const tab =
    await getActiveTab();

  if (!tab || !tab.id) {

    throw new Error(
      "No active tab"
    );

  }

  return await chrome.tabs.sendMessage(
    tab.id,
    message
  );
}


/* =========================================
   SET SPEED
   ========================================= */

async function setSpeed(
  speed,
  showMessage = true
) {

  speed =
    Number(speed);

  if (!Number.isFinite(speed)) {
    return;
  }

  /*
   * Clamp
   */

  speed =
    Math.max(
      MIN_SPEED,
      Math.min(
        MAX_SPEED,
        speed
      )
    );


  currentSpeed =
    Math.round(
      speed * 10
    ) / 10;


  /*
   * Update UI immediately
   */

  updateUI();


  try {

    const response =
      await sendToPage({

        type:
          "SET_SPEED",

        speed:
          currentSpeed,

        enabled

      });


    if (
      response &&
      response.success === false
    ) {

      throw new Error(
        "Speed could not be applied"
      );

    }


    /*
     * Save
     */

    await saveSettings();


    if (showMessage) {

      if (currentSpeed > 16) {

        showStatus(
          `Turbo ${formatSpeed(currentSpeed)} activated`
        );

      } else {

        showStatus(
          `Speed set to ${formatSpeed(currentSpeed)}`
        );

      }

    }

  } catch (error) {

    /*
     * The page may be restricted:
     *
     * chrome://
     * Chrome Web Store
     * PDF viewer
     * extension pages
     * etc.
     */

    showStatus(
      "Video control unavailable on this page",
      true
    );

  }

}


/* =========================================
   SPEED PRESETS
   ========================================= */

speedButtons.forEach(button => {

  button.addEventListener(
    "click",
    () => {

      const speed =
        Number(
          button.dataset.speed
        );

      setSpeed(speed);

    }
  );

});


/* =========================================
   DECREASE
   ========================================= */

decreaseBtn.addEventListener(
  "click",
  () => {

    setSpeed(
      currentSpeed - STEP
    );

  }
);


/* =========================================
   INCREASE
   ========================================= */

increaseBtn.addEventListener(
  "click",
  () => {

    setSpeed(
      currentSpeed + STEP
    );

  }
);


/* =========================================
   RESET
   ========================================= */

resetBtn.addEventListener(
  "click",
  () => {

    setSpeed(
      DEFAULT_SPEED
    );

  }
);


/* =========================================
   SKIP TO END
   ========================================= */

skipBtn.addEventListener(
  "click",
  async () => {

    try {

      const response =
        await sendToPage({

          type:
            "SKIP_TO_END"

        });


      if (
        response?.success &&
        response.count > 0
      ) {

        showStatus(
          `Skipped ${response.count} video${
            response.count > 1
              ? "s"
              : ""
          } to end`
        );

      } else {

        showStatus(
          "No playable video found",
          true
        );

      }

    } catch {

      showStatus(
        "Unable to control this video",
        true
      );

    }

  }
);


/* =========================================
   ENABLE / DISABLE
   ========================================= */

enabledToggle.addEventListener(
  "change",
  async () => {

    enabled =
      enabledToggle.checked;


    updateUI();


    try {

      await sendToPage({

        type:
          "SET_ENABLED",

        enabled

      });

    } catch {
      /*
       * Restricted page.
       */
    }


    await saveSettings();


    showStatus(
      enabled
        ? "NextEra enabled"
        : "NextEra disabled"
    );

  }
);


/* =========================================
   LOAD LOCAL SETTINGS
   ========================================= */

async function loadSettings() {

  try {

    const data =
      await chrome.storage.local.get([
        "videoSpeed",
        "videoEnabled"
      ]);


    if (
      typeof data.videoSpeed ===
      "number"
    ) {

      currentSpeed =
        Math.max(
          MIN_SPEED,
          Math.min(
            MAX_SPEED,
            data.videoSpeed
          )
        );

    }


    if (
      typeof data.videoEnabled ===
      "boolean"
    ) {

      enabled =
        data.videoEnabled;

    }

  } catch {

    currentSpeed =
      DEFAULT_SPEED;

    enabled =
      true;

  }


  updateUI();


  /*
   * Ask current page for its actual state.
   */

  try {

    const response =
      await sendToPage({

        type:
          "GET_STATE"

      });


    if (
      response?.success
    ) {

      currentSpeed =
        response.speed;

      enabled =
        response.enabled;

      updateUI();

    }

  } catch {

    /*
     * Restricted page.
     */

  }

}


/* =========================================
   POPUP KEYBOARD SHORTCUTS
   ========================================= */

document.addEventListener(
  "keydown",
  event => {

    /*
     * Alt + Up
     */

    if (
      event.altKey &&
      event.key === "ArrowUp"
    ) {

      event.preventDefault();

      setSpeed(
        currentSpeed + STEP
      );

    }


    /*
     * Alt + Down
     */

    if (
      event.altKey &&
      event.key === "ArrowDown"
    ) {

      event.preventDefault();

      setSpeed(
        currentSpeed - STEP
      );

    }


    /*
     * Alt + R
     */

    if (
      event.altKey &&
      event.key.toLowerCase() === "r"
    ) {

      event.preventDefault();

      setSpeed(
        DEFAULT_SPEED
      );

    }

  }
);


/* =========================================
   INITIALIZE
   ========================================= */

loadSettings();
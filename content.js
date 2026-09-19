(() => {
  "use strict";

  const MIN_SPEED = 0.1;
  const MAX_SPEED = 30;
  const NATIVE_MAX = 16;

  let currentSpeed = 1;
  let enabled = true;

  // Turbo controllers for individual videos
  const turbo = new WeakMap();

  /*
   * -----------------------------------------
   * BASIC HELPERS
   * -----------------------------------------
   */

  function isVideo(video) {
    return video instanceof HTMLVideoElement;
  }

  function normalizeSpeed(value) {
    const speed = Number(value);

    if (!Number.isFinite(speed)) {
      return 1;
    }

    return Math.max(
      MIN_SPEED,
      Math.min(MAX_SPEED, speed)
    );
  }

  /*
   * -----------------------------------------
   * STOP TURBO
   * -----------------------------------------
   */

  function stopTurbo(video) {
    const state = turbo.get(video);

    if (!state) {
      return;
    }

    state.running = false;

    if (state.raf) {
      cancelAnimationFrame(state.raf);
    }

    if (state.interval) {
      clearInterval(state.interval);
    }

    turbo.delete(video);
  }

  /*
   * -----------------------------------------
   * TURBO SEEK ENGINE
   * -----------------------------------------
   *
   * At 30x:
   *
   * 1 real second
   *        ↓
   * 30 seconds of video time
   *
   * Audio is muted.
   */

  function startTurbo(video) {

    stopTurbo(video);

    if (!enabled) {
      return;
    }

    if (!isVideo(video)) {
      return;
    }

    if (!Number.isFinite(video.duration)) {
      return;
    }

    if (video.duration <= 0) {
      return;
    }

    const state = {
      running: true,
      raf: null,
      interval: null,
      lastWallTime: performance.now(),
      lastVideoTime: video.currentTime
    };

    turbo.set(video, state);

    /*
     * Turbo mode intentionally kills audio.
     */

    try {
      video.muted = true;
      video.volume = 0;
    } catch {}

    /*
     * Do NOT try to set playbackRate to 30.
     *
     * Chrome limits native playbackRate.
     *
     * We use a small native rate and manually
     * move currentTime forward.
     */

    try {
      video.playbackRate = 1;
    } catch {}

    /*
     * Try to keep the media element playing.
     */

    if (video.paused) {
      video.play().catch(() => {});
    }

    function advance(now) {

      if (!state.running) {
        return;
      }

      if (!enabled) {
        stopTurbo(video);
        return;
      }

      if (currentSpeed <= NATIVE_MAX) {
        stopTurbo(video);
        applySpeed(video);
        return;
      }

      /*
       * Real elapsed wall-clock time.
       */

      const elapsed =
        (now - state.lastWallTime) / 1000;

      state.lastWallTime = now;

      /*
       * Ignore huge jumps caused by
       * tab sleeping/background throttling.
       */

      const safeElapsed =
        Math.min(elapsed, 0.25);

      /*
       * Target video-time progression.
       *
       * Example:
       *
       * 20x -> 20 seconds / real second
       * 30x -> 30 seconds / real second
       */

      const targetAdvance =
        safeElapsed * currentSpeed;

      let targetTime =
        video.currentTime + targetAdvance;

      /*
       * Never exceed duration.
       */

      if (
        Number.isFinite(video.duration)
      ) {

        targetTime =
          Math.min(
            video.duration,
            targetTime
          );

      }

      /*
       * Seek forward.
       */

      try {
        video.currentTime = targetTime;
      } catch {}

      /*
       * End reached.
       */

      if (
        Number.isFinite(video.duration) &&
        targetTime >= video.duration - 0.05
      ) {

        try {
          video.currentTime = video.duration;
        } catch {}

        stopTurbo(video);

        return;
      }

      state.raf =
        requestAnimationFrame(advance);
    }

    state.raf =
      requestAnimationFrame(advance);

    /*
     * Fallback timer.
     *
     * Some websites throttle RAF when
     * the popup/tab is not foregrounded.
     */

    state.interval =
      setInterval(() => {

        if (!state.running) {
          return;
        }

        if (
          !Number.isFinite(video.duration)
        ) {
          return;
        }

        if (
          currentSpeed <= NATIVE_MAX
        ) {
          return;
        }

        const now =
          performance.now();

        const elapsed =
          (now - state.lastWallTime) / 1000;

        /*
         * Avoid double-counting excessively.
         */

        if (elapsed < 0.05) {
          return;
        }

        state.lastWallTime = now;

        const advance =
          Math.min(
            elapsed,
            0.2
          ) * currentSpeed;

        let target =
          video.currentTime + advance;

        target =
          Math.min(
            video.duration,
            target
          );

        try {
          video.currentTime = target;
        } catch {}

      }, 100);
  }

  /*
   * -----------------------------------------
   * NORMAL PLAYBACK
   * -----------------------------------------
   */

  function applySpeed(video) {

    if (!isVideo(video)) {
      return;
    }

    stopTurbo(video);

    if (!enabled) {
      return;
    }

    const speed =
      normalizeSpeed(currentSpeed);

    /*
     * Normal mode.
     */

    if (speed <= NATIVE_MAX) {

      try {

        video.muted = false;

        video.defaultPlaybackRate =
          speed;

        video.playbackRate =
          speed;

      } catch {}

      return;
    }

    /*
     * Turbo mode.
     */

    startTurbo(video);
  }

  /*
   * -----------------------------------------
   * APPLY TO ALL VIDEOS
   * -----------------------------------------
   */

  function applyToAllVideos() {

    if (!enabled) {
      return;
    }

    document
      .querySelectorAll("video")
      .forEach(video => {

        applySpeed(video);

      });
  }

  /*
   * -----------------------------------------
   * NEW VIDEO DETECTION
   * -----------------------------------------
   */

  function processNode(node) {

    if (!(node instanceof Element)) {
      return;
    }

    if (node instanceof HTMLVideoElement) {
      applySpeed(node);
    }

    const videos =
      node.querySelectorAll?.("video");

    if (videos) {

      videos.forEach(video => {
        applySpeed(video);
      });

    }
  }

  /*
   * -----------------------------------------
   * MUTATION OBSERVER
   * -----------------------------------------
   */

  function startObserver() {

    const target =
      document.documentElement;

    if (!target) {

      setTimeout(
        startObserver,
        100
      );

      return;
    }

    const observer =
      new MutationObserver(
        mutations => {

          for (
            const mutation of mutations
          ) {

            for (
              const node of mutation.addedNodes
            ) {

              processNode(node);

            }

          }

        }
      );

    observer.observe(
      target,
      {
        childList: true,
        subtree: true
      }
    );
  }

  /*
   * -----------------------------------------
   * VIDEO EVENTS
   * -----------------------------------------
   */

  document.addEventListener(
    "loadedmetadata",
    event => {

      if (
        event.target instanceof HTMLVideoElement
      ) {

        applySpeed(
          event.target
        );

      }

    },
    true
  );

  document.addEventListener(
    "durationchange",
    event => {

      if (
        event.target instanceof HTMLVideoElement
      ) {

        applySpeed(
          event.target
        );

      }

    },
    true
  );

  document.addEventListener(
    "play",
    event => {

      if (
        event.target instanceof HTMLVideoElement
      ) {

        /*
         * Don't restart turbo every
         * time if already running.
         */

        if (
          currentSpeed > NATIVE_MAX &&
          !turbo.has(event.target)
        ) {

          startTurbo(
            event.target
          );

        } else if (
          currentSpeed <= NATIVE_MAX
        ) {

          applySpeed(
            event.target
          );

        }

      }

    },
    true
  );

  /*
   * -----------------------------------------
   * RATE CHANGE PROTECTION
   * -----------------------------------------
   *
   * Websites like YouTube can modify
   * playbackRate themselves.
   */

  document.addEventListener(
    "ratechange",
    event => {

      const video =
        event.target;

      if (!(video instanceof HTMLVideoElement)) {
        return;
      }

      if (
        enabled &&
        currentSpeed <= NATIVE_MAX
      ) {

        if (
          Math.abs(
            video.playbackRate -
            currentSpeed
          ) > 0.01
        ) {

          try {
            video.playbackRate =
              currentSpeed;
          } catch {}

        }

      }

    },
    true
  );

  /*
   * -----------------------------------------
   * MESSAGES FROM POPUP
   * -----------------------------------------
   */

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

      if (!message?.type) {
        return;
      }

      /*
       * SET SPEED
       */

      if (
        message.type === "SET_SPEED"
      ) {

        currentSpeed =
          normalizeSpeed(
            message.speed
          );

        if (
          typeof message.enabled ===
          "boolean"
        ) {

          enabled =
            message.enabled;

        }

        applyToAllVideos();

        sendResponse({
          success: true,
          speed: currentSpeed,
          enabled
        });

        return true;
      }

      /*
       * GET STATE
       */

      if (
        message.type === "GET_STATE"
      ) {

        sendResponse({
          success: true,
          speed: currentSpeed,
          enabled,

          videoCount:
            document.querySelectorAll(
              "video"
            ).length
        });

        return true;
      }

      /*
       * ENABLE / DISABLE
       */

      if (
        message.type === "SET_ENABLED"
      ) {

        enabled =
          Boolean(message.enabled);

        if (enabled) {

          applyToAllVideos();

        } else {

          document
            .querySelectorAll("video")
            .forEach(video => {

              stopTurbo(video);

              try {

                video.playbackRate = 1;
                video.defaultPlaybackRate = 1;
                video.muted = false;

              } catch {}

            });

        }

        sendResponse({
          success: true,
          enabled
        });

        return true;
      }

      /*
       * REAPPLY
       */

      if (
        message.type === "REAPPLY"
      ) {

        applyToAllVideos();

        sendResponse({
          success: true,
          speed: currentSpeed
        });

        return true;
      }

      /*
       * SKIP TO END
       */

      if (
        message.type === "SKIP_TO_END"
      ) {

        let count = 0;

        document
          .querySelectorAll("video")
          .forEach(video => {

            try {

              if (
                Number.isFinite(
                  video.duration
                )
              ) {

                video.currentTime =
                  video.duration;

                count++;

              }

            } catch {}

          });

        sendResponse({
          success: count > 0,
          count
        });

        return true;
      }
    }
  );

  /*
   * -----------------------------------------
   * LOAD SETTINGS
   * -----------------------------------------
   */

  async function loadSettings() {

    try {

      const settings =
        await chrome.storage.local.get([
          "videoSpeed",
          "videoEnabled"
        ]);

      if (
        typeof settings.videoSpeed ===
        "number"
      ) {

        currentSpeed =
          normalizeSpeed(
            settings.videoSpeed
          );

      }

      if (
        typeof settings.videoEnabled ===
        "boolean"
      ) {

        enabled =
          settings.videoEnabled;

      }

    } catch {}

  }

  /*
   * -----------------------------------------
   * INIT
   * -----------------------------------------
   */

  async function init() {

    await loadSettings();

    startObserver();

    applyToAllVideos();

    /*
     * Catch players that initialize
     * after page load.
     */

    setTimeout(
      applyToAllVideos,
      500
    );

    setTimeout(
      applyToAllVideos,
      1500
    );

    setTimeout(
      applyToAllVideos,
      3000
    );

    setTimeout(
      applyToAllVideos,
      5000
    );
  }

  init();

})();
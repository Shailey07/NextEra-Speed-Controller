// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['speed', 'enabled'], (result) => {
    const updates = {};
    if (result.speed === undefined) updates.speed = 2.0;
    if (result.enabled === undefined) updates.enabled = true;
    if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  const { speed = 2.0 } = await chrome.storage.local.get(['speed']);
  let newSpeed = speed;

  if (command === 'increase-speed') {
    newSpeed = Math.min(Math.round((speed + 0.5) * 100) / 100, 50);
  } else if (command === 'decrease-speed') {
    newSpeed = Math.max(Math.round((speed - 0.5) * 100) / 100, 0.25);
  } else if (command === 'reset-speed') {
    newSpeed = 1.0;
  }

  await chrome.storage.local.set({ speed: newSpeed });
});
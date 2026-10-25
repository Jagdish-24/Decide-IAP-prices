document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('btnTogglePanel');
  const feedbackEl = document.getElementById('popupFeedback');

  function showFeedback(text, isError = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = text;
    feedbackEl.style.color = isError ? '#F87171' : '#38BDF8';
    setTimeout(() => {
      if (feedbackEl.textContent === text) {
        feedbackEl.textContent = '';
      }
    }, 2800);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          showFeedback('No active browser tab found.', true);
          return;
        }

        const activeTab = tabs[0];
        const url = activeTab.url || '';

        if (!url.includes('play.google.com/console')) {
          showFeedback('Navigate to Google Play Console to use.', true);
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { action: 'togglePanel' }, (response) => {
          if (chrome.runtime.lastError) {
            showFeedback('Refresh Play Console page to connect.', true);
          } else if (response && typeof response.visible === 'boolean') {
            showFeedback(response.visible ? '✅ Automator Panel Shown' : '🙈 Automator Panel Hidden');
          } else {
            showFeedback('⚡ Toggled Automator Panel');
          }
        });
      });
    });
  }
});

/* One serialized writer prevents competing new tabs from advancing the same session. */
(function (root) {
  let queue = Promise.resolve();
  root.BackgroundFocusTimer = {
    handle(request, respond) {
      const task = () => new Promise(resolve => {
        chrome.storage.local.get({focusTimerState:null,focusWorkMinutes:25,focusBreakMinutes:5},data => {
          if (chrome.runtime.lastError) { respond({ok:false}); resolve(); return; }
          const next = root.FocusTimer.transition(data.focusTimerState,request.action,Date.now(),data.focusWorkMinutes,data.focusBreakMinutes,request.expectedEnd);
          if (JSON.stringify(next) === JSON.stringify(data.focusTimerState)) { respond({ok:true,state:next}); resolve(); return; }
          chrome.storage.local.set({focusTimerState:next},() => { respond({ok:!chrome.runtime.lastError,state:next}); resolve(); });
        });
      });
      queue = queue.then(task,task);
      return true;
    }
  };
}(typeof self !== 'undefined' ? self : globalThis));

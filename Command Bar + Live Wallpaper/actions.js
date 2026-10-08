(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ACTIONS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      id: 'new-tab',
      label: 'New Tab',
      keywords: ['new', 'tab', 'open', 'create'], aliases: ['nt']
    },
    {
      id: 'reload-tab',
      label: 'Reload Tab',
      keywords: ['reload', 'refresh', 'tab'], aliases: ['refresh']
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      keywords: ['close', 'remove', 'kill', 'tab'], aliases: ['close current']
    },
    {
      id: 'duplicate-tab',
      label: 'Duplicate Tab',
      keywords: ['duplicate', 'copy', 'clone', 'tab'], aliases: ['clone']
    },
    {
      id: 'reopen-closed-tab',
      label: 'Reopen Closed Tab',
      keywords: ['reopen', 'undo', 'restore', 'closed', 'tab'], aliases: ['undo close']
    },
    {
      id: 'close-other-tabs',
      label: 'Close Other Tabs In Window',
      keywords: ['close', 'other', 'tabs', 'clean', 'purge']
    },
    {
      id: 'toggle-pin-tab',
      label: 'Toggle Pin Tab',
      keywords: ['pin', 'unpin', 'tab', 'sticky']
    },
    {
      id: 'toggle-mute-tab',
      label: 'Toggle Mute Tab',
      keywords: ['mute', 'unmute', 'audio', 'sound', 'tab']
    },
    {
      id: 'discard-background-tabs',
      label: 'Discard Background Tabs (Free RAM)',
      keywords: ['discard', 'memory', 'ram', 'clean', 'purge', 'tab']
    },
    {
      id: 'move-tab-new-window',
      label: 'Move Tab to New Window',
      keywords: ['move', 'detach', 'window', 'tab']
    },
    {
      id: 'open-history',
      label: 'Open History',
      keywords: ['history', 'past', 'visited', 'log']
    },
    {
      id: 'open-downloads',
      label: 'Open Downloads Folder',
      keywords: ['downloads', 'files', 'saved']
    },
    {
      id: 'open-bookmarks',
      label: 'Open Bookmarks Manager',
      keywords: ['bookmarks', 'favorites', 'saved', 'manager']
    },
    {
      id: 'copy-url',
      label: 'Copy Current URL',
      keywords: ['copy', 'url', 'link', 'address', 'clipboard']
    },
    {
      id: 'copy-title-url',
      label: 'Copy Title + URL',
      keywords: ['copy', 'title', 'url', 'link', 'clipboard'], aliases: ['copy page']
    },
    {
      id: 'go-back',
      label: 'Go Back',
      keywords: ['back', 'previous', 'history']
    },
    {
      id: 'go-forward',
      label: 'Go Forward',
      keywords: ['forward', 'next', 'history']
    }
  ];
}));

(function (root) {
  const actions = root.ACTIONS || [];
  root.ActionRegistry = {
    all: function () { return actions.slice(); },
    enabled: function (disabled) {
      const blocked = Array.isArray(disabled) ? disabled : [];
      return actions.filter((action) => !blocked.includes(action.id));
    },
    searchText: function (action) {
      return [action.label].concat(action.keywords || [], action.aliases || []).join(' ');
    },
    aliasesFor: function (action) { return (action.aliases || []).slice(); }
  };
}(typeof self !== 'undefined' ? self : window));

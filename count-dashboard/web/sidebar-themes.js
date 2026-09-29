(() => {
  const sidebar = document.querySelector('.desk-sidebar');
  const trigger = document.querySelector('#deskThemeButton');
  const panel = document.querySelector('#deskThemeManager');
  const grid = document.querySelector('#deskThemeGrid');
  const status = document.querySelector('#deskThemeStatus');
  if (!sidebar || !trigger || !panel || !grid || !status) return;

  const storageKey = 'countdesk-sidebar-theme-v1';
  const themes = [
    {id:'dracula',name:'Dracula',bg:'#282a36',surface:'#343746',active:'#44475a',text:'#f8f8f2',muted:'#bd93f9',accent:'#ff79c6',border:'#494b5c',hover:'#383b4b'},
    {id:'catppuccin-mocha',name:'Catppuccin Mocha',bg:'#1e1e2e',surface:'#29293b',active:'#45475a',text:'#cdd6f4',muted:'#a6adc8',accent:'#cba6f7',border:'#3b3b52',hover:'#303044'},
    {id:'tokyo-night-oled',name:'Tokyo Night OLED',bg:'#101014',surface:'#17171f',active:'#242432',text:'#c0caf5',muted:'#7aa2f7',accent:'#bb9af7',border:'#292937',hover:'#1b1b27'},
    {id:'rose-pine-dark',name:'Rose Pine Dark',bg:'#191724',surface:'#1f1d2e',active:'#26233a',text:'#e0def4',muted:'#908caa',accent:'#ebbcba',border:'#393552',hover:'#242238'},
    {id:'gruvbox-material',name:'Gruvbox Material',bg:'#282828',surface:'#32302f',active:'#45403d',text:'#d4be98',muted:'#a89984',accent:'#e78a4e',border:'#504945',hover:'#3a3836'},
    {id:'one-dark-pro',name:'One Dark Pro',bg:'#21252b',surface:'#282c34',active:'#323842',text:'#abb2bf',muted:'#7f848e',accent:'#61afef',border:'#3a404b',hover:'#2b3039'},
    {id:'monokai',name:'Monokai',bg:'#272822',surface:'#34352f',active:'#414339',text:'#f8f8f2',muted:'#a6a69c',accent:'#a6e22e',border:'#494a40',hover:'#393a33'},
    {id:'solarized',name:'Solarized',bg:'#002b36',surface:'#073642',active:'#16404b',text:'#eee8d5',muted:'#93a1a1',accent:'#2aa198',border:'#28525b',hover:'#0d3d48'},
    {id:'flexoki-dark',name:'Flexoki Dark',bg:'#100f0f',surface:'#1c1b1a',active:'#282726',text:'#cecdc3',muted:'#878580',accent:'#4385be',border:'#343331',hover:'#222120'},
    {id:'black-gold',name:'Black Gold',bg:'#090909',surface:'#15130f',active:'#2c2413',text:'#e6d5a9',muted:'#a39880',accent:'#d8af48',border:'#393124',hover:'#211b10'},
    {id:'frost',name:'Frost',bg:'#111b27',surface:'#1a2938',active:'#263c50',text:'#e2f0fa',muted:'#9eb8cb',accent:'#72c7e8',border:'#33495a',hover:'#203447'},
    {id:'evergarden',name:'Evergarden',bg:'#14211b',surface:'#1b2d24',active:'#284133',text:'#e0e9d7',muted:'#a3b99e',accent:'#a3d977',border:'#385143',hover:'#22382b'},
    {id:'matrix',name:'Matrix',bg:'#050b07',surface:'#0d1710',active:'#14271a',text:'#d1ffd8',muted:'#79ad82',accent:'#53f28b',border:'#25462e',hover:'#102016'},
    {id:'sakura',name:'Sakura',bg:'#281720',surface:'#3b2231',active:'#53304a',text:'#f5e1ed',muted:'#c99ab4',accent:'#f08eb7',border:'#624057',hover:'#48283b'},
    {id:'neon-dusk',name:'Neon Dusk',bg:'#171322',surface:'#242039',active:'#332852',text:'#ece8ff',muted:'#a79bcf',accent:'#fd72d5',border:'#453b64',hover:'#2c2546'},
    {id:'synthwave-84',name:'Synthwave ’84',bg:'#241b2f',surface:'#342444',active:'#493060',text:'#f8ecff',muted:'#c3a7e7',accent:'#ff7edb',border:'#5b3c6e',hover:'#402b54'},
    {id:'van-gogh',name:'Van Gogh',bg:'#14283f',surface:'#1d3653',active:'#2b4b6a',text:'#e2d6bd',muted:'#adbea8',accent:'#eebc5b',border:'#3b5d78',hover:'#24425f'},
    {id:'sunset-drive',name:'Sunset Drive',bg:'#21182a',surface:'#342038',active:'#4b2c47',text:'#f7e5ce',muted:'#c9a6a0',accent:'#ff835a',border:'#654156',hover:'#402543'},
    {id:'monochrome',name:'Monochrome',bg:'#171717',surface:'#252525',active:'#363636',text:'#f2f2f2',muted:'#a0a0a0',accent:'#e0e0e0',border:'#444444',hover:'#303030'},
    {id:'neptune-blue',name:'Neptune Blue',bg:'#071a2b',surface:'#102a42',active:'#193c59',text:'#d8ecff',muted:'#8eb8db',accent:'#42b7d8',border:'#284b65',hover:'#17334d'},
  ];

  const defaultPalette = {
    bg:'#0d151e',surface:'#101c27',active:'#18353b',text:'#dce7ed',muted:'#91a7b5',
    accent:'#cefff3',border:'#253442',hover:'#142833',
  };

  function selectedId() {
    try { return localStorage.getItem(storageKey) || 'default'; } catch { return 'default'; }
  }

  function applyTheme(id, persist = true) {
    const theme = themes.find(item => item.id === id);
    const palette = theme || defaultPalette;
    sidebar.style.setProperty('--sidebar-bg', palette.bg);
    sidebar.style.setProperty('--sidebar-surface', palette.surface);
    sidebar.style.setProperty('--sidebar-active', palette.active);
    sidebar.style.setProperty('--sidebar-text', palette.text);
    sidebar.style.setProperty('--sidebar-muted', palette.muted);
    sidebar.style.setProperty('--sidebar-accent', palette.accent);
    sidebar.style.setProperty('--sidebar-border', palette.border);
    sidebar.style.setProperty('--sidebar-hover', palette.hover);
    if (persist) {
      try {
        if (theme) localStorage.setItem(storageKey, theme.id);
        else localStorage.removeItem(storageKey);
      } catch {}
    }
    status.textContent = theme ? `${theme.name} applied · left rail only` : 'Count Desk default';
    grid.querySelectorAll('[data-theme-id]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeId === (theme?.id || '')));
    });
  }

  for (const theme of themes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desk-theme-choice';
    button.dataset.themeId = theme.id;
    button.setAttribute('aria-pressed', 'false');
    const swatches = document.createElement('span');
    swatches.className = 'desk-theme-swatches';
    swatches.setAttribute('aria-hidden', 'true');
    for (const color of [theme.bg, theme.surface, theme.active, theme.accent]) {
      const swatch = document.createElement('i');
      swatch.style.backgroundColor = color;
      swatches.append(swatch);
    }
    const name = document.createElement('span');
    name.textContent = theme.name;
    button.append(swatches, name);
    button.addEventListener('click', () => applyTheme(theme.id));
    grid.append(button);
  }

  const closeButton = document.querySelector('#deskThemeClose');
  function positionPanel() {
    const edge = sidebar.getBoundingClientRect().right;
    const width = panel.getBoundingClientRect().width;
    panel.style.left = `${Math.max(12, Math.min(edge + 10, innerWidth - width - 12))}px`;
  }
  function closePanel(restoreFocus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) {
      positionPanel();
      closeButton.focus();
    }
  });
  closeButton.addEventListener('click', () => closePanel(true));
  document.querySelector('#deskThemeReset').addEventListener('click', () => applyTheme('default'));
  document.addEventListener('click', event => {
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) closePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closePanel(true);
  });
  addEventListener('resize', () => { if (!panel.hidden) positionPanel(); });

  applyTheme(selectedId(), false);
})();

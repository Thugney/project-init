(() => {
  'use strict';
  const source = document.getElementById('board-data');
  const mount = document.getElementById('board');
  if (!source || !mount) return;
  const data = JSON.parse(source.textContent);
  const columns = new Map(data.columns.map((column) => [column.id, column.title]));
  const tickets = data.tickets.map((ticket) => ({ ...ticket }));
  const storageKey = `codex-lean-kit:v1:${data.boardId}:${mount.dataset.sourceHash}`;
  const storageAllowed = (() => { try { return typeof localStorage !== 'undefined'; } catch { return false; } })();
  try {
    if (storageAllowed) {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      tickets.forEach((ticket) => {
        if (typeof saved[ticket.id] === 'string' && columns.has(saved[ticket.id])) ticket.column = saved[ticket.id];
      });
    }
  } catch { /* File-based browser storage may be unavailable. The board still works. */ }
  const make = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  function persist() {
    try {
      if (storageAllowed) localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(tickets.map((t) => [t.id, t.column]))));
    } catch { /* Export remains available when persistence is disabled. */ }
  }
  function move(id, column) {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket || !columns.has(column)) return;
    ticket.column = column;
    persist();
    draw();
  }
  function draw() {
    mount.replaceChildren();
    mount.style.setProperty('--cols', String(columns.size));
    const summary = document.getElementById('summary');
    summary.replaceChildren();
    summary.append(make('span', 'metric', `${tickets.length} total`));
    for (const [id, title] of columns) {
      const count = tickets.filter((ticket) => ticket.column === id).length;
      summary.append(make('span', 'metric', `${count} ${title}`));
      const lane = make('section', 'lane');
      lane.setAttribute('aria-label', `${title} tickets`);
      const head = make('div', 'lane-head');
      head.append(make('h2', '', title), make('span', 'count', count));
      const list = make('div', 'tickets');
      for (const ticket of tickets.filter((ticket) => ticket.column === id)) {
        const card = make('article', 'ticket');
        card.tabIndex = 0;
        card.draggable = true;
        card.dataset.ticketId = ticket.id;
        card.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', ticket.id);
          event.dataTransfer.effectAllowed = 'move';
        });
        card.append(make('div', 'ticket-id', ticket.id), make('h3', '', ticket.title));
        const meta = make('div', 'ticket-meta');
        if (ticket.priority) meta.append(make('span', `pill ${ticket.priority.toLowerCase() === 'high' ? 'high' : ''}`, ticket.priority));
        if (ticket.owner) meta.append(make('span', 'pill', ticket.owner));
        card.append(meta);
        if (ticket.notes) card.append(make('p', '', ticket.notes));
        const moveLabel = make('label', 'hint', 'Move ticket to');
        const picker = make('select');
        picker.setAttribute('aria-label', `Move ${ticket.id}`);
        for (const [optionId, optionTitle] of columns) {
          const option = make('option', '', optionTitle);
          option.value = optionId;
          picker.append(option);
        }
        picker.value = ticket.column;
        picker.addEventListener('change', () => move(ticket.id, picker.value));
        moveLabel.append(picker);
        card.append(moveLabel);
        list.append(card);
      }
      lane.append(head, list);
      lane.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
      lane.addEventListener('dragenter', (event) => { event.preventDefault(); lane.classList.add('drop-target'); });
      lane.addEventListener('dragleave', (event) => { if (!lane.contains(event.relatedTarget)) lane.classList.remove('drop-target'); });
      lane.addEventListener('drop', (event) => {
        event.preventDefault();
        lane.classList.remove('drop-target');
        move(event.dataTransfer.getData('text/plain'), id);
      });
      mount.append(lane);
    }
  }
  document.getElementById('export-board').addEventListener('click', () => {
    const payload = JSON.stringify({ ...data, tickets }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.boardId.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  draw();
})();

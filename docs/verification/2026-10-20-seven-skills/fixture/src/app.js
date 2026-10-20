'use strict';

const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'light' || theme === 'dark') {
  document.documentElement.dataset.theme = theme;
}

let count = 0;
const metric = document.querySelector('[data-testid="count"]');
const emptyState = document.querySelector('.empty-state');

function render() {
  metric.textContent = String(count);
  emptyState.hidden = count > 0;
}

document.getElementById('increment').addEventListener('click', () => {
  count += 1;
  render();
});
document.getElementById('reset').addEventListener('click', () => {
  count = 0;
  render();
});
render();

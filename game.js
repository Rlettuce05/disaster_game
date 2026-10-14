const scenarios = [
  { id: 'earthquake', name: 'Earthquake', durationSeconds: 30 },
  { id: 'flood', name: 'Flood', durationSeconds: 45 },
];

const list = document.getElementById('scenarios');
for (const s of scenarios) {
  const li = document.createElement('li');
  li.textContent = `${s.name} (${s.durationSeconds}s)`;
  list.appendChild(li);
}

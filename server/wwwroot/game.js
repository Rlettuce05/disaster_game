async function loadScenarios() {
  const res = await fetch('/api/scenarios');
  const scenarios = await res.json();
  const list = document.getElementById('scenarios');
  for (const s of scenarios) {
    const li = document.createElement('li');
    li.textContent = `${s.name} (${s.durationSeconds}s)`;
    list.appendChild(li);
  }
}

loadScenarios();

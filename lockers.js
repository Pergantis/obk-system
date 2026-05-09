// --- SKAPLEIE LOGIKK (KUN VISUELT FORELØPIG) ---
function renderVisualLockers() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    
    let html = "";
    for (let i = 1; i <= 100; i++) {
        html += `<div class="locker-box">${i}</div>`;
    }
    grid.innerHTML = html;
}

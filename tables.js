let tableData = [];
let currentStoppingId = null;

async function loadTables() {
    const { data, error } = await sb.from('bord_status').select('*').order('bord_nummer');
    if (!error) { tableData = data; renderGrid(); }
}

function renderGrid() {
    const grid = document.getElementById('bord-grid');
    if (!grid) return;
    grid.innerHTML = tableData.map(b => {
        const isActive = b.status === 'Opptatt';
        const start = b.start_tid ? new Date(b.start_tid) : null;
        const diff = start ? Math.floor((new Date() - start) / 60000) : 0;
        const btnColor = b.bord_nummer <= 10 ? 'var(--biljard-blaa)' : (b.bord_nummer <= 16 ? '#6D8196' : '#CAC254');
        return `<div class="card ${isActive ? 'active' : ''}">
            <h3>Bord ${b.bord_nummer}</h3>
            <div class="timer-text">${isActive ? diff + ' min' : 'LEDIG'}</div>
            ${isActive ? `<div style="font-size:11px; color:var(--biljard-gronn); font-weight:bold; height:18px;">👤 ${b.kunde_navn || ''}</div>` : 
            `<input type="text" id="name-${b.bord_nummer}" class="name-in" style="font-size:12px; margin-bottom:5px;" placeholder="Spiller valgfritt">`}
            <button class="btn" style="background:${isActive ? 'var(--advarsel)' : btnColor}" 
                onclick="${isActive ? `openModal(${b.bord_nummer}, '${b.start_tid}', '${b.kunde_navn}')` : `startTable(${b.bord_nummer})` }">${isActive ? 'STOPP' : 'START'}</button>
        </div>`;
    }).join('');
}

async function startTable(id) {
    const name = document.getElementById(`name-${id}`).value;
    showLoader(true);
    await sb.from('bord_status').update({ status: 'Opptatt', start_tid: new Date().toISOString(), kunde_navn: name }).eq('bord_nummer', id);
    showLoader(false); loadTables();
}

function openModal(id, start, name) {
    currentStoppingId = id;
    const diff = Math.max(1, Math.floor((new Date() - new Date(start)) / 60000));
    document.getElementById('modal-minutes').innerText = diff;
    document.getElementById('modal-player').innerText = "👤 " + (name && name !== 'null' ? name : 'Anonym');
    document.getElementById('modal-overlay').style.display = 'flex';
}

async function confirmStop() {
    showLoader(true);
    await sb.from('bord_status').update({ status: 'Ledig', start_tid: null, kunde_navn: null }).eq('bord_nummer', currentStoppingId);
    document.getElementById('modal-overlay').style.display = 'none';
    showLoader(false); loadTables();
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }
setInterval(loadTables, 10000);

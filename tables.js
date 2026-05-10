// --- BORDKONTROLL LOGIKK ---
let tableData = [];
let currentStoppingId = null;

// Henter status på alle 20 bordene fra Supabase
async function loadTables() {
    const { data, error } = await sb.from('bord_status').select('*').order('bord_nummer');
    if (!error) { 
        tableData = data; 
        renderGrid(); 
    }
}

// Tegner opp bordene i rutenettet
function renderGrid() {
    const grid = document.getElementById('bord-grid');
    if (!grid) return;

    grid.innerHTML = tableData.map(b => {
        const isActive = b.status === 'Opptatt';
        const start = b.start_tid ? new Date(b.start_tid) : null;
        const diff = start ? Math.floor((new Date() - start) / 60000) : 0;
        
        // Finn riktig sone-klasse og topp-kant farge
        let soneClass = '';
        let borderTopClass = '';

        if (b.bord_nummer <= 10) {
            soneClass = 'bg-sone-blaa';
            borderTopClass = 'card-blue';
        } else if (b.bord_nummer <= 16) {
            soneClass = 'bg-sone-graa';
            borderTopClass = 'card-marine';
        } else {
            soneClass = 'bg-sone-beige';
            borderTopClass = 'card-gold';
        }

        // Hvis bordet er opptatt (active), bruker vi ikke sone-bakgrunnen
        const applyClass = isActive ? 'active' : soneClass;

        return `
            <div class="admin-card table-card ${borderTopClass} ${applyClass}">
                <h3>Bord ${b.bord_nummer}</h3>
                <div class="timer-text">${isActive ? diff + ' min' : 'LEDIG'}</div>
                
                ${isActive ? 
                    `<div style="font-size:12px; color:var(--biljard-gronn); font-weight:bold; margin-bottom:10px; height:20px;">👤 ${b.kunde_navn || 'Anonym'}</div>` : 
                    `<input type="text" id="name-${b.bord_nummer}" class="input-field" style="padding:5px; margin-bottom:5px; text-align:center; background: rgba(255,255,255,0.5);" placeholder="Navn">`
                }
                
                <button class="btn" 
                    style="background:${isActive ? 'var(--advarsel)' : 'var(--marine)'}" 
                    onclick="${isActive ? `openModal(${b.bord_nummer}, '${b.start_tid}', '${b.kunde_navn}')` : `startTable(${b.bord_nummer})` }">
                    ${isActive ? 'STOPP' : 'START'}
                </button>
            </div>`;
    }).join('');
}

async function startTable(id) {
    const nameInput = document.getElementById(`name-${id}`);
    const name = nameInput ? nameInput.value : "";
    showLoader(true);
    await sb.from('bord_status').update({ 
        status: 'Opptatt', 
        start_tid: new Date().toISOString(), 
        kunde_navn: name 
    }).eq('bord_nummer', id);
    showLoader(false); 
    loadTables();
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
    await sb.from('bord_status').update({ 
        status: 'Ledig', 
        start_tid: null, 
        kunde_navn: null 
    }).eq('bord_nummer', currentStoppingId);
    document.getElementById('modal-overlay').style.display = 'none';
    showLoader(false); 
    loadTables();
}

function closeModal() { 
    document.getElementById('modal-overlay').style.display = 'none'; 
}

// Oppdaterer hvert 10. sekund
setInterval(loadTables, 10000);

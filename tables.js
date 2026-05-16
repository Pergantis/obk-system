// --- BORDKONTROLL LOGIKK ---
let tableData = [];
let currentStoppingId = null;

// Henter status på alle 20 bordene fra Supabase
async function loadTables() {
     // Last historikk med en gang også
    await loadTodayHistory();  // <-- LEGG TIL ØVERST    
    const { data, error } = await sb.from('bord_status').select('*').order('bord_nummer');
    if (!error) { 
        // Lagre det brukeren eventuelt skriver akkurat nå før vi tegner på nytt
        const activeId = document.activeElement ? document.activeElement.id : null;
        const currentInputs = {};
        
        tableData.forEach(b => {
            const input = document.getElementById(`name-${b.bord_nummer}`);
            if (input) currentInputs[b.bord_nummer] = input.value;
        });

        tableData = data; 
        renderGrid(currentInputs, activeId); 
    }
}
// Henter dagens ferdige utleier fra historikktabellen
async function loadTodayHistory() {
    const tbody = document.getElementById('history-table-body');
    const countSpan = document.getElementById('history-count');
    
    if (!tbody) return;
    
    try {
        // Hent dagens dato i riktig format (YYYY-MM-DD)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Neste dag for å avgrense søket
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        // Hent alle utleier fra i dag (som har slutt_tid, dvs. ferdige)
        const { data, error } = await sb
            .from('bord_leie_historikk')
            .select('*')
            .gte('start_tid', todayStr)
            .lt('start_tid', tomorrowStr)
            .not('slutt_tid', 'is', null)  // Kun ferdige utleier
            .order('slutt_tid', { ascending: false });  // Nyeste først
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding: 30px; color: var(--tekst-lys);">
                        🎱 Ingen bord er leid ut enda
                    </td>
                </tr>
            `;
            if (countSpan) countSpan.innerText = `0 bord i dag`;
            return;
        }
        
        // Render tabellen
        renderHistoryTable(data);
        
        // Oppdater telleren
        if (countSpan) {
            countSpan.innerText = `${data.length} bord i dag`;
        }
        
    } catch (err) {
        console.error("Feil ved henting av dagens historikk:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding: 30px; color: var(--advarsel);">
                    ❌ Klarte ikke laste historikk
                </td>
            </tr>
        `;
    }
}

// Render historikktabellen
function renderHistoryTable(historyData) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    historyData.forEach(record => {
        const tr = document.createElement('tr');
        
        // Formater norske datoer
        const startFormatted = formatNorwegianDate(record.start_tid);
        const sluttFormatted = formatNorwegianDate(record.slutt_tid);
        
        // Varighet (allerede lagret i databasen, men vi kan også beregne)
        let varighetTekst = '';
        if (record.varighet_minutter) {
            const timer = Math.floor(record.varighet_minutter / 60);
            const minutter = record.varighet_minutter % 60;
            
            if (timer > 0) {
                varighetTekst = `${timer}t ${minutter}min`;
            } else {
                varighetTekst = `${minutter}min`;
            }
        } else {
            // Fallback: beregn selv
            const start = new Date(record.start_tid);
            const slutt = new Date(record.slutt_tid);
            const diffMin = Math.max(1, Math.floor((slutt - start) / 60000));
            const timer = Math.floor(diffMin / 60);
            const minutter = diffMin % 60;
            
            if (timer > 0) {
                varighetTekst = `${timer}t ${minutter}min`;
            } else {
                varighetTekst = `${minutter}min`;
            }
        }
        
        tr.innerHTML = `
            <td style="font-weight: bold; text-align: center;">${record.bord_nummer}</td>
            <td>${escapeHtml(record.kunde_navn || 'Anonym')}</td>
            <td>${startFormatted}</td>
            <td>${sluttFormatted}</td>
            <td style="font-weight: bold; color: var(--marine);">${varighetTekst}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Hjelpefunksjon for norsk datoformat
function formatNorwegianDate(isoString) {
    if (!isoString) return '-';
    
    const date = new Date(isoString);
    const dag = date.getDate().toString().padStart(2, '0');
    const maned = (date.getMonth() + 1).toString().padStart(2, '0');
    const ar = date.getFullYear();
    const timer = date.getHours().toString().padStart(2, '0');
    const minutter = date.getMinutes().toString().padStart(2, '0');
    
    return `${dag}.${maned}.${ar} ${timer}:${minutter}`;
}

// Tegner opp bordene i rutenettet
function renderGrid(savedNames = {}, focusId = null) {
    const grid = document.getElementById('bord-grid');
    if (!grid) return;

    grid.innerHTML = tableData.map(b => {
        const isActive = b.status === 'Opptatt';
        const start = b.start_tid ? new Date(b.start_tid) : null;
        const diff = start ? Math.floor((new Date() - start) / 60000) : 0;
        
        let borderTopClass = b.bord_nummer <= 10 ? 'card-blue' : (b.bord_nummer <= 16 ? 'card-marine' : 'card-gold');
        let soneClass = b.bord_nummer <= 10 ? 'bg-sone-blaa' : (b.bord_nummer <= 16 ? 'bg-sone-graa' : 'bg-sone-beige');
        const applyClass = isActive ? 'active' : soneClass;

        // Behold navnet som ble skrevet inn hvis bordet er ledig
        const temporaryName = savedNames[b.bord_nummer] || "";

        return `
            <div class="admin-card table-card ${borderTopClass} ${applyClass}">
                <h3>Bord ${b.bord_nummer}</h3>
                <div class="timer-text">${isActive ? diff + ' min' : 'LEDIG'}</div>
                
                ${isActive ? 
                    `<div style="font-size:12px; color:var(--biljard-gronn); font-weight:bold; margin-bottom:10px; height:20px;">👤 ${escapeHtml(b.kunde_navn || 'Anonym')}</div>` : 
                    `<input type="text" id="name-${b.bord_nummer}" class="input-field" 
                        style="padding:5px; margin-bottom:5px; text-align:center; background: rgba(255,255,255,0.5);" 
                        placeholder="Navn" value="${escapeHtml(temporaryName)}">`
                }
                
                <button class="btn" 
                    style="background:${isActive ? 'var(--advarsel)' : 'var(--marine)'}" 
                    onclick="${isActive ? `openModal(${b.bord_nummer}, '${b.start_tid}', '${b.kunde_navn}')` : `startTable(${b.bord_nummer})` }">
                    ${isActive ? 'STOPP' : 'START'}
                </button>
            </div>`;
    }).join('');

    // Sett fokuset tilbake der det var, så brukeren kan fortsette å skrive
    if (focusId) {
        const element = document.getElementById(focusId);
        if (element) {
            element.focus();
            // Flytt markøren til slutten av teksten
            const val = element.value;
            element.value = '';
            element.value = val;
        }
    }
}

// Hjelpefunksjon for å unngå krasj ved spesialtegn i navn
function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// ... resten av funksjonene (startTable, openModal, confirmStop, closeModal) forblir like ...
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
    
    // 1. Hent bord-data før vi sletter/endrer det
    const bord = tableData.find(b => b.bord_nummer === currentStoppingId);
    if (bord && bord.start_tid) {
        const start = new Date(bord.start_tid);
        const slutt = new Date();
        const varighet = Math.max(1, Math.floor((slutt - start) / 60000));

        // 2. Lagre til historikk
        await sb.from('bord_leie_historikk').insert({
            bord_nummer: bord.bord_nummer,
            kunde_navn: bord.kunde_navn,
            start_tid: bord.start_tid,
            slutt_tid: slutt.toISOString(),
            varighet_minutter: varighet
        });
    }

    // 3. Frigjør bordet
    await sb.from('bord_status').update({ 
        status: 'Ledig', 
        start_tid: null, 
        kunde_navn: null 
    }).eq('bord_nummer', currentStoppingId);
    
    document.getElementById('modal-overlay').style.display = 'none';
    showLoader(false); 
    
    // 4. Oppdater både bord OG historikk
    await loadTables();
    await loadTodayHistory();  // <-- LEGG TIL DENNE LINJEN
}

function closeModal() { 
    document.getElementById('modal-overlay').style.display = 'none'; 
}

// Oppdaterer hvert 10. sekund
setInterval(loadTables, 10000);

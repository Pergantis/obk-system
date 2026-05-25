// --- BORDKONTROLL LOGIKK ---
const BORD_POLL_INTERVAL_MS = 10000;

let tableData = [];
let currentStoppingId = null;
let confirmStopInProgress = false; // hindrer dobbelt-trykk på BEKREFT

// Henter status på alle 20 bordene fra Supabase
async function loadTables() {
    await loadTodayHistory();
    const { data, error } = await sb.from('bord_status').select('*').order('bord_nummer');
    if (error) {
        console.error("Feil ved henting av bord-status:", error);
        return;
    }
    tableData = data;
    refreshGrid();
}
// Henter dagens ferdige utleier fra historikktabellen
async function loadTodayHistory() {
    const tbody = document.getElementById('history-table-body');
    const countSpan = document.getElementById('history-count');
    
    if (!tbody) return;
    
    try {
        // Bruk lokale dato-hjelpere — toISOString() gir UTC, som kan bli
        // gårsdagens dato mellom 23:00 og midnatt norsk tid (UTC+1/+2).
        const todayStr = getTodayLocal();
        const tomorrowStr = addDaysLocal(todayStr, 1);

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

// Oppdaterer rutenettet. Hvis grid'en allerede er tegnet og ingen bord har
// endret status, oppdateres kun timer-teksten — input-felter, markør og
// tekstmarkering forblir urørt. Full re-render skjer kun ved status-endring
// eller første tegning.
function refreshGrid() {
    const grid = document.getElementById('bord-grid');
    if (!grid) return;

    const existingCards = grid.querySelectorAll('[data-bord]');
    let needsFullRender = existingCards.length !== tableData.length;

    if (!needsFullRender) {
        for (const b of tableData) {
            const card = grid.querySelector(`[data-bord="${b.bord_nummer}"]`);
            if (!card) { needsFullRender = true; break; }
            const isActive = b.status === 'Opptatt';
            if (card.dataset.active !== String(isActive)) { needsFullRender = true; break; }
        }
    }

    if (needsFullRender) {
        // Bevar input-verdier og fokus før full re-render
        const activeId = document.activeElement ? document.activeElement.id : null;
        const savedInputs = {};
        existingCards.forEach(card => {
            const num = card.dataset.bord;
            const input = card.querySelector(`#name-${num}`);
            if (input) savedInputs[num] = input.value;
        });
        renderGrid(savedInputs, activeId);
        return;
    }

    // Kun timer-oppdatering på aktive bord — rører ikke input på ledige.
    for (const b of tableData) {
        if (b.status !== 'Opptatt' || !b.start_tid) continue;
        const card = grid.querySelector(`[data-bord="${b.bord_nummer}"]`);
        const timerEl = card?.querySelector('.timer-text');
        if (!timerEl) continue;
        const start = new Date(b.start_tid);
        const diff = Math.floor((new Date() - start) / 60000);
        timerEl.innerText = diff + ' min';
    }
}

// Tegner opp bordene i rutenettet (full re-render).
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
            <div class="admin-card table-card ${borderTopClass} ${applyClass}" data-bord="${b.bord_nummer}" data-active="${isActive}">
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
                    onclick="${isActive ? `openModal(${b.bord_nummer})` : `startTable(${b.bord_nummer})` }">
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

async function startTable(id) {
    const nameInput = document.getElementById(`name-${id}`);
    const name = nameInput ? nameInput.value : "";
    showLoader(true);
    try {
        const { error } = await sb.from('bord_status').update({
            status: 'Opptatt',
            start_tid: new Date().toISOString(),
            kunde_navn: name
        }).eq('bord_nummer', id);

        if (error) {
            console.error("Feil ved start av bord:", error);
            visBeskjed("FEIL", `Klarte ikke starte bord ${id}. Prøv igjen.`, "error");
            return;
        }
        await loadTables();
    } finally {
        showLoader(false);
    }
}

function openModal(id) {
    const bord = tableData.find(b => b.bord_nummer === id);
    if (!bord || !bord.start_tid) return;
    currentStoppingId = id;
    // Pause polling mens modalen er åpen — så en poll-tick ikke kan
    // klabbe tableData mens brukeren bekrefter, eller skrive duplikater
    // hvis en annen klient har frigjort bordet samtidig.
    stopBordPolling();
    const diff = Math.max(1, Math.floor((new Date() - new Date(bord.start_tid)) / 60000));
    document.getElementById('modal-minutes').innerText = diff;
    document.getElementById('modal-player').innerText = "👤 " + (bord.kunde_navn || 'Anonym');
    document.getElementById('modal-overlay').style.display = 'flex';
}

async function confirmStop() {
    if (confirmStopInProgress) return;

    const bord = tableData.find(b => b.bord_nummer === currentStoppingId);
    if (!bord || !bord.start_tid) {
        closeModal();
        return;
    }

    try {
        // Sett flagget INNE i try slik at finally-blokken garantert resetter den
        // selv hvis en av de neste linjene kaster.
        confirmStopInProgress = true;
        showLoader(true);
        const slutt = new Date();
        const varighet = Math.max(1, Math.floor((slutt - new Date(bord.start_tid)) / 60000));

        // 1. Lagre til historikk FØRST. Hvis dette feiler skal bordet IKKE
        //    frigjøres — ellers mister vi utleien fra historikken.
        const { error: histError } = await sb.from('bord_leie_historikk').insert({
            bord_nummer: bord.bord_nummer,
            kunde_navn: bord.kunde_navn,
            start_tid: bord.start_tid,
            slutt_tid: slutt.toISOString(),
            varighet_minutter: varighet
        });

        if (histError) {
            console.error("Feil ved lagring av bord-historikk:", histError);
            visBeskjed("FEIL", "Klarte ikke lagre utleien i historikken. Bordet er IKKE frigjort. Prøv igjen.", "error");
            return;
        }

        // 2. Frigjør bordet. Hvis dette feiler er historikken allerede skrevet,
        //    så vi må advare brukeren om at de IKKE må trykke STOPP igjen
        //    (det ville lagt inn en duplikat-rad i historikken).
        const { error: statusError } = await sb.from('bord_status').update({
            status: 'Ledig',
            start_tid: null,
            kunde_navn: null
        }).eq('bord_nummer', currentStoppingId);

        if (statusError) {
            console.error("Feil ved frigjøring av bord:", statusError);
            visBeskjed(
                "ADVARSEL",
                `Utleien er notert som ferdig, men status-oppdateringen for bord ${bord.bord_nummer} feilet. Last inn siden på nytt — IKKE trykk STOPP igjen (det vil opprette duplikat i historikken).`,
                "error"
            );
            return;
        }

        await loadTables();
    } finally {
        showLoader(false);
        confirmStopInProgress = false;
        closeModal();
    }
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    // Gjenoppta polling kun hvis brukeren fortsatt er på bord-modulen.
    if (document.getElementById('mod-bord')?.classList.contains('active')) {
        startBordPolling();
    }
}

// --- POLLING ---
// Pollingen starter/stoppes fra showModule() i app.js — slik at vi ikke
// kjører unødige DB-spørringer mens brukeren er på en annen modul.
let bordPollId = null;

function startBordPolling() {
    if (bordPollId !== null) return;
    bordPollId = setInterval(loadTables, BORD_POLL_INTERVAL_MS);
}

function stopBordPolling() {
    if (bordPollId === null) return;
    clearInterval(bordPollId);
    bordPollId = null;
}

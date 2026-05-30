// ==========================================
// MODUL: vaktplan.js
// Beskrivelse: Håndterer vaktplan-grid med popup-modal for redigering
// Bruker ny tabellstruktur: vaktplan (hovedtabell) + vakter (relasjonstabell)
// ==========================================

let currentVaktplanData = [];
let alleMedlemmerCache = [];
let isLoadingVaktplan = false;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// Holde styr på hvilken dato som redigeres i popupen
let aktivRedigeringsDato = null;
// Genererer en konsistent farge basert på medlem-ID (samme ansatt får alltid samme farge)
function getFargeForMedlem(medlemId) {
    if (!medlemId) return '';
    
    // Liste med 10 lyse bakgrunnsfarger
    const farger = [
        '#e0f2fe', // lys blå
        '#dcfce7', // lys grønn
        '#fed7aa', // lys oransje
        '#fee2e2', // lys rød
        '#e9d5ff', // lys lilla
        '#fce7f3', // lys rosa
        '#cffafe', // lys turkis
        '#ecfccb', // lys lime
        '#ffedd5', // lys appelsin
        '#ccfbf1'  // lys teal
    ];
    
    // Bruk medlem-ID for å velge farge (samme ID gir samme farge hver gang)
    const hash = medlemId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const index = hash % farger.length;
    
    return farger[index];
}

// 1. Initialisering - Kjøres når vaktplan-modulen åpnes
async function initVaktplan() {
    if (isLoadingVaktplan) return;
    isLoadingVaktplan = true;

    const section = document.getElementById('mod-vaktplan');
    if (!section.classList.contains('edit-locked')) {
        section.classList.add('edit-locked');
        oppdaterGrensesnitt(true);
    }

    showLoader(true);

    try {
        // Sett månedsvelger i grensesnittet
        const monthDisplay = document.getElementById('currentMonthDisplay');
        if (monthDisplay) {
            const date = new Date(currentYear, currentMonth, 1);
            monthDisplay.innerText = date.toLocaleString('no-NO', { month: 'long', year: 'numeric' });
        }

        // Hent alle medlemmer til cache (for datalist)
        const { data: members, error: memberError } = await sb.from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil, er_aktiv');

        if (memberError) {
            console.error("Feil ved henting av medlemmer:", memberError);
            showError("Kunne ikke hente medlemmer: " + memberError.message);
        } else {
            alleMedlemmerCache = members || [];
            oppdaterMedlemDatalist();
        }

        // Last inn gjeldende måned og tegn griddet
        await lastVaktplan();
    } finally {
        showLoader(false);
        isLoadingVaktplan = false;
    }
}

// Fyller datalist for input-feltene (kun aktive medlemmer kan velges)
function oppdaterMedlemDatalist() {
    const list = document.getElementById('medlem-liste');
    if (!list) return;
    list.innerHTML = alleMedlemmerCache
        .filter(m => m.er_aktiv !== false)
        .map(m => `<option value="${escapeHtml(m.fornavn)} ${escapeHtml(m.etternavn)}">📱 ${escapeHtml(m.tlf_mobil || '')}</option>`)
        .join('');
}

// 2. Hent vakter for den valgte måneden fra databasen
async function lastVaktplan() {
    const monthVal = getMonthString();
    
    // Først hent alle vaktplan-rader for måneden
    const { data: vaktplanRader, error: vaktplanError } = await sb
        .from('vaktplan')
        .select('*')
        .eq('maaned', monthVal);

    if (vaktplanError) {
        console.error("Feil ved henting av vaktplan:", vaktplanError);
        showError("Feil ved henting av vaktplan: " + vaktplanError.message);
        return;
    }

    if (!vaktplanRader || vaktplanRader.length === 0) {
        currentVaktplanData = [];
        renderVaktplanGrid();
        return;
    }

    // Hent alle vakter for disse vaktplan-radene
    const vaktplanIds = vaktplanRader.map(v => v.id);
    const { data: alleVakter, error: vakterError } = await sb
        .from('vakter')
        .select(`
            *,
            medlem:medlemmer(id, fornavn, etternavn)
        `)
        .in('vaktplan_id', vaktplanIds);

    if (vakterError) {
        console.error("Feil ved henting av vakter:", vakterError);
        showError("Feil ved henting av vakter: " + vakterError.message);
        return;
    }

    // Bygg opp currentVaktplanData med vakter koblet på
    currentVaktplanData = vaktplanRader.map(vp => ({
        ...vp,
        vakter: (alleVakter || []).filter(v => v.vaktplan_id === vp.id)
    }));

    renderVaktplanGrid();
}

// 3. Hent medlem fra lokal cache ved ID
function getMedlemById(id) {
    if (!id) return null;
    return alleMedlemmerCache.find(m => m.id === id);
}

// 4. Hjelpefunksjon: Hent vakter organisert per type for en dag
function getVakterForDag(vaktplanRow) {
    const result = {
        hoved: null,
        ekstra: null,
        ekstra2: null,
        ekstra3: null
    };
    
    if (vaktplanRow && vaktplanRow.vakter) {
        vaktplanRow.vakter.forEach(v => {
            if (v.vakt_type === 'hoved') result.hoved = v.medlem;
            else if (v.vakt_type === 'ekstra') result.ekstra = v.medlem;
            else if (v.vakt_type === 'ekstra2') result.ekstra2 = v.medlem;
            else if (v.vakt_type === 'ekstra3') result.ekstra3 = v.medlem;
        });
    }
    
    return result;
}

// 5. Beregn uker i måneden for visning
function getWeeksInMonth(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeek = new Date(firstDay);
    const dayOfWeek = startWeek.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    startWeek.setDate(startWeek.getDate() + diffToMonday);
    const weeks = [];
    let currentWeekStart = new Date(startWeek);
    while (currentWeekStart <= lastDay || (currentWeekStart.getMonth() === month && currentWeekStart <= lastDay)) {
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(currentWeekStart.getDate() + i);
            weekDays.push(new Date(dayDate));
        }
        weeks.push(weekDays);
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    return weeks;
}

// 6. Hent ISO-ukenummer
function getWeekNumber(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getMonthString() {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
}

// 7. Render vaktplan-grid
// 7. Render vaktplan-grid med farger per ansatt
function renderVaktplanGrid() {
    const container = document.getElementById('vaktplan-grid');
    if (!container) return;
    
    const weeks = getWeeksInMonth(currentYear, currentMonth);
    const today = new Date();
    const isEditMode = !document.getElementById('mod-vaktplan').classList.contains('edit-locked');
    
    container.innerHTML = '';
    
    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
        const weekDays = weeks[wIdx];
        const weekRow = document.createElement('div');
        weekRow.className = 'vaktplan-week-row';
        
        const weekHeader = document.createElement('div');
        weekHeader.className = 'vaktplan-week-header';
        const startDay = weekDays[0];
        const endDay = weekDays[6];
        weekHeader.innerText = `Uke ${getWeekNumber(weekDays[0])}  •  ${startDay.getDate()}.${startDay.getMonth()+1} – ${endDay.getDate()}.${endDay.getMonth()+1}`;
        weekRow.appendChild(weekHeader);
        
        const daysContainer = document.createElement('div');
        daysContainer.className = 'vaktplan-days-container';
        
        for (let d = 0; d < weekDays.length; d++) {
            const dayDate = weekDays[d];
            const isInCurrentMonth = dayDate.getMonth() === currentMonth;
            const datoTall = dayDate.getDate();
            
            const vaktplanRow = currentVaktplanData.find(v => v.dato === datoTall);
            const vakter = getVakterForDag(vaktplanRow);
            
            const dayCard = document.createElement('div');
            dayCard.className = 'vaktplan-day-card';
            
            if (isEditMode && isInCurrentMonth) {
                dayCard.classList.add('vaktplan-clickable-card');
                dayCard.addEventListener('click', () => aapneRedigeringsModal(datoTall));
            }
            
            if (isInCurrentMonth && today.getDate() === datoTall && today.getMonth() === currentMonth && today.getFullYear() === currentYear) {
                dayCard.classList.add('today');
            }
            
            const dayHeader = document.createElement('div');
            dayHeader.className = 'vaktplan-day-header';
            
            const dayLeft = document.createElement('div');
            dayLeft.className = 'vaktplan-day-left';
            
            const dayNumSpan = document.createElement('span');
            dayNumSpan.className = 'vaktplan-day-num';
            dayNumSpan.innerText = `${datoTall}.`;
            dayLeft.appendChild(dayNumSpan);
            
            const weekdaySpan = document.createElement('span');
            weekdaySpan.className = 'vaktplan-weekday';
            weekdaySpan.innerText = dayDate.toLocaleDateString('no-NO', { weekday: 'long' });
            
            dayHeader.appendChild(dayLeft);
            dayHeader.appendChild(weekdaySpan);
            dayCard.appendChild(dayHeader);
            
            if (!isInCurrentMonth) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'vaktplan-no-assigned';
                emptyDiv.innerText = '—';
                dayCard.appendChild(emptyDiv);
            } else {
                // Hovedvakt med farge
                if (vakter.hoved) {
                    const slot = document.createElement('div');
                    slot.className = 'vaktplan-shift-slot main-shift';
                    const bakgrunnFarge = getFargeForMedlem(vakter.hoved.id);
                    slot.style.backgroundColor = bakgrunnFarge;
                    slot.style.borderLeft = `3px solid ${getTekstFargeForMedlem(bakgrunnFarge)}`;
                    slot.innerHTML = `<div class="vaktplan-employee-name">${escapeHtml(vakter.hoved.fornavn)} ${escapeHtml(vakter.hoved.etternavn)}</div>`;
                    dayCard.appendChild(slot);
                }
                
                // Ekstravakter med farger
                const ekstraListe = [vakter.ekstra, vakter.ekstra2, vakter.ekstra3];
                ekstraListe.forEach(medlem => {
                    if (medlem) {
                        const slot = document.createElement('div');
                        slot.className = 'vaktplan-shift-slot extra-shift';
                        const bakgrunnFarge = getFargeForMedlem(medlem.id);
                        slot.style.backgroundColor = bakgrunnFarge;
                        slot.style.borderLeft = `3px solid ${getTekstFargeForMedlem(bakgrunnFarge)}`;
                        slot.innerHTML = `<div class="vaktplan-employee-name">${escapeHtml(medlem.fornavn)} ${escapeHtml(medlem.etternavn)}</div>`;
                        dayCard.appendChild(slot);
                    }
                });
            }
            daysContainer.appendChild(dayCard);
        }
        weekRow.appendChild(daysContainer);
        container.appendChild(weekRow);
    }
}

// 8. Åpne popup-modal for valgt dato
function aapneRedigeringsModal(datoTall) {
    aktivRedigeringsDato = datoTall;
    const vaktplanRow = currentVaktplanData.find(v => v.dato === datoTall);
    const vakter = getVakterForDag(vaktplanRow);
    
    const hovedNavn = vakter.hoved ? `${vakter.hoved.fornavn} ${vakter.hoved.etternavn}` : '';
    const e1Navn = vakter.ekstra ? `${vakter.ekstra.fornavn} ${vakter.ekstra.etternavn}` : '';
    const e2Navn = vakter.ekstra2 ? `${vakter.ekstra2.fornavn} ${vakter.ekstra2.etternavn}` : '';
    const e3Navn = vakter.ekstra3 ? `${vakter.ekstra3.fornavn} ${vakter.ekstra3.etternavn}` : '';

    const eksisterende = document.getElementById('vaktplan-edit-overlay');
    if (eksisterende) eksisterende.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vaktplan-edit-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(26, 47, 60, 0.7); z-index: 40000; 
        display: flex; justify-content: center; align-items: flex-end;
    `;
    
    if (window.innerWidth > 600) {
        overlay.style.alignItems = 'center';
    }

    overlay.innerHTML = `
        <div class="vakt-modal-content" style="
            background: white; border-top-left-radius: 24px; border-top-right-radius: 24px; 
            padding: 24px; width: 100%; max-width: 500px; box-sizing: border-box;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.15); max-height: 90vh; overflow-y: auto;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0; color:var(--marine); font-size:20px;">📅 Rediger vakt: ${datoTall}. mnd</h3>
                <button style="background:none; border:none; font-size:24px; cursor:pointer; color:#95a5a6;" onclick="lukkRedigeringsModal()">×</button>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                    <label style="display:block; font-size:12px; font-weight:bold; color:var(--marine); margin-bottom:4px;">HOVEDVAKT</label>
                    <input type="text" id="modal-hoved" class="vaktplan-input" list="medlem-liste" placeholder="Søk medlem..." value="${escapeHtml(hovedNavn)}" style="width:100%; padding:12px; box-sizing:border-box; border:2px solid #ddd; border-radius:12px; font-size:16px;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; font-weight:bold; color:#7f8c8d; margin-bottom:4px;">EKSTRAVAKT 1</label>
                    <input type="text" id="modal-ekstra1" class="vaktplan-input" list="medlem-liste" placeholder="Søk medlem..." value="${escapeHtml(e1Navn)}" style="width:100%; padding:12px; box-sizing:border-box; border:2px solid #ddd; border-radius:12px; font-size:16px;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; font-weight:bold; color:#7f8c8d; margin-bottom:4px;">EKSTRAVAKT 2</label>
                    <input type="text" id="modal-ekstra2" class="vaktplan-input" list="medlem-liste" placeholder="Søk medlem..." value="${escapeHtml(e2Navn)}" style="width:100%; padding:12px; box-sizing:border-box; border:2px solid #ddd; border-radius:12px; font-size:16px;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; font-weight:bold; color:#7f8c8d; margin-bottom:4px;">EKSTRAVAKT 3</label>
                    <input type="text" id="modal-ekstra3" class="vaktplan-input" list="medlem-liste" placeholder="Søk medlem..." value="${escapeHtml(e3Navn)}" style="width:100%; padding:12px; box-sizing:border-box; border:2px solid #ddd; border-radius:12px; font-size:16px;">
                </div>
            </div>

            <div style="display:flex; gap:12px; margin-top:24px;">
                <button style="flex:1; background:#2ecc71; color:white; border:none; padding:14px; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer;" onclick="lagreVaktFraModal()">LAGRE ENDRINGER</button>
                <button style="background:#e74c3c; color:white; border:none; padding:14px; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer;" onclick="lukkRedigeringsModal()">AVBRYT</button>
            </div>
        </div>
    `;

    if (window.innerWidth > 600) {
        const contentBox = overlay.querySelector('.vakt-modal-content');
        contentBox.style.borderRadius = '24px';
    }

    document.body.appendChild(overlay);
}

function lukkRedigeringsModal() {
    const overlay = document.getElementById('vaktplan-edit-overlay');
    if (overlay) overlay.remove();
    aktivRedigeringsDato = null;
}

// 9. Slå opp ID fra navn hentet ut fra modal-input
function finnMedlemIdFraNavn(navnVerdi) {
    const renVerdi = navnVerdi.trim();
    if (!renVerdi) return null;
    
    const medlem = alleMedlemmerCache.find(m => 
        `${m.fornavn} ${m.etternavn}`.toLowerCase() === renVerdi.toLowerCase() &&
        m.er_aktiv !== false
    );
    
    if (!medlem) {
        throw new Error(`Fant ikke aktivt medlem: "${renVerdi}".`);
    }
    return medlem.id;
}

// 10. Lagring av alle 4 vakter på en gang fra Modal
async function lagreVaktFraModal() {
    if (!aktivRedigeringsDato) return;
    
    const hovedNavn = document.getElementById('modal-hoved').value;
    const e1Navn = document.getElementById('modal-ekstra1').value;
    const e2Navn = document.getElementById('modal-ekstra2').value;
    const e3Navn = document.getElementById('modal-ekstra3').value;
    
    let hovedId = null, e1Id = null, e2Id = null, e3Id = null;
    
    try {
        hovedId = finnMedlemIdFraNavn(hovedNavn);
        e1Id = finnMedlemIdFraNavn(e1Navn);
        e2Id = finnMedlemIdFraNavn(e2Navn);
        e3Id = finnMedlemIdFraNavn(e3Navn);
    } catch (err) {
        visBeskjed("FEIL", err.message + " Sjekk skrivemåte eller velg fra listen.", "error");
        return;
    }
    
    showLoader(true);
    const maaned = getMonthString();
    
    try {
        // Finn eller opprett vaktplan-rad
        let vaktplanRow = currentVaktplanData.find(v => v.maaned === maaned && v.dato === aktivRedigeringsDato);
        
        if (!vaktplanRow) {
            // Opprett ny vaktplan-rad
            const { data: nyRad, error: insertError } = await sb
                .from('vaktplan')
                .insert({
                    maaned: maaned,
                    dato: aktivRedigeringsDato,
                    dag_indeks: new Date(currentYear, currentMonth, aktivRedigeringsDato).getDay()
                })
                .select()
                .single();
            
            if (insertError) throw insertError;
            vaktplanRow = nyRad;
            currentVaktplanData.push(vaktplanRow);
        }
        
        // Slett eksisterende vakter for denne dagen
        const { error: deleteError } = await sb
            .from('vakter')
            .delete()
            .eq('vaktplan_id', vaktplanRow.id);
        
        if (deleteError) throw deleteError;
        
        // Sett inn nye vakter
        const vakterToInsert = [];
        if (hovedId) vakterToInsert.push({ vaktplan_id: vaktplanRow.id, medlem_id: hovedId, vakt_type: 'hoved' });
        if (e1Id) vakterToInsert.push({ vaktplan_id: vaktplanRow.id, medlem_id: e1Id, vakt_type: 'ekstra' });
        if (e2Id) vakterToInsert.push({ vaktplan_id: vaktplanRow.id, medlem_id: e2Id, vakt_type: 'ekstra2' });
        if (e3Id) vakterToInsert.push({ vaktplan_id: vaktplanRow.id, medlem_id: e3Id, vakt_type: 'ekstra3' });
        
        if (vakterToInsert.length > 0) {
            const { error: insertError } = await sb.from('vakter').insert(vakterToInsert);
            if (insertError) throw insertError;
        }
        
        // Oppdater local cache med de nye vaktene
        const oppdatertCacheVakter = vakterToInsert.map(v => ({
            ...v,
            medlem: getMedlemById(v.medlem_id)
        }));
        
        vaktplanRow.vakter = oppdatertCacheVakter;
        const index = currentVaktplanData.findIndex(v => v.id === vaktplanRow.id);
        if (index !== -1) currentVaktplanData[index] = vaktplanRow;
        
        renderVaktplanGrid();
        lukkRedigeringsModal();
        
    } catch (error) {
        console.error("Feil ved lagring:", error);
        visBeskjed("FEIL", "Kunne ikke lagre vakt: " + error.message, "error");
    }
    
    showLoader(false);
}

// 11. Redigeringsmodus (PIN-autentisering)
function toggleEditMode() {
    const section = document.getElementById('mod-vaktplan');
    const erLaast = section.classList.contains('edit-locked');

    if (!erLaast) {
        section.classList.add('edit-locked');
        oppdaterGrensesnitt(true);
        renderVaktplanGrid();
    } else {
        visVaktplanPinModal();
    }
}

function visVaktplanPinModal() {
    const eksisterende = document.getElementById('vaktplan-pin-overlay');
    if (eksisterende) eksisterende.remove();
    
    const modal = document.createElement('div');
    modal.id = 'vaktplan-pin-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(26,47,60,0.95);z-index:30000;display:flex;justify-content:center;align-items:center;';
    modal.innerHTML = `
        <div style="background:white;border-radius:32px;padding:40px;text-align:center;max-width:300px;width:90%;">
            <h3 style="color:#1a2f3c;">🔒 Vaktplan</h3>
            <p style="font-size:13px;color:#666;">Tast PIN for redigering</p>
            <input type="password" id="vaktplan-pin-input" style="background:#f5f0e8;border:2px solid #c9a84c;border-radius:60px;padding:12px;width:100%;text-align:center;font-size:24px;letter-spacing:5px;margin-bottom:15px;" maxlength="4" autofocus>
            <div id="vaktplan-pin-error" style="color:#e74c3c;font-size:12px;margin-bottom:15px;display:none;">Feil kode!</div>
            <button style="background:#c9a84c;color:#1a2f3c;border:none;padding:10px 20px;border-radius:60px;font-weight:bold;width:100%;margin-bottom:10px;" onclick="verifyVaktplanPin()">LÅS OPP</button>
            <button style="background:#95a5a6;color:white;border:none;padding:10px 20px;border-radius:60px;width:100%;" onclick="lukkVaktplanPinModal()">AVBRYT</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('vaktplan-pin-input').focus();
}

function verifyVaktplanPin() {
    const input = document.getElementById('vaktplan-pin-input').value;
    if (input === "0555") {
        const section = document.getElementById('mod-vaktplan');
        section.classList.remove('edit-locked');
        oppdaterGrensesnitt(false);
        lukkVaktplanPinModal();
        renderVaktplanGrid();
    } else {
        document.getElementById('vaktplan-pin-error').style.display = 'block';
        document.getElementById('vaktplan-pin-input').value = '';
        document.getElementById('vaktplan-pin-input').focus();
    }
}

function lukkVaktplanPinModal() {
    const modal = document.getElementById('vaktplan-pin-overlay');
    if (modal) modal.remove();
}

function oppdaterGrensesnitt(laast) {
    const btn = document.getElementById('btn-toggle-edit');
    if (!btn) return;
    
    if (laast) {
        btn.innerHTML = "🔓 ÅPNE FOR REDIGERING";
        btn.style.background = "var(--gull)";
        btn.style.color = "var(--marine)";
    } else {
        btn.innerHTML = "🔒 LÅS FOR REDIGERING";
        btn.style.background = "var(--marine)";
        btn.style.color = "white";
    }
}

// 12. Månedsvelger-navigasjon
function changeMonth(delta) {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) {
        newMonth = 11;
        newYear--;
    } else if (newMonth > 11) {
        newMonth = 0;
        newYear++;
    }
    currentYear = newYear;
    currentMonth = newMonth;
    
    const monthDisplay = document.getElementById('currentMonthDisplay');
    if (monthDisplay) {
        const date = new Date(currentYear, currentMonth, 1);
        monthDisplay.innerText = date.toLocaleString('no-NO', { month: 'long', year: 'numeric' });
    }
    
    lastVaktplan();
}

function goToToday() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    
    const monthDisplay = document.getElementById('currentMonthDisplay');
    if (monthDisplay) {
        const date = new Date(currentYear, currentMonth, 1);
        monthDisplay.innerText = date.toLocaleString('no-NO', { month: 'long', year: 'numeric' });
    }
    
    lastVaktplan();
}

// Genererer en mørkere tekstfarge for kontrast
function getTekstFargeForMedlem(bakgrunnFarge) {
    // Enkel logikk: hvis bakgrunn er lys, bruk mørk tekst, ellers hvit
    // Forenklet: returner alltid mørk tekst siden fargene er lyse
    return '#1a2f3c';
}

// Sette opp event listeners for knapper
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => changeMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
});
// Åpner vaktplan rapport modal
async function visVaktplanRapportModal() {
    const modal = document.getElementById('vaktplan-rapport-modal');
    const innhold = document.getElementById('vaktplan-rapport-innhold');
    
    modal.style.display = 'flex';
    innhold.innerHTML = '<p style="text-align: center; padding: 40px;">Laster rapport...</p>';
    
    try {
        const rapportHTML = byggVaktplanRapportHTML();
        innhold.innerHTML = rapportHTML;
    } catch (err) {
        console.error("Feil ved bygging av rapport:", err);
        innhold.innerHTML = '<p style="text-align: center; padding: 40px; color: red;">Feil ved lasting av rapport</p>';
    }
}

// Bygger HTML-tabell for rapporten
function byggVaktplanRapportHTML() {
    const ukedager = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
    const dagerIMaaned = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    let html = `
        <table class="vaktplan-rapport-tabell">
            <thead>
                <tr>
                    <th>Dato</th>
                    <th>Ukedag</th>
                    <th>Hovedvakt</th>
                    <th>Ekstra 1</th>
                    <th>Ekstra 2</th>
                    <th>Ekstra 3</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (let dag = 1; dag <= dagerIMaaned; dag++) {
        const dato = new Date(currentYear, currentMonth, dag);
        const ukedagIndeks = dato.getDay();
        // Juster slik at mandag = 0
        const justertIndeks = ukedagIndeks === 0 ? 6 : ukedagIndeks - 1;
        const ukedagNavn = ukedager[justertIndeks];
        
        const vaktplanRow = currentVaktplanData.find(v => v.dato === dag);
        const vakter = getVakterForDag(vaktplanRow);
        
        const hovedNavn = vakter.hoved ? `${vakter.hoved.fornavn} ${vakter.hoved.etternavn}` : '';
        const e1Navn = vakter.ekstra ? `${vakter.ekstra.fornavn} ${vakter.ekstra.etternavn}` : '';
        const e2Navn = vakter.ekstra2 ? `${vakter.ekstra2.fornavn} ${vakter.ekstra2.etternavn}` : '';
        const e3Navn = vakter.ekstra3 ? `${vakter.ekstra3.fornavn} ${vakter.ekstra3.etternavn}` : '';
        
        html += `
            <tr>
                <td>${dag}.</td>
                <td>${ukedagNavn}</td>
                <td class="${!hovedNavn ? 'ingen-vakt' : ''}">${hovedNavn || '(ingen)'}</td>
                <td class="${!e1Navn ? 'ingen-vakt' : ''}">${e1Navn || '(ingen)'}</td>
                <td class="${!e2Navn ? 'ingen-vakt' : ''}">${e2Navn || '(ingen)'}</td>
                <td class="${!e3Navn ? 'ingen-vakt' : ''}">${e3Navn || '(ingen)'}</td>
            </tr>
        `;
    }
    
    html += `
            </tbody>
        </table>
    `;
    
    return html;
}

// Lukker vaktplan rapport modal
function lukkVaktplanRapportModal() {
    document.getElementById('vaktplan-rapport-modal').style.display = 'none';
}

// Genererer og laster ned PDF
function lastNedVaktplanRapportPDF() {
    const rapportHTML = byggVaktplanRapportHTML();
    const iDag = new Date();
    const datoStr = iDag.toLocaleDateString('no-NO');
    const manedNavn = new Date(currentYear, currentMonth, 1).toLocaleString('no-NO', { month: 'long', year: 'numeric' });
    
    const pdfHtml = `
        <html>
        <head>
            <title>OBK - Vaktplan ${manedNavn}</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #1a2f3c; border-bottom: 2px solid #c9a84c; padding-bottom: 10px; }
                .dato { color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #1a2f3c; color: white; padding: 10px; text-align: left; }
                td { border: 1px solid #ddd; padding: 8px; }
                .ingen-vakt { color: red; font-style: italic; }
                .footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <h1>🎱 Oslo Biljardklubb</h1>
            <h2>Vaktplan - ${manedNavn}</h2>
            <div class="dato">Rapport generert: ${datoStr}</div>
            
            ${rapportHTML}
            
            <div class="footer">
                Rapporten er generert automatisk av OBK Administrasjonssystem.
            </div>
        </body>
        </html>
    `;
    
    const win = window.open();
    win.document.write(pdfHtml);
    win.document.close();
    win.print();
}

// Globale eksponeringer til window-objektet
window.initVaktplan = initVaktplan;
window.toggleEditMode = toggleEditMode;
window.verifyVaktplanPin = verifyVaktplanPin;
window.lukkVaktplanPinModal = lukkVaktplanPinModal;
window.lukkRedigeringsModal = lukkRedigeringsModal;
window.lagreVaktFraModal = lagreVaktFraModal;
window.visVaktplanRapportModal = visVaktplanRapportModal;
window.lukkVaktplanRapportModal = lukkVaktplanRapportModal;
window.lastNedVaktplanRapportPDF = lastNedVaktplanRapportPDF;
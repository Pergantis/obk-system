// ==========================================
// START PÅ MODUL: vaktplan.js
// Beskrivelse: Håndterer vaktplan-grid og poengberegning via en rask, mobiltilpasset popup-modal
// ==========================================

let currentVaktplanData = [];
let alleMedlemmerCache = [];
let vaktHistorikkCache = []; // Cache for historiske vakter så poengberegning slipper å hente fra DB hele tiden
let isLoadingVaktplan = false;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// Holde styr på hvilken dato som redigeres i popupen
let aktivRedigeringsDato = null;

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
    
    // Sett månedsvelger i grensesnittet
    const monthDisplay = document.getElementById('currentMonthDisplay');
    if (monthDisplay) {
        const date = new Date(currentYear, currentMonth, 1);
        monthDisplay.innerText = date.toLocaleString('no-NO', { month: 'long', year: 'numeric' });
    }
    
    // Hent alle medlemmer til cache (både aktive og inaktive for historikk)
    const { data: members, error: memberError } = await sb.from('medlemmer')
        .select('id, fornavn, etternavn, tlf_mobil, poeng_benyttet, er_aktiv');

    if (memberError) {
        console.error("Feil ved henting av medlemmer:", memberError);
        showError("Kunne ikke hente medlemmer: " + memberError.message);
    } else {
        alleMedlemmerCache = members || [];
        oppdaterMedlemDatalist(); // Fyller autocomplete med kun aktive
    }

    // Hent historiske vakter EN gang for poengberegning
    await lastHistoriskeVakter();

    // Last inn gjeldende måned og tegn griddet
    await lastVaktplan();
    
    showLoader(false);
    isLoadingVaktplan = false;
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

// Henter historiske vakter for de siste 60 månedene
async function lastHistoriskeVakter() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 60); // 5 år tilbake
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

    const { data, error } = await sb
        .from('vaktplan')
        .select('maaned, dato, hoved_vakt_id, ekstra_vakt_id, ekstra_vakt_id_2, ekstra_vakt_id_3')
        .gte('maaned', cutoffStr);

    if (error) {
        console.error("Feil ved henting av historiske vakter:", error);
    } else {
        vaktHistorikkCache = data || [];
    }
}

// 2. Hent vakter for den valgte måneden fra databasen
async function lastVaktplan() {
    const monthVal = getMonthString();
    
    const { data, error } = await sb
        .from('vaktplan')
        .select(`
            *,
            hoved:medlemmer!vaktplan_hoved_vakt_id_fkey(id, fornavn, etternavn),
            ekstra:medlemmer!vaktplan_ekstra_vakt_id_fkey(id, fornavn, etternavn),
            ekstra2:medlemmer!vaktplan_ekstra_vakt_id_2_fkey(id, fornavn, etternavn),
            ekstra3:medlemmer!vaktplan_ekstra_vakt_id_3_fkey(id, fornavn, etternavn)
        `)
        .eq('maaned', monthVal);

    if (error) {
        console.error("Feil ved henting av vakter:", error);
        showError("Feil ved henting av vaktplan: " + error.message);
        return;
    }

    currentVaktplanData = data || [];
    renderVaktplanGrid(); // Tegner griddet rent (uten tekst-inputs)
    beregnOgVisPoengFraCache(); // Beregner poeng lynhurtig uten DB-kall
}

// 3. Hent medlem fra lokal cache ved ID
function getMedlemById(id) {
    if (!id) return null;
    return alleMedlemmerCache.find(m => m.id === id);
}

// 4. Beregn uker i måneden for visning
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

// 5. Hent ISO-ukenummer
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

// 6. Render det rene, lynraske vaktplan-griddet
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
            
            const vakt = currentVaktplanData.find(v => v.dato === datoTall) || {};
            
            const dayCard = document.createElement('div');
            dayCard.className = 'vaktplan-day-card';
            
            // Hvis vi er i redigeringsmodus, gjør vi hele kortet klikkbart og legger til en stil-klasse
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
                // Tegn opp vaktene som ren tekst (lynraskt for nettleseren å håndtere)
                const hovedMedlem = vakt.hoved_vakt_id ? getMedlemById(vakt.hoved_vakt_id) : null;
                if (hovedMedlem) {
                    const slot = document.createElement('div');
                    slot.className = 'vaktplan-shift-slot main-shift';
                    slot.innerHTML = `<div class="vaktplan-employee-name">${escapeHtml(hovedMedlem.fornavn)} ${escapeHtml(hovedMedlem.etternavn)}</div>`;
                    dayCard.appendChild(slot);
                }
                
                const ekstraFelter = [vakt.ekstra_vakt_id, vakt.ekstra_vakt_id_2, vakt.ekstra_vakt_id_3];
                ekstraFelter.forEach(id => {
                    const eMedlem = id ? getMedlemById(id) : null;
                    if (eMedlem) {
                        const slot = document.createElement('div');
                        slot.className = 'vaktplan-shift-slot extra-shift';
                        slot.innerHTML = `<div class="vaktplan-employee-name">${escapeHtml(eMedlem.fornavn)} ${escapeHtml(eMedlem.etternavn)}</div>`;
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

// 7. Åpne popup-modal for valgt dato (Mobiltilpasset)
function aapneRedigeringsModal(datoTall) {
    aktivRedigeringsDato = datoTall;
    const vakt = currentVaktplanData.find(v => v.dato === datoTall) || {};
    
    const hovedMedlem = vakt.hoved_vakt_id ? getMedlemById(vakt.hoved_vakt_id) : null;
    const e1Medlem = vakt.ekstra_vakt_id ? getMedlemById(vakt.ekstra_vakt_id) : null;
    const e2Medlem = vakt.ekstra_vakt_id_2 ? getMedlemById(vakt.ekstra_vakt_id_2) : null;
    const e3Medlem = vakt.ekstra_vakt_id_3 ? getMedlemById(vakt.ekstra_vakt_id_3) : null;

    const hNavn = hovedMedlem ? `${hovedMedlem.fornavn} ${hovedMedlem.etternavn}` : '';
    const e1Navn = e1Medlem ? `${e1Medlem.fornavn} ${e1Medlem.etternavn}` : '';
    const e2Navn = e2Medlem ? `${e2Medlem.fornavn} ${e2Medlem.etternavn}` : '';
    const e3Navn = e3Medlem ? `${e3Medlem.fornavn} ${e3Medlem.etternavn}` : '';

    const eksisterende = document.getElementById('vaktplan-edit-overlay');
    if (eksisterende) eksisterende.remove();

    // Lager popup-overlay med CSS skreddersydd for både mobil og PC
    const overlay = document.createElement('div');
    overlay.id = 'vaktplan-edit-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(26, 47, 60, 0.7); z-index: 40000; 
        display: flex; justify-content: center; align-items: flex-end;
    `;
    
    // Med media query i JS sørger vi for at den legger seg i bunnen på mobil og sentrert på PC
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
                    <input type="text" id="modal-hoved" class="vaktplan-input" list="medlem-liste" placeholder="Søk medlem..." value="${escapeHtml(hNavn)}" style="width:100%; padding:12px; box-sizing:border-box; border:2px solid #ddd; border-radius:12px; font-size:16px;">
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

    // Finjustering for PC hvis skjermen er stor
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

// 8. Slå opp ID fra navn hentet ut fra modal-input
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

// 9. Lagring av alle 4 vakter på en gang fra Modal (Høyeffektivt)
async function lagreVaktFraModal() {
    if (!aktivRedigeringsDato) return;
    
    const hInput = document.getElementById('modal-hoved').value;
    const e1Input = document.getElementById('modal-ekstra1').value;
    const e2Input = document.getElementById('modal-ekstra2').value;
    const e3Input = document.getElementById('modal-ekstra3').value;
    
    let hId = null, e1Id = null, e2Id = null, e3Id = null;
    
    try {
        hId = finnMedlemIdFraNavn(hInput);
        e1Id = finnMedlemIdFraNavn(e1Input);
        e2Id = finnMedlemIdFraNavn(e2Input);
        e3Id = finnMedlemIdFraNavn(e3Input);
    } catch (err) {
        visBeskjed("FEIL", err.message + " Sjekk skrivemåte eller velg fra listen.", "error");
        return;
    }
    
    showLoader(true);
    const maaned = getMonthString();
    
    try {
        let vaktObj = currentVaktplanData.find(v => v.maaned === maaned && v.dato === aktivRedigeringsDato);
        
        const updateData = {
            maaned: maaned,
            dato: aktivRedigeringsDato,
            dag_indeks: new Date(currentYear, currentMonth, aktivRedigeringsDato).getDay(),
            hoved_vakt_id: hId,
            ekstra_vakt_id: e1Id,
            ekstra_vakt_id_2: e2Id,
            ekstra_vakt_id_3: e3Id
        };
        
        if (vaktObj && vaktObj.id) {
            // Oppdater i DB
            await sb.from('vaktplan').update(updateData).eq('id', vaktObj.id);
            Object.assign(vaktObj, updateData);
        } else {
            // Sett inn ny rad i DB
            const { data: nyVakt, error: insError } = await sb.from('vaktplan').insert(updateData).select().single();
            if (insError) throw insError;
            vaktObj = nyVakt;
            currentVaktplanData.push(vaktObj);
        }
        
        // Synkroniser historikk-cache for lynhurtig poeng-re-kalkulering
        const hIdx = vaktHistorikkCache.findIndex(v => v.maaned === maaned && v.dato === aktivRedigeringsDato);
        if (hIdx !== -1) vaktHistorikkCache[hIdx] = updateData;
        else vaktHistorikkCache.push(updateData);
        
        // Re-render hele kalenderen (siden det er ren tekst nå tar det kun noen få millisekunder!)
        renderVaktplanGrid();
        beregnOgVisPoengFraCache();
        
        lukkRedigeringsModal();
    } catch (error) {
        console.error("Feil ved lagring:", error);
        visBeskjed("FEIL", "Kunne ikke lagre vakt: " + error.message, "error");
    }
    
    showLoader(false);
}

// 10. Lynrask poengberegning utelukkende basert på lokal cache
function beregnOgVisPoengFraCache() {
    if (!vaktHistorikkCache) return;

    const iDag = new Date();
    iDag.setHours(23, 59, 59, 999);
    
    const teller = {};
    
    vaktHistorikkCache.forEach(v => {
        const [year, month] = v.maaned.split('-').map(Number);
        const vaktDato = new Date(year, month - 1, v.dato);
        vaktDato.setHours(23, 59, 59, 999);
        
        if (vaktDato <= iDag) {
            if (v.hoved_vakt_id) teller[v.hoved_vakt_id] = (teller[v.hoved_vakt_id] || 0) + 1;
            if (v.ekstra_vakt_id) teller[v.ekstra_vakt_id] = (teller[v.ekstra_vakt_id] || 0) + 1;
            if (v.ekstra_vakt_id_2) teller[v.ekstra_vakt_id_2] = (teller[v.ekstra_vakt_id_2] || 0) + 1;
            if (v.ekstra_vakt_id_3) teller[v.ekstra_vakt_id_3] = (teller[v.ekstra_vakt_id_3] || 0) + 1;
        }
    });
    
    const tbody = document.getElementById('vakt-score-body');
    if (!tbody) return;
    
    tbody.innerHTML = "";

    const sortertListe = [...alleMedlemmerCache].sort((a, b) => {
        const poengA = teller[a.id] || 0;
        const poengB = teller[b.id] || 0;
        return poengB - poengA;
    });

    let htmlBuilder = "";

    sortertListe.forEach(m => {
        const opptjent = teller[m.id] || 0;
        const benyttet = m.poeng_benyttet || 0;
        const saldo = opptjent - benyttet;

        if (opptjent > 0 || benyttet > 0) {
            htmlBuilder += `
                <tr>
                    <td class="navn-fet">${escapeHtml(m.fornavn)} ${escapeHtml(m.etternavn)}</td>
                    <td style="text-align: center; font-weight: bold;">${opptjent}</td>
                    <td style="text-align: center;">
                        <input type="number" value="${benyttet}" class="input-field" 
                               style="width: 70px; margin: 0; padding: 4px; text-align: center;"
                               data-medlem-id="${m.id}"
                               onchange="oppdaterBenyttedePoeng(this.dataset.medlemId, this.value)">
                    </td>
                    <td class="tekst-gronn" style="text-align: right; font-weight: bold;">${saldo}</td>
                </tr>`;
        }
    });
    
    tbody.innerHTML = htmlBuilder || `<tr><td colspan="4" style="text-align: center; padding: 20px;">Ingen opptjente vakter enda</td></tr>`;
}

// 11. Oppdatering av manuelt benyttede poeng
async function oppdaterBenyttedePoeng(medlemId, verdi) {
    const nyVerdi = parseInt(verdi) || 0;
    showLoader(true);
    
    const { error } = await sb
        .from('medlemmer')
        .update({ poeng_benyttet: nyVerdi })
        .eq('id', medlemId);
    
    if (error) {
        console.error("Feil ved oppdatering av poeng:", error);
        showError("Kunne ikke oppdatere poeng: " + error.message);
    } else {
        const member = alleMedlemmerCache.find(m => m.id === medlemId);
        if (member) member.poeng_benyttet = nyVerdi;
        beregnOgVisPoengFraCache();
    }
    showLoader(false);
}

// 12. Redigeringsmodus (PIN-autentisering)
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
        renderVaktplanGrid(); // Genererer grid på nytt med klikkbare kort
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

// 13. Månedsvelger-navigasjon
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

// Sette opp event listeners for knapper
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => changeMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
});

// Globale eksponeringer til window-objektet
window.initVaktplan = initVaktplan;
window.oppdaterBenyttedePoeng = oppdaterBenyttedePoeng;
window.toggleEditMode = toggleEditMode;
window.verifyVaktplanPin = verifyVaktplanPin;
window.lukkVaktplanPinModal = lukkVaktplanPinModal;
window.lukkRedigeringsModal = lukkRedigeringsModal;
window.lagreVaktFraModal = lagreVaktFraModal;

// ==========================================
// END PÅ MODUL: vaktplan.js
// ==========================================
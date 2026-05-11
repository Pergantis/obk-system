// --- VAKTPLAN OG POENGSYSTEM ---
let currentVaktplanData = [];
let alleMedlemmerCache = []; // For raskt søk

// 1. Initialisering: Kjøres når admin klikker på Vaktplan-fanen
async function initVaktplan() {
    document.getElementById('mod-vaktplan').classList.add('edit-locked');
    showLoader(true);
    // Hent alle medlemmer én gang for å bruke i søk (raskere enn å spørre databasen hver gang)
    const { data } = await sb.from('medlemmer').select('id, fornavn, etternavn, tlf_mobil, poeng_benyttet');
    alleMedlemmerCache = data || [];
    
    await lastVaktplan();
    showLoader(false);
}

// 2. Hent vakter fra Supabase for valgt måned
async function lastVaktplan() {
    const monthVal = document.getElementById('vakt-month-picker').value; // f.eks "2026-05"
    
    const { data, error } = await sb.from('vaktplan')
        .select('*, hoved:hoved_vakt_id(fornavn, etternavn), ekstra:ekstra_vakt_id(fornavn, etternavn)')
        .eq('maaned', monthVal);

    if (error) {
        console.error("Feil ved henting av vakter:", error);
        return;
    }

    currentVaktplanData = data || [];
    
    // Hvis måneden er helt tom, sjekk om vi skal kopiere fra forrige
    if (currentVaktplanData.length === 0) {
        // Her kan vi senere legge inn logikk for å foreslå kopiering
    }

    tegnVaktplanMatrise(monthVal);
    beregnOgVisPoeng();
}

// 3. Generer selve kalender-matrisen (HTML-tabellen)
function tegnVaktplanMatrise(monthString) {
    const [year, month] = monthString.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const tbody = document.getElementById('vakt-body-prototype');
    tbody.innerHTML = "";

    // Finn ukenummer og dager (standard JS-logikk)
    const dagerIMaaned = new Date(year, month, 0).getDate();
    let dagTeller = 1;
    
    // Vi lager rader for uker (maks 6 rader i en måned)
    for (let u = 0; u < 6; u++) {
        if (dagTeller > dagerIMaaned) break;
        
        let tr = document.createElement('tr');
        
        // Finn ukenummer for denne raden (forenklet for prototypen)
        let ukeNr = getWeekNumber(new Date(year, month - 1, dagTeller));
        tr.innerHTML = `<td style="background:#f1efe7; font-weight:bold; text-align:center; width:55px;">${ukeNr}</td>`;
        
        // Gå gjennom Mandag (0) til Søndag (6)
        for (let d = 0; d < 7; d++) {
            let td = document.createElement('td');
            if (d >= 5) td.classList.add('td-weekend'); // Lørdag/Søndag farge

            // Sjekk om denne dagen hører til måneden
            let startDag = new Date(year, month - 1, 1).getDay();
            let justertStart = startDag === 0 ? 6 : startDag - 1; // Gjør Mandag til 0

            if ((u === 0 && d < justertStart) || dagTeller > dagerIMaaned) {
                td.innerHTML = `<div style="color:#ccc; text-align:center;">—</div>`;
            } else {
                const dagensDato = dagTeller;
                const vakt = currentVaktplanData.find(v => v.dato === dagensDato) || {};
                
                // Bygg cellen
                td.innerHTML = `
                    <div class="vakt-cell">
                        <div class="vakt-date">${dagensDato}.</div>
                        <input type="text" class="vakt-input" list="medlem-liste" 
                               placeholder="Hoved" value="${vakt.hoved ? vakt.hoved.fornavn + ' ' + vakt.hoved.etternavn : ''}"
                               onchange="lagreVakt(${dagensDato}, ${d}, 'hoved', this.value)">
                        <input type="text" class="vakt-input" list="medlem-liste" 
                               placeholder="Ekstra" value="${vakt.ekstra ? vakt.ekstra.fornavn + ' ' + vakt.ekstra.etternavn : ''}"
                               onchange="lagreVakt(${dagensDato}, ${d}, 'ekstra', this.value)">
                    </div>`;
                dagTeller++;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

// 4. Lagre vakt (Kalles hver gang admin skriver et navn og går ut av feltet)
async function lagreVakt(dato, dagIndeks, type, verdi) {
    const maaned = document.getElementById('vakt-month-picker').value;
    
    // Finn medlem-ID basert på navnet som ble skrevet (ser i cachen vår)
    const medlem = alleMedlemmerCache.find(m => `${m.fornavn} ${m.etternavn}` === verdi);
    const medlemId = medlem ? medlem.id : null;

    if (verdi !== "" && !medlemId) {
        alert("Fant ikke medlemmet. Vennligst velg fra listen.");
        return;
    }

    showLoader(true);
    
    // Prøv å finne ut om raden finnes fra før i Supabase
    const { data: eksisterende } = await sb.from('vaktplan')
        .select('id')
        .eq('maaned', maaned)
        .eq('dato', dato)
        .single();

    const updateData = {
        maaned: maaned,
        dato: dato,
        dag_indeks: dagIndeks
    };
    
    if (type === 'hoved') updateData.hoved_vakt_id = medlemId;
    else updateData.ekstra_vakt_id = medlemId;

    if (eksisterende) {
        await sb.from('vaktplan').update(updateData).eq('id', eksisterende.id);
    } else {
        await sb.from('vaktplan').insert(updateData);
    }

    await lastVaktplan(); // Oppdaterer alt inkludert poeng
    showLoader(false);
}

// 5. Automatisk poengberegning (KUN for vakter i fortiden)
async function beregnOgVisPoeng() {
    // 1. Hent ALLE vakter, men vi må inkludere dato og måned for å sjekke mot "I dag"
    const { data: alleVakter } = await sb.from('vaktplan')
        .select('maaned, dato, hoved_vakt_id, ekstra_vakt_id');
    
    if (!alleVakter) return;

    const iDag = new Date();
    iDag.setHours(23, 59, 59, 999); // Vi inkluderer hele dagen i dag

    const teller = {};
    
    alleVakter.forEach(v => {
        // Lag en dato-gjenstand for vakten for å sammenligne
        const [year, month] = v.maaned.split('-').map(Number);
        const vaktDato = new Date(year, month - 1, v.dato);

        // KUN tell poenget hvis datoen er i dag eller tidligere
        if (vaktDato <= iDag) {
            if (v.hoved_vakt_id) teller[v.hoved_vakt_id] = (teller[v.hoved_vakt_id] || 0) + 1;
            if (v.ekstra_vakt_id) teller[v.ekstra_vakt_id] = (teller[v.ekstra_vakt_id] || 0) + 1;
        }
    });

    // 2. Oppdater tabellen i HTML
    const tbody = document.getElementById('vakt-score-body');
    tbody.innerHTML = "";

    // Sorter listen slik at de med flest poeng står øverst
    const sortertListe = [...alleMedlemmerCache].sort((a, b) => {
        const poengA = teller[a.id] || 0;
        const poengB = teller[b.id] || 0;
        return poengB - poengA;
    });

    sortertListe.forEach(m => {
        const opptjent = teller[m.id] || 0;
        const benyttet = m.poeng_benyttet || 0;
        const saldo = opptjent - benyttet;

        // Vis kun de som enten har jobbet eller har benyttet poeng
        if (opptjent > 0 || benyttet > 0) {
            tbody.innerHTML += `
                <tr>
                    <td class="navn-fet">${m.fornavn} ${m.etternavn}</td>
                    <td style="text-align: center;">${opptjent}</td>
                    <td style="text-align: center;">
                        <input type="number" value="${benyttet}" class="input-field" 
                               style="width: 60px; margin: 0; padding: 2px; text-align: center;"
                               onchange="oppdaterBenyttedePoeng('${m.id}', this.value)">
                    </td>
                    <td class="tekst-gronn" style="text-align: right; font-weight: bold;">${saldo}</td>
                </tr>`;
        }
    });
}
// 6. Lagre manuelle poengendringer
async function oppdaterBenyttedePoeng(medlemId, verdi) {
    showLoader(true);
    await sb.from('medlemmer').update({ poeng_benyttet: parseInt(verdi) }).eq('id', medlemId);
    await initVaktplan(); // Forfrisk alt
    showLoader(false);
}

// Hjelpefunksjon for ukenummer
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}
// --- PIN-KODE LOGIKK FOR VAKTPLAN ---
const VAKT_EDIT_PIN = "1234"; // <--- Din pinkode

// Denne funksjonen kjøres når man trykker på hovedknappen (Lås/Åpne)
function toggleEditMode() {
    const section = document.getElementById('mod-vaktplan');
    const erLaast = section.classList.contains('edit-locked');

    if (!erLaast) {
        // SCENARIO: Planen er åpen -> Vi låser den nå (trenger ikke PIN)
        section.classList.add('edit-locked');
        oppdaterGrensesnitt(true);
    } else {
        // SCENARIO: Planen er låst -> Vi må vise PIN-vinduet
        document.getElementById('vakt-pin-modal').style.display = 'flex';
        document.getElementById('vakt-pin-input').value = "";
        document.getElementById('vakt-pin-input').focus();
        document.getElementById('vakt-pin-error').style.display = 'none';
    }
}

// Denne funksjonen kjøres når man trykker "LÅS OPP" inni PIN-vinduet
function verifyVaktPin() {
    const input = document.getElementById('vakt-pin-input').value;
    
    if (input === VAKT_EDIT_PIN) {
        // 1. RIKTIG KODE: Fjern låsen
        const section = document.getElementById('mod-vaktplan');
        section.classList.remove('edit-locked');
        
        // 2. Oppdater tekst på knapper og status
        oppdaterGrensesnitt(false);
        
        // 3. Lukk vinduet umiddelbart
        closeVaktPin();
    } else {
        // FEIL KODE: Vis rød tekst
        document.getElementById('vakt-pin-error').style.display = 'block';
        document.getElementById('vakt-pin-input').value = "";
        document.getElementById('vakt-pin-input').focus();
    }
}

// Hjelpefunksjon for å sikre at tekstene alltid er korrekte
function oppdaterGrensesnitt(laast) {
    const btn = document.getElementById('btn-toggle-edit');
    const status = document.getElementById('lock-status-indicator');
    
    if (laast) {
        btn.innerText = "🔓 ÅPNE FOR REDIGERING";
        status.innerText = "🔒 VISNINGSMODUS (LÅST)";
        status.className = "alert-box alert-danger";
    } else {
        btn.innerText = "🔒 LÅS FOR REDIGERING";
        status.innerText = "🔓 REDIGERINGSMODUS AKTIV";
        status.className = "alert-box alert-warning";
    }
}

function closeVaktPin() {
    document.getElementById('vakt-pin-modal').style.display = 'none';
}

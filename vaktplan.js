// --- VAKTPLAN OG POENGSYSTEM - FIXET VERSJON ---
let currentVaktplanData = [];
let alleMedlemmerCache = [];
let isLoadingVaktplan = false;

// 1. Initialisering
async function initVaktplan() {
    if (isLoadingVaktplan) return;
    isLoadingVaktplan = true;
    
    const section = document.getElementById('mod-vaktplan');
    if (!section.classList.contains('edit-locked')) {
        section.classList.add('edit-locked');
        oppdaterGrensesnitt(true);
    }
    
    showLoader(true);
    
    // Hent alle medlemmer med poeng_benyttet
    const { data: members, error: memberError } = await sb.from('medlemmer')
        .select('id, fornavn, etternavn, tlf_mobil, poeng_benyttet');
    
    if (memberError) {
        console.error("Feil ved henting av medlemmer:", memberError);
        showError("Kunne ikke hente medlemmer: " + memberError.message);
    } else {
        alleMedlemmerCache = members || [];
        console.log(`Hentet ${alleMedlemmerCache.length} medlemmer`);
        oppdaterMedlemDatalist();
    }

    await lastVaktplan();
    showLoader(false);
    isLoadingVaktplan = false;
}

// Fyller <datalist id="medlem-liste"> som vaktplan-inputs slår opp i.
function oppdaterMedlemDatalist() {
    const list = document.getElementById('medlem-liste');
    if (!list) return;
    list.innerHTML = alleMedlemmerCache
        .map(m => `<option value="${escapeHtml(m.fornavn)} ${escapeHtml(m.etternavn)}">📱 ${escapeHtml(m.tlf_mobil || '')}</option>`)
        .join('');
}

// 2. Hent vakter - FIXET
async function lastVaktplan() {
    const monthPicker = document.getElementById('vakt-month-picker');
    if (!monthPicker) return;
    
    const monthVal = monthPicker.value;
    if (!monthVal) return;
    
    console.log("Laster vaktplan for måned:", monthVal);
    
    const { data, error } = await sb
        .from('vaktplan')
        .select(`
            *,
            hoved_vakt_id,
            ekstra_vakt_id,
            hoved:medlemmer!vaktplan_hoved_vakt_id_fkey(fornavn, etternavn, id),
            ekstra:medlemmer!vaktplan_ekstra_vakt_id_fkey(fornavn, etternavn, id)
        `)
        .eq('maaned', monthVal);

    if (error) {
        console.error("Feil ved henting av vakter:", error);
        showError("Feil ved henting av vaktplan: " + error.message);
        return;
    }

    console.log(`Fant ${data?.length || 0} vakter for ${monthVal}`);
    currentVaktplanData = data || [];
    
    tegnVaktplanMatrise(monthVal);
    await beregnOgVisPoeng();
}

// 3. Tegn kalender - FIXET (fjerner avhengighet til dag_indeks)
function tegnVaktplanMatrise(monthString) {
    const [year, month] = monthString.split('-').map(Number);
    const tbody = document.getElementById('vakt-body-prototype');
    if (!tbody) return;
    
    tbody.innerHTML = "";

    const dagerIMaaned = new Date(year, month, 0).getDate();
    const forsteDag = new Date(year, month - 1, 1);
    const forsteUkedag = forsteDag.getDay(); // 0 = Søndag, 1 = Mandag, etc.
    
    // Juster så Mandag blir 0
    let justertStart = forsteUkedag === 0 ? 6 : forsteUkedag - 1;
    
    let dagTeller = 1;
    let ukeTeller = 1;
    
    // Maks 6 uker i en måned
    for (let u = 0; u < 6; u++) {
        if (dagTeller > dagerIMaaned) break;
        
        const tr = document.createElement('tr');
        
        // Beregn ukenummer riktig
        const currentDate = new Date(year, month - 1, dagTeller);
        const ukeNr = getWeekNumber(currentDate);
        
        const ukeTd = document.createElement('td');
        ukeTd.style.background = "#f1efe7";
        ukeTd.style.fontWeight = "bold";
        ukeTd.style.textAlign = "center";
        ukeTd.style.width = "55px";
        ukeTd.innerText = ukeNr;
        tr.appendChild(ukeTd);
        
        // Gå gjennom Mandag (0) til Søndag (6)
        for (let d = 0; d < 7; d++) {
            const td = document.createElement('td');
            if (d >= 5) td.classList.add('td-weekend');

            // Sjekk om denne dagen er i denne måneden
            if ((u === 0 && d < justertStart) || dagTeller > dagerIMaaned) {
                td.innerHTML = `<div style="color:#ccc; text-align:center;">—</div>`;
            } else {
                // Finn vakt for denne datoen
                const vakt = currentVaktplanData.find(v => v.dato === dagTeller) || {};
                
                // Hent navn fra relasjonene
                const hovedNavn = vakt.hoved ? `${vakt.hoved.fornavn} ${vakt.hoved.etternavn}` : "";
                const ekstraNavn = vakt.ekstra ? `${vakt.ekstra.fornavn} ${vakt.ekstra.etternavn}` : "";
                
                td.innerHTML = `
                    <div class="vakt-cell">
                        <div class="vakt-date">${dagTeller}.</div>
                        <input type="text" class="vakt-input" list="medlem-liste" 
                               placeholder="Hovedvakt" 
                               value="${escapeHtml(hovedNavn)}"
                               data-dato="${dagTeller}" data-type="hoved"
                               onchange="lagreVaktFraInput(this)">
                        <input type="text" class="vakt-input" list="medlem-liste" 
                               placeholder="Ekstravakt" 
                               value="${escapeHtml(ekstraNavn)}"
                               data-dato="${dagTeller}" data-type="ekstra"
                               onchange="lagreVaktFraInput(this)">
                    </div>`;
                dagTeller++;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
        ukeTeller++;
    }
}

// 4. NY forbedret lagringsfunksjon
async function lagreVaktFraInput(inputElement) {
    const dato = parseInt(inputElement.dataset.dato);
    const type = inputElement.dataset.type;
    const verdi = inputElement.value.trim();
    const maaned = document.getElementById('vakt-month-picker').value;
    
    if (!maaned || !dato) {
        console.error("Mangler måned eller dato");
        return;
    }
    
    // Finn medlem-ID basert på navn
    let medlemId = null;
    if (verdi !== "") {
        const medlem = alleMedlemmerCache.find(m => 
            `${m.fornavn} ${m.etternavn}`.toLowerCase() === verdi.toLowerCase()
        );
        
        if (!medlem) {
            visBeskjed("FEIL", `Fant ikke medlemmet "${verdi}". Vennligst velg fra listen.`, "error");
            // Restore forrige verdi
            await lastVaktplan();
            return;
        }
        medlemId = medlem.id;
    }
    
    showLoader(true);
    
    try {
        // Sjekk om det finnes en eksisterende vakt for denne datoen
        const { data: eksisterende, error: findError } = await sb
            .from('vaktplan')
            .select('id')
            .eq('maaned', maaned)
            .eq('dato', dato)
            .maybeSingle(); // Bruk maybeSingle i stedet for single
        
        if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows
            throw findError;
        }
        
        const updateData = {
            maaned: maaned,
            dato: dato,
            dag_indeks: new Date(parseInt(maaned.split('-')[0]), parseInt(maaned.split('-')[1]) - 1, dato).getDay()
        };
        
        if (type === 'hoved') {
            updateData.hoved_vakt_id = medlemId;
        } else {
            updateData.ekstra_vakt_id = medlemId;
        }
        
        let result;
        if (eksisterende) {
            // Oppdater eksisterende
            result = await sb
                .from('vaktplan')
                .update(updateData)
                .eq('id', eksisterende.id);
        } else {
            // Opprett ny
            result = await sb
                .from('vaktplan')
                .insert(updateData);
        }
        
        if (result.error) throw result.error;
        
        console.log(`Lagret ${type}vakt for dato ${dato}.${maaned}`);
        
        // Last alt på nytt for å oppdatere visningen
        await lastVaktplan();
        
    } catch (error) {
        console.error("Feil ved lagring:", error);
        showError("Kunne ikke lagre vakt: " + error.message);
        visBeskjed("FEIL", "Feil ved lagring: " + error.message, "error");
    }
    
    showLoader(false);
}

// Hvor langt tilbake i tid vi henter vakter for poengberegning. Settes
// konservativt høyt (5 år) for å unngå at langtidsmedlemmer mister opptjente
// poeng. Skal justeres ned hvis tabellen vokser merkbart — eller helst
// erstattes med en server-side aggregert view i Supabase.
const VAKT_POENG_MAANEDER_TILBAKE = 60;

// 5. Poengberegning - KUN fortid og i dag
async function beregnOgVisPoeng() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - VAKT_POENG_MAANEDER_TILBAKE);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

    const { data: alleVakter, error } = await sb
        .from('vaktplan')
        .select('maaned, dato, hoved_vakt_id, ekstra_vakt_id')
        .gte('maaned', cutoffStr);

    if (error) {
        console.error("Feil ved henting av vakter for poeng:", error);
        return;
    }

    if (!alleVakter) return;

    const iDag = new Date();
    iDag.setHours(23, 59, 59, 999); // Inkluder hele dagen i dag
    
    const teller = {};
    
    alleVakter.forEach(v => {
        const [year, month] = v.maaned.split('-').map(Number);
        const vaktDato = new Date(year, month - 1, v.dato);
        vaktDato.setHours(23, 59, 59, 999);
        
        // KUN tell poeng hvis vakten er i dag eller tidligere
        if (vaktDato <= iDag) {
            if (v.hoved_vakt_id) {
                teller[v.hoved_vakt_id] = (teller[v.hoved_vakt_id] || 0) + 1;
            }
            if (v.ekstra_vakt_id) {
                teller[v.ekstra_vakt_id] = (teller[v.ekstra_vakt_id] || 0) + 1;
            }
        }
    });
    
    // Oppdater tabellen
    const tbody = document.getElementById('vakt-score-body');
    if (!tbody) return;
    
    tbody.innerHTML = "";

    // Sorter etter poeng (høyest først)
    const sortertListe = [...alleMedlemmerCache].sort((a, b) => {
        const poengA = teller[a.id] || 0;
        const poengB = teller[b.id] || 0;
        return poengB - poengA;
    });

    let vistCount = 0;
    sortertListe.forEach(m => {
        const opptjent = teller[m.id] || 0;
        const benyttet = m.poeng_benyttet || 0;
        const saldo = opptjent - benyttet;

        // Vis alle medlemmer som har poeng eller har benyttet poeng
        if (opptjent > 0 || benyttet > 0) {
            tbody.innerHTML += `
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
            vistCount++;
        }
    });
    
    if (vistCount === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Ingen opptjente vakter enda</td></tr>`;
    }
}

// 6. Lagring av benyttede poeng - FIXET
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
        // Oppdater cachen
        const member = alleMedlemmerCache.find(m => m.id === medlemId);
        if (member) {
            member.poeng_benyttet = nyVerdi;
        }
        await beregnOgVisPoeng(); // Refresh display
    }
    
    showLoader(false);
}

// Hjelpefunksjon for ukenummer
function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// 7. Fikset toggleEditMode
// const VAKT_EDIT_PIN = "0555";
function toggleEditMode() {
    const section = document.getElementById('mod-vaktplan');
    const erLaast = section.classList.contains('edit-locked');

    if (!erLaast) {
        section.classList.add('edit-locked');
        oppdaterGrensesnitt(true);
    } else {
        // Bruk ny PIN-modal for vaktplan-redigering
        visVaktplanPinModal();
    }
}

function visVaktplanPinModal() {
    // Fjern eksisterende
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
    if (input === "1989") { // Bruker de første 4 sifrene av hoved-PIN
        const section = document.getElementById('mod-vaktplan');
        section.classList.remove('edit-locked');
        oppdaterGrensesnitt(false);
        lukkVaktplanPinModal();
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

// 8. Legg til event listener for månedsvelger
document.addEventListener('DOMContentLoaded', () => {
    const monthPicker = document.getElementById('vakt-month-picker');
    if (monthPicker) {
        monthPicker.addEventListener('change', () => {
            if (document.getElementById('mod-vaktplan').classList.contains('active')) {
                lastVaktplan();
            }
        });
    }
});

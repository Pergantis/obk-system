// --- PERIODEKORT LOGIKK ---

async function runSearch() {
    const input = document.getElementById('p-search-input').value.trim();
    const resDiv = document.getElementById('p-search-results');
    if (input.length < 2) return;

    cancelSelection(); 
    resDiv.innerHTML = "<p style='color: #666; font-size: 13px; text-align:center;'>Søker etter medlem...</p>";
    
    const { data, error } = await sb.from('medlemmer')
        .select('*')
          .or(`tlf_mobil.ilike.%${input}%,etternavn.ilike.%${input}%,fornavn.ilike.%${input}%`)
        .limit(3);

    if (error) { 
        resDiv.innerHTML = `<div class="alert-box alert-danger">Feil: ${error.message}</div>`; 
        return; 
    }

    if (data.length === 0) {
        resDiv.innerHTML = `
            <div class="alert-box alert-danger" style="margin-top:15px;">
                <p style="margin-bottom: 10px;">⚠️ Personen finnes ikke i registeret.</p>
                <button class="btn" style="background:var(--marine)" onclick="showNewMemberBox('${input}')">+ REGISTRER NYTT MEDLEM</button>
            </div>`;
        return;
    }

    // Her bygger vi de pene boksene
    resDiv.innerHTML = data.map(m => `
        <div class="search-result-item" onclick="selectMemberForPass('${m.id}', '${m.fornavn} ${m.etternavn}', '${m.epost}', '${m.tlf_mobil}')">
            <div class="search-item-icon">👤</div>
            <div class="search-item-info">
                <strong>${m.fornavn} ${m.etternavn}</strong>
                <small>📱 ${m.tlf_mobil} ${m.epost ? ` | 📧 ${m.epost}` : ''}</small>
            </div>
        </div>`).join('');
}

async function selectMemberForPass(id, name, epost, tlf) {
    selectedMemberId = id;
    document.getElementById('p-search-results').innerHTML = "";
    document.getElementById('p-new-member-box').style.display = 'none';
    
    document.getElementById('p-display-name').innerText = "👤 " + name;
    document.getElementById('p-edit-email').value = epost || "";
    document.getElementById('p-edit-phone').value = tlf || "";

    // Sjekk nåværende status på periodekort
    const { data } = await sb.from('periodekort')
        .select('slutt_dato')
        .eq('medlem_id', id)
        .order('slutt_dato', { ascending: false })
        .limit(1);

    const warnBox = document.getElementById('p-existing-warning');
    const dateLabel = document.getElementById('p-date-label');
    
    // Nullstill datovelgere for sikkerhet
    document.getElementById('p-start-date').value = "";
    document.getElementById('p-end-date').value = "";

    if (data && data.length > 0) {
        const utlop = new Date(data[0].slutt_dato);
        const iDag = new Date(); iDag.setHours(0,0,0,0);
        
        if (utlop >= iDag) {
            // MEDLEM HAR AKTIVT KORT - VIS TYDELIG GUL ADVARSEL
            const datoStr = utlop.toLocaleDateString('no-NO');
            warnBox.innerHTML = `⚠️ Dette medlemmet har allerede et aktivt kort som utløper <b>${datoStr}</b>.<br>Vil du forlenge dette?`;
            warnBox.style.display = "block";
            dateLabel.innerText = "Forlengelse (Velg nye datoer)";
            
            // SMART TIPS: Sett ny startdato til dagen etter forrige utløp
            const dagenEtter = new Date(utlop);
            dagenEtter.setDate(dagenEtter.getDate() + 1);
            document.getElementById('p-start-date').value = dagenEtter.toISOString().split('T')[0];
        } else {
            warnBox.style.display = "none";
            dateLabel.innerText = "Nytt periodekort (Kortet er utløpt)";
        }
    } else {
        warnBox.style.display = "none";
        dateLabel.innerText = "Første periodekort";
    }

    document.getElementById('p-form-box').style.display = 'block';
}

async function saveMemberPassUpdate() {
    if (!selectedMemberId) return;
    const em = document.getElementById('p-edit-email').value.trim();
    const ph = document.getElementById('p-edit-phone').value.trim();
    const st = document.getElementById('p-start-date').value;
    const sl = document.getElementById('p-end-date').value;

    if (!em || !ph) { alert("E-post og mobil er obligatorisk."); return; }

    showLoader(true);
    try {
        await sb.from('medlemmer').update({ epost: em, tlf_mobil: ph }).eq('id', selectedMemberId);
        if (st && sl) {
            await sb.from('periodekort').insert({ medlem_id: selectedMemberId, start_dato: st, slutt_dato: sl });
            alert("Informasjon og kort lagret!");
        } else {
            alert("Medlemsinfo oppdatert.");
        }
        cancelSelection();
        loadActivePasses();
    } catch (err) { alert("Databasefeil: " + err.message); }
    showLoader(false);
}

function showNewMemberBox(input) {
    cancelSelection();
    document.getElementById('p-new-member-box').style.display = 'block';
    if (!isNaN(input)) document.getElementById('n-phone').value = input;
    else document.getElementById('n-en').value = input;
}

async function registerBrandNewMember(isForced = false) {
    const fn = document.getElementById('n-fn').value.trim();
    const en = document.getElementById('n-en').value.trim();
    const ep = document.getElementById('n-email').value.trim();
    const ph = document.getElementById('n-phone').value.trim();
    const st = document.getElementById('n-start').value;
    const sl = document.getElementById('n-end').value;

    if (!fn || !en || !ep || !ph) { alert("Navn, E-post og Mobil er obligatorisk."); return; }

    if (!isForced) {
        showLoader(true);
        const { data: eksisterende } = await sb.from('medlemmer').select('fornavn, etternavn').eq('tlf_mobil', ph).limit(1);
        showLoader(false);
        if (eksisterende && eksisterende.length > 0) {
            const navn = eksisterende[0].fornavn + " " + eksisterende[0].etternavn;
            const warningBox = document.getElementById('n-warning');
            warningBox.innerText = `Advarsel: ${navn} er allerede registrert med dette nummeret. Vil du virkelig opprette en duplikat?`;
            warningBox.style.display = "block";
            document.getElementById('n-btn-save').style.display = "none";
            document.getElementById('n-btn-force').style.display = "block";
            return;
        }
    }

    showLoader(true);
    try {
        const { data, error } = await sb.from('medlemmer').insert({ fornavn: fn, etternavn: en, epost: ep, tlf_mobil: ph }).select();
        if (error) throw error;
        if (data && data.length > 0 && st && sl) {
            await sb.from('periodekort').insert({ medlem_id: data[0].id, start_dato: st, slutt_dato: sl });
        }
        alert("Medlem lagret!");
        cancelSelection();
        loadActivePasses();
    } catch (err) { alert("Feil ved lagring: " + err.message); }
    showLoader(false);
}

// --- DEN VIKTIGSTE ENDRINGEN: KUN ÉN LINJE PER MEDLEM I LISTA ---
async function loadActivePasses() {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await sb.from('periodekort')
        .select('slutt_dato, medlem_id, medlemmer(fornavn, etternavn, tlf_mobil)')
        .gte('slutt_dato', today);

    if (error) return;
    const tbody = document.getElementById('p-active-table-body');
    if (!tbody) return;

    // Vaske-logikk (behold nyeste kort per medlem)
    const vasketListe = {};
    data.forEach(p => {
        const id = p.medlem_id;
        if (!vasketListe[id] || new Date(p.slutt_dato) > new Date(vasketListe[id].slutt_dato)) {
            vasketListe[id] = p;
        }
    });

    const sortertListe = Object.values(vasketListe).sort((a, b) => new Date(a.slutt_dato) - new Date(b.slutt_dato));

    tbody.innerHTML = sortertListe.map(p => {
        const slutt = new Date(p.slutt_dato);
        const iDag = new Date(); iDag.setHours(0,0,0,0);
        const dagerIgjen = Math.ceil((slutt - iDag) / (1000 * 60 * 60 * 24));
        
        // Bruker de nye, enkle fargeklassene
        const fargeKlasse = dagerIgjen < 6 ? "tekst-rod" : "tekst-gronn";

        return `
            <tr>
                <td class="navn-fet">${p.medlemmer.fornavn} ${p.medlemmer.etternavn}</td>
                <td style="color:#666;">${p.medlemmer.tlf_mobil}</td>
                <td style="color:#333;">${slutt.toLocaleDateString('no-NO')}</td>
                <td class="${fargeKlasse}">${dagerIgjen} dager</td>
            </tr>`;
    }).join('');
}

function cancelSelection() {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'none';
    document.getElementById('p-existing-warning').style.display = "none";
    document.getElementById('p-search-results').innerHTML = ""; 
    document.getElementById('n-warning').style.display = "none";
    document.getElementById('n-btn-save').style.display = "block";
    document.getElementById('n-btn-force').style.display = "none";
    selectedMemberId = null;
}

setInterval(loadActivePasses, 30000);

// --- PERIODEKORT LOGIKK ---

async function runSearch() {
    const input = document.getElementById('p-search-input').value.trim();
    const resDiv = document.getElementById('p-search-results');
    
    if (input.length < 2) return;

    // Lukk alle åpne skjemaer før vi viser nye resultater
    cancelSelection(); 
    
    resDiv.innerHTML = "<p style='color: #666; font-size: 13px;'>Søker...</p>";
    
    // Vi henter data fra databasen
    const { data, error } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${input}%,etternavn.ilike.%${input}%`)
        .limit(5);

    if (error) {
        resDiv.innerHTML = "<span style='color:red;'>Søkefeil: " + error.message + "</span>";
        return;
    }

    // Hvis ingen blir funnet: Vis rød boks med beskjed og registrerings-knapp
    if (data.length === 0) {
        resDiv.innerHTML = `
            <div class="not-found-box">
                <p style="color: var(--advarsel); font-weight: bold; margin: 0 0 10px 0;">
                    ⚠️ Personen finnes ikke i registeret og må registreres.
                </p>
                <button class="btn" style="background:var(--marine); width:100%;" onclick="showNewMemberBox('${input}')">
                    + REGISTRER NYTT MEDLEM
                </button>
            </div>
        `;
        return;
    }

    // Hvis treff: Vis de pene boksene (search-item)
    resDiv.innerHTML = data.map(m => `
        <div class="search-item" onclick="selectMemberForPass('${m.id}', '${m.fornavn} ${m.etternavn}', '${m.epost}', '${m.tlf_mobil}')">
            <strong>${m.fornavn} ${m.etternavn}</strong>
            <small>📱 ${m.tlf_mobil} | 📧 ${m.epost || 'Ingen e-post'}</small>
        </div>`).join('');
}

async function selectMemberForPass(id, name, epost, tlf) {
    selectedMemberId = id;
    
    // Skjul søkeresultater og Nytt Medlem-boksen
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

    const st = document.getElementById('p-current-status');
    if (data && data.length > 0) {
        const ut = new Date(data[0].slutt_dato);
        const iDag = new Date();
        iDag.setHours(0,0,0,0);
        st.innerText = "Nåværende kort utløper: " + ut.toLocaleDateString('no-NO');
        st.style.color = ut >= iDag ? "green" : "red";
    } else {
        st.innerText = "Ingen aktive kort funnet på dette medlemmet.";
        st.style.color = "#666";
    }

    // Vis selve skjemaet for oppdatering
    document.getElementById('p-form-box').style.display = 'block';
}

async function saveMemberPassUpdate() {
    if (!selectedMemberId) {
        alert("Feil: Vennligst søk og velg person på nytt.");
        return;
    }
    
    const em = document.getElementById('p-edit-email').value.trim();
    const ph = document.getElementById('p-edit-phone').value.trim();
    const st = document.getElementById('p-start-date').value;
    const sl = document.getElementById('p-end-date').value;

    if (!em || !ph) { alert("E-post og mobil er obligatorisk."); return; }

    showLoader(true);
    try {
        // 1. Oppdater medlemsinformasjonen (E-post og Mobil)
        await sb.from('medlemmer').update({ epost: em, tlf_mobil: ph }).eq('id', selectedMemberId);
        
        // 2. Lagre nytt periodekort hvis datoene er fylt ut
        if (st && sl) {
            await sb.from('periodekort').insert({ medlem_id: selectedMemberId, start_dato: st, slutt_dato: sl });
            alert("Informasjon og nytt periodekort er lagret!");
        } else {
            alert("Medlemsinfo ble oppdatert (uten nytt periodekort).");
        }
        
        cancelSelection();
        loadActivePasses();
    } catch (err) {
        alert("Databasefeil: " + err.message);
    }
    showLoader(false);
}

function showNewMemberBox(input) {
    cancelSelection(); // Lukker alt annet først
    document.getElementById('p-search-results').innerHTML = ""; // Fjerner "Person finnes ikke"-meldingen
    
    document.getElementById('p-new-member-box').style.display = 'block';
    
    // Fyller ut mobil hvis søket var et tall, eller etternavn hvis det var tekst
    if (!isNaN(input)) {
        document.getElementById('n-phone').value = input;
    } else {
        document.getElementById('n-en').value = input;
    }
}

async function registerBrandNewMember() {
    const fn = document.getElementById('n-fn').value.trim();
    const en = document.getElementById('n-en').value.trim();
    const ep = document.getElementById('n-email').value.trim();
    const ph = document.getElementById('n-phone').value.trim();

    if (!fn || !en || !ep || !ph) { 
        alert("Fornavn, Etternavn, E-post og Mobil er obligatoriske felt."); 
        return; 
    }

    showLoader(true);
    try {
        const { data, error } = await sb.from('medlemmer')
            .insert({ fornavn: fn, etternavn: en, epost: ep, tlf_mobil: ph })
            .select();
        
        if (error) throw error;
        
        alert("Nytt medlem registrert!");
        cancelSelection();
        loadActivePasses();
    } catch (err) {
        alert("Feil ved lagring: " + err.message);
    }
    showLoader(false);
}

async function loadActivePasses() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await sb.from('periodekort')
        .select('slutt_dato, medlemmer(fornavn, etternavn, tlf_mobil)')
        .gte('slutt_dato', today)
        .order('slutt_dato', { ascending: true });

    const tbody = document.getElementById('p-active-table-body');
    if (!tbody) return;
    
    if (error || !data || data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4'>Ingen aktive kort funnet.</td></tr>";
        return;
    }

    tbody.innerHTML = data.map(p => {
        const slutt = new Date(p.slutt_dato);
        const naa = new Date();
        naa.setHours(0,0,0,0);
        const dager = Math.ceil((slutt - naa) / 86400000);
        
        let kl = "dager-ok";
        if (dager <= 0) kl = "dager-utlopt";
        else if (dager <= 7) kl = "dager-advarsel";
        
        const dagerTekst = dager <= 0 ? "Siste dag!" : dager + " dager";

        return `<tr>
            <td><strong>${p.medlemmer.fornavn} ${p.medlemmer.etternavn}</strong></td>
            <td>${p.medlemmer.tlf_mobil}</td>
            <td>${slutt.toLocaleDateString('no-NO')}</td>
            <td class="${kl}">${dagerTekst}</td>
        </tr>`;
    }).join('');
}

function cancelSelection() {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'none';
    document.getElementById('p-search-results').innerHTML = ""; // Tømmer søkeresultater
    selectedMemberId = null;
    
    // Tømmer feltene i Nytt Medlem-skjemaet
    const inputs = document.querySelectorAll('#p-new-member-box input');
    inputs.forEach(i => i.value = "");
}

// Oppdaterer listen hvert 30. sekund
setInterval(loadActivePasses, 30000);

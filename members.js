// --- PERIODEKORT LOGIKK ---

async function runSearch() {
    const input = document.getElementById('p-search-input').value.trim();
    const resDiv = document.getElementById('p-search-results');
    
    if (input.length < 2) return;

    cancelSelection(); 
    resDiv.innerHTML = "<p style='color: #666; font-size: 13px;'>Søker...</p>";
    
    const { data, error } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${input}%,etternavn.ilike.%${input}%`)
        .limit(5);

    if (error) {
        resDiv.innerHTML = "<span style='color:red;'>Søkefeil: " + error.message + "</span>";
        return;
    }

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

    resDiv.innerHTML = data.map(m => `
        <div class="search-item" onclick="selectMemberForPass('${m.id}', '${m.fornavn} ${m.etternavn}', '${m.epost}', '${m.tlf_mobil}')">
            <strong>${m.fornavn} ${m.etternavn}</strong>
            <small>📱 ${m.tlf_mobil} | 📧 ${m.epost || 'Ingen e-post'}</small>
        </div>`).join('');
}

async function selectMemberForPass(id, name, epost, tlf) {
    selectedMemberId = id;
    document.getElementById('p-search-results').innerHTML = "";
    document.getElementById('p-new-member-box').style.display = 'none';
    
    document.getElementById('p-display-name').innerText = "👤 " + name;
    document.getElementById('p-edit-email').value = epost || "";
    document.getElementById('p-edit-phone').value = tlf || "";

    const { data } = await sb.from('periodekort')
        .select('slutt_dato')
        .eq('medlem_id', id)
        .order('slutt_dato', { ascending: false })
        .limit(1);

    const st = document.getElementById('p-current-status');
    if (data && data.length > 0) {
        const ut = new Date(data[0].slutt_dato);
        const iDag = new Date(); iDag.setHours(0,0,0,0);
        st.innerText = "Nåværende kort utløper: " + ut.toLocaleDateString('no-NO');
        st.style.color = ut >= iDag ? "green" : "red";
    } else {
        st.innerText = "Ingen aktive kort funnet.";
        st.style.color = "#666";
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
            alert("Lagret!");
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
    document.getElementById('p-search-results').innerHTML = "";
    document.getElementById('p-new-member-box').style.display = 'block';
    if (!isNaN(input)) document.getElementById('n-phone').value = input;
    else document.getElementById('n-en').value = input;
}

// --- OPPDATERT FUNKSJON MED DUPLIKATSJEKK ---
async function registerBrandNewMember(isForced = false) {
    const fn = document.getElementById('n-fn').value.trim();
    const en = document.getElementById('n-en').value.trim();
    const ep = document.getElementById('n-email').value.trim();
    const ph = document.getElementById('n-phone').value.trim();
    const st = document.getElementById('n-start').value;
    const sl = document.getElementById('n-end').value;

    if (!fn || !en || !ep || !ph) { 
        alert("Fornavn, Etternavn, E-post og Mobil er obligatoriske felt."); 
        return; 
    }

    // STEG 1: Sjekk om mobilnummer finnes fra før (hvis bruker ikke allerede har tvunget lagring)
    if (!isForced) {
        showLoader(true);
        // Vi leter i databasen etter dette mobilnummeret
        const { data: eksisterende, error: sjekkFeil } = await sb
            .from('medlemmer')
            .select('fornavn, etternavn')
            .eq('tlf_mobil', ph)
            .limit(1); // Vi trenger bare å vite om ÉN person finnes

        showLoader(false);

        if (eksisterende && eksisterende.length > 0) {
            // Hvis vi fant noen: Vis advarsel og bytt knapper
            const navn = eksisterende[0].fornavn + " " + eksisterende[0].etternavn;
            const warningBox = document.getElementById('n-warning');
            warningBox.innerText = `Advarsel: ${navn} er allerede registrert med dette nummeret. Vil du virkelig opprette en duplikat?`;
            warningBox.style.display = "block";

            document.getElementById('n-btn-save').style.display = "none"; // Skjul vanlig knapp
            document.getElementById('n-btn-force').style.display = "block"; // Vis bekreft-knapp
            return; // Stopp prosessen her
        }
    }

    // STEG 2: Lagre medlemmet (hvis ingen duplikater ELLER hvis tvunget lagring)
    showLoader(true);
    try {
        const { data, error } = await sb.from('medlemmer')
            .insert({ fornavn: fn, etternavn: en, epost: ep, tlf_mobil: ph })
            .select();
        
        if (error) throw error;

        if (data && data.length > 0 && st && sl) {
            await sb.from('periodekort').insert({ medlem_id: data[0].id, start_dato: st, slutt_dato: sl });
            alert("Medlem registrert med periodekort!");
        } else {
            alert("Medlem registrert uten periodekort.");
        }
        
        cancelSelection();
        loadActivePasses();
    } catch (err) { alert("Feil ved lagring: " + err.message); }
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
        const dager = Math.ceil((slutt - new Date().setHours(0,0,0,0)) / 86400000);
        let kl = "dager-ok";
        if (dager <= 0) kl = "dager-utlopt";
        else if (dager <= 7) kl = "dager-advarsel";
        return `<tr><td><strong>${p.medlemmer.fornavn} ${p.medlemmer.etternavn}</strong></td><td>${p.medlemmer.tlf_mobil}</td><td>${slutt.toLocaleDateString('no-NO')}</td><td class="${kl}">${dager <= 0 ? 'Siste dag!' : dager + " dager"}</td></tr>`;
    }).join('');
}

function cancelSelection() {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'none';
    document.getElementById('p-search-results').innerHTML = ""; 
    
    // NYTT: Skjul advarselen og nullstill knappene
    document.getElementById('n-warning').style.display = "none";
    document.getElementById('n-btn-save').style.display = "block";
    document.getElementById('n-btn-force').style.display = "none";

    selectedMemberId = null;
    const inputs = document.querySelectorAll('#p-new-member-box input');
    inputs.forEach(i => i.value = "");
}

setInterval(loadActivePasses, 30000);

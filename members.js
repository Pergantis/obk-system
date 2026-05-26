// members.js - Håndterer periodekort og medlemsliste
// Dato-hjelpere (getTodayLocal, parseLocalDate, addDaysLocal, formatDateForDisplay) bor i app.js.

// --- GLOBALE VARIABLER ---
let selectedMemberForPass = null;
let latestPassForMember = null;

// --- INITIALISERING ---
async function updateMemberModule() {
    await fetchActivePasses();
    attachEventListeners();
}

function attachEventListeners() {
    const searchInput = document.getElementById('m-search');
    if (searchInput) {
        searchInput.removeEventListener('input', handleSearchInput);
        searchInput.addEventListener('input', handleSearchInput);
    }
    
    const renewBtn = document.getElementById('btn-renew');
    const cancelBtn = document.getElementById('btn-cancel');
    
    if (renewBtn) {
        renewBtn.removeEventListener('click', renewPass);
        renewBtn.addEventListener('click', renewPass);
    }
    if (cancelBtn) {
        cancelBtn.removeEventListener('click', clearForm);
        cancelBtn.addEventListener('click', clearForm);
    }
    
    // Modal event listeners
    const confirmBtn = document.getElementById('confirm-new-member');
    const cancelModalBtn = document.getElementById('cancel-new-member');
    
    if (confirmBtn) {
        confirmBtn.removeEventListener('click', processNewMember);
        confirmBtn.addEventListener('click', processNewMember);
    }
    if (cancelModalBtn) {
        cancelModalBtn.removeEventListener('click', closeNewMemberModal);
        cancelModalBtn.addEventListener('click', closeNewMemberModal);
    }
}

// --- SØKEFUNKSJON ---
let searchTimeout = null;

function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    removeSearchBubble();
    
    if (query.length >= 3) {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchMembers(query), 300);
    } else if (query.length === 0) {
        selectedMemberForPass = null;
        latestPassForMember = null;
    }
}

async function searchMembers(query) {
    try {
        const safe = sanitizeSearchQuery(query);
        // Unngå "match alle" hvis input består av bare strippede spesialtegn
        if (!safe) return;
        const { data: members, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil')
            .or(`fornavn.ilike.%${safe}%,etternavn.ilike.%${safe}%,tlf_mobil.ilike.%${safe}%`)
            .eq('er_aktiv', true)
            .limit(10);

        if (error) throw error;

        if (!members || members.length === 0) {
            showNoResultsBubble();
            return;
        }
        
        const today = getTodayLocal();
        const memberIds = members.map(m => m.id);

        // Hent alle periodekort for søketreffene i én spørring (ikke én per medlem).
        // Vi finner det siste kortet per medlem ved å sortere synkende på slutt_dato.
        const { data: passes, error: passError } = await sb
            .from('periodekort')
            .select('medlem_id, slutt_dato')
            .in('medlem_id', memberIds)
            .order('slutt_dato', { ascending: false });

        if (passError) throw passError;

        // Map: medlem_id → seneste slutt_dato. Avhenger av .order(...desc) over —
        // første gang vi ser et medlem_id i loopen, har vi pr. definisjon høyeste slutt_dato.
        const seneste = {};
        (passes || []).forEach(p => {
            if (!(p.medlem_id in seneste)) seneste[p.medlem_id] = p.slutt_dato;
        });

        members.forEach(member => {
            const endDate = seneste[member.id];
            if (!endDate) {
                member.status = 'none';
                member.statusText = 'Ingen kort';
                member.latestEndDate = null;
            } else {
                member.latestEndDate = endDate;
                if (endDate >= today) {
                    member.status = 'active';
                    member.statusText = 'Aktivt';
                } else {
                    member.status = 'expired';
                    member.statusText = 'Utløpt';
                }
            }
        });

        renderSearchBubble(members);
        
    } catch (err) {
        console.error("Søkefeil:", err);
    }
}

function renderSearchBubble(members) {
    // Fjern eksisterende boble FØR vi legger til ny
    const modMedlem = document.getElementById('mod-medlem');
    if (modMedlem) {
        const existing = modMedlem.querySelector('.search-bubble');
        if (existing) existing.remove();
    }
    
    const searchWrapper = document.querySelector('#mod-medlem .search-wrapper');
    if (!searchWrapper) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'search-bubble';
    bubble.setAttribute('data-module', 'medlem'); // Merk boblen
    
    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'search-bubble-item';
        
        let statusClass = '';
        if (member.status === 'active') statusClass = 'active';
        else if (member.status === 'expired') statusClass = 'expired';
        else statusClass = 'none';
        
        let statusText = '';
        if (member.status === 'active') {
            statusText = `🟢 Aktivt - Utløper: ${formatDateForDisplay(member.latestEndDate)}`;
        } else if (member.status === 'expired') {
            statusText = `🟡 Utløpt - Utløpte: ${formatDateForDisplay(member.latestEndDate)}`;
        } else {
            statusText = '⚪ Ingen periodekort';
        }
        
        item.innerHTML = `
            <div>
                <span class="search-bubble-name">${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)}</span>
                <span class="search-bubble-phone">📱 ${escapeHtml(member.tlf_mobil || 'Ingen telefon')}</span>
            </div>
            <div class="search-bubble-status ${statusClass}">
                ${statusText}
            </div>
        `;
        
        item.addEventListener('click', () => selectMember(member.id));
        bubble.appendChild(item);
    });
    
        searchWrapper.appendChild(bubble);
        bubble.style.position = 'absolute';
        bubble.style.top = '100%';
        bubble.style.left = '0';
        bubble.style.right = '0';
        bubble.style.zIndex = '1000';
}

function showNoResultsBubble() {
    // Fjern eksisterende boble først
    removeSearchBubble();
    
    // Finn RIKTIG search-wrapper (innenfor periodekort-modulen)
    const searchWrapper = document.querySelector('#mod-medlem .search-wrapper');
    if (!searchWrapper) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'search-bubble';
    bubble.style.position = 'absolute';
    bubble.style.top = '100%';
    bubble.style.left = '0';
    bubble.style.right = '0';
    bubble.style.zIndex = '1000';
    
    bubble.innerHTML = `
        <div class="search-bubble-item" style="text-align: center;">
            <div style="margin-bottom: 10px;">😕 Ingen medlemmer funnet</div>
            <button class="search-bubble-btn" id="show-register-modal-btn">➕ Registrer nytt medlem</button>
        </div>
    `;
    
    searchWrapper.appendChild(bubble);
    
    const registerBtn = document.getElementById('show-register-modal-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            openNewMemberModal();
        });
    }
}

function removeSearchBubble() {
    // Fjern KUN boblen som er innenfor periodekort-modulen
    const modMedlem = document.getElementById('mod-medlem');
    if (modMedlem) {
        const existing = modMedlem.querySelector('.search-bubble');
        if (existing) existing.remove();
    }
}

// --- MODAL FUNKSJONER ---
function openNewMemberModal() {
    // Tøm modal-feltene
    document.getElementById('new-fornavn').value = '';
    document.getElementById('new-etternavn').value = '';
    document.getElementById('new-mobil').value = '';
    document.getElementById('new-epost').value = '';
    document.getElementById('new-startdato').value = '';
    document.getElementById('new-sluttdato').value = '';
    
    // Vis modalen
    document.getElementById('new-member-modal').style.display = 'flex';
    
    // Fjern boblen
    removeSearchBubble();
}

function closeNewMemberModal() {
    document.getElementById('new-member-modal').style.display = 'none';
}
// --- MODAL FOR SKAPLEIE (uten dato-felter) ---
let skapCallbackAfterRegister = null;

window.openNewMemberModalForSkap = function(onSuccess) {
    // Tøm modal-feltene
    document.getElementById('new-fornavn').value = '';
    document.getElementById('new-etternavn').value = '';
    document.getElementById('new-startdato').value = '';
    document.getElementById('new-sluttdato').value = '';
    
    // Skjul dato-seksjonen for skapleie
    const modal = document.getElementById('new-member-modal');
    modal.classList.add('skap-mode');
    
    // Lagre callback for etter registrering
    skapCallbackAfterRegister = onSuccess;
    
    // Endre knapp-tekst midlertidig
    const confirmBtn = document.getElementById('confirm-new-member');
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = 'OPPRETT OG BRUK';
    
    // Fjern event listener og legg til ny midlertidig
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', async () => {
        await processNewMemberForSkap();
        // Restore
        modal.classList.remove('skap-mode');
        newConfirmBtn.innerText = originalText;
        skapCallbackAfterRegister = null;
    });
    
    // Vis modalen
    modal.style.display = 'flex';
};

async function processNewMemberForSkap() {
    const fornavn = document.getElementById('new-fornavn').value.trim();
    const etternavn = document.getElementById('new-etternavn').value.trim();
    
    if (!fornavn || !etternavn) {
        visBeskjed("FEIL", "Fornavn og etternavn må fylles ut", "error");
        return;
    }
    
    try {
        const { data: newMember, error } = await sb
            .from('medlemmer')
            .insert({
                fornavn: fornavn,
                etternavn: etternavn,
                tlf_mobil: null,
                epost: null,
                er_aktiv: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        visBeskjed("SUKSESS", `${fornavn} ${etternavn} er registrert som medlem`, "success");
        
        // Lukk modal
        closeNewMemberModal();
        
        // Kjør callback hvis eksisterer
        if (skapCallbackAfterRegister) {
            skapCallbackAfterRegister(newMember);
        }
        
    } catch (err) {
        console.error("Feil ved registrering:", err);
        visBeskjed("FEIL", "Kunne ikke registrere medlem. Prøv igjen.", "error");
    }
}

async function processNewMember() {
    const fornavn = document.getElementById('new-fornavn').value.trim();
    const etternavn = document.getElementById('new-etternavn').value.trim();
    const mobil = document.getElementById('new-mobil').value.trim();
    const epost = document.getElementById('new-epost').value.trim();
    let startDato = document.getElementById('new-startdato').value;
    let sluttDato = document.getElementById('new-sluttdato').value;
    const today = getTodayLocal();
    
    // Validering av navn
    if (!fornavn) {
        visBeskjed("FEIL", "Fornavn må fylles ut", "error");
        return;
    }
    
    if (!etternavn) {
        visBeskjed("FEIL", "Etternavn må fylles ut", "error");
        return;
    }
    
    // Valider mobil (obligatorisk)
    if (!validerMobil(mobil)) {
        visBeskjed("FEIL", "Mobilnummer må være 8 siffer (kun tall)", "error");
        return;
    }
    
    // Valider e-post (valgfritt, men sjekk format hvis utfylt)
    if (!validerEpost(epost)) {
        visBeskjed("FEIL", "Ugyldig e-postadresse", "error");
        return;
    }
    
    // Sjekk først om medlem finnes (basert på navn)
    const exists = await checkMemberExists(fornavn, etternavn);
    if (exists) {
        visBekreftelse(
            "ADVARSEL",
            `${fornavn} ${etternavn} finnes allerede i systemet. Vil du likevel opprette?`,
            "⚠️",
            async () => {
                await fortsettRegistrering(fornavn, etternavn, mobil, epost, startDato, sluttDato, today);
            },
            () => {
                // Nei - behold modalen åpen
                return;
            }
        );
        return;
    }
    
    // Håndter auto-fyll logikk
    await handterAutoFyllOgRegistrer(fornavn, etternavn, mobil, epost, startDato, sluttDato, today);
}
async function handterAutoFyllOgRegistrer(fornavn, etternavn, mobil, epost, startDato, sluttDato, today) {
    const autoFyllTilfelle = {
        kunStart: (startDato && !sluttDato),
        kunSlutt: (!startDato && sluttDato),
        ingenDatoer: (!startDato && !sluttDato)
    };
    
    if (autoFyllTilfelle.kunStart) {
        const nySluttDato = addDaysLocal(startDato, 30);
        visBekreftelse(
            "AUTO-FYLL",
            `Sluttdato for kortet er automatisk satt til ${formatDateForDisplay(nySluttDato)}. Vil du fortsette?`,
            "🤔",
            async () => {
                await fortsettRegistrering(fornavn, etternavn, mobil, epost, startDato, nySluttDato, today);
            },
            () => {
                return;
            }
        );
        return;
    }
    
    if (autoFyllTilfelle.kunSlutt) {
        const nyStartDato = today;
        visBekreftelse(
            "AUTO-FYLL",
            `Startdato for kortet er automatisk satt til ${formatDateForDisplay(nyStartDato)}. Vil du fortsette?`,
            "🤔",
            async () => {
                await fortsettRegistrering(fornavn, etternavn, mobil, epost, nyStartDato, sluttDato, today);
            },
            () => {
                return;
            }
        );
        return;
    }
    
    if (autoFyllTilfelle.ingenDatoer) {
        visBekreftelse(
            "BEKREFTELSE",
            `Ingen periodekort vil bli opprettet for ${fornavn} ${etternavn}. Vil du fortsette?`,
            "🤔",
            async () => {
                await fortsettRegistrering(fornavn, etternavn, mobil, epost, null, null, today);
            },
            () => {
                return;
            }
        );
        return;
    }
    
    // Begge datoer er fylt ut
    await fortsettRegistrering(fornavn, etternavn, mobil, epost, startDato, sluttDato, today);
}

async function fortsettRegistrering(fornavn, etternavn, mobil, epost, startDato, sluttDato, today) {
    // Valider datoer hvis begge er satt
    if (startDato && sluttDato) {
        if (sluttDato < startDato) {
            visBeskjed("FEIL", "Sluttdato må være lik eller etter startdato", "error");
            return;
        }
        if (startDato < today) {
            visBeskjed("FEIL", "Startdato kan ikke være før dagens dato", "error");
            return;
        }
    }
    
    try {
        // Opprett medlem med mobil og epost
        const { data: newMember, error: memberError } = await sb
            .from('medlemmer')
            .insert({
                fornavn: fornavn,
                etternavn: etternavn,
                tlf_mobil: mobil,
                epost: epost || null,
                er_aktiv: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (memberError) throw memberError;
        
        // Opprett periodekort hvis datoer er fylt ut
        if (startDato && sluttDato) {
            const { error: passError } = await sb
                .from('periodekort')
                .insert({
                    medlem_id: newMember.id,
                    start_dato: startDato,
                    slutt_dato: sluttDato,
                    created_at: new Date().toISOString()
                });
            
            if (passError) throw passError;
            
            visBeskjed(
                "SUKSESS", 
                `${fornavn} ${etternavn} er registrert med periodekort (${formatDateForDisplay(startDato)} - ${formatDateForDisplay(sluttDato)})`,
                "success"
            );
            
            await fetchActivePasses();
        } else {
            visBeskjed(
                "SUKSESS", 
                `${fornavn} ${etternavn} er registrert som medlem (uten periodekort)`,
                "success"
            );
        }
        
        // Lukk modal og nullstill skjema
        closeNewMemberModal();
        clearForm();
        
        // Fokuser søkefeltet
        document.getElementById('m-search').focus();
        
    } catch (err) {
        console.error("Feil ved registrering:", err);
        visBeskjed("FEIL", "Kunne ikke registrere medlem. Prøv igjen.", "error");
    }
}



async function checkMemberExists(fornavn, etternavn) {
    try {
        const { data, error } = await sb
            .from('medlemmer')
            .select('id')
            .ilike('fornavn', fornavn)
            .ilike('etternavn', etternavn)
            .limit(1);
        
        if (error) throw error;
        
        return data && data.length > 0;
        
    } catch (err) {
        console.error("Feil ved sjekk av eksisterende medlem:", err);
        return false;
    }
}

// --- VELG MEDLEM FRA SØK ---
async function selectMember(memberId) {
    try {
        const { data: member, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil')
            .eq('id', memberId)
            .single();
        
        if (error) throw error;
        
        selectedMemberForPass = member;
        
        document.getElementById('m-fornavn').value = member.fornavn || '';
        document.getElementById('m-etternavn').value = member.etternavn || '';
        
        const { data: passes } = await sb
            .from('periodekort')
            .select('start_dato, slutt_dato')
            .eq('medlem_id', memberId)
            .order('slutt_dato', { ascending: false })
            .limit(1);
        
        latestPassForMember = passes && passes.length > 0 ? passes[0] : null;
        
        suggestDates();
        
        removeSearchBubble();
        document.getElementById('m-search').value = '';
        
    } catch (err) {
        console.error("Feil ved valg av medlem:", err);
    }
}

// --- DATOLOGIKK (LOKAL TIDSSONE) ---
function suggestDates() {
    const today = getTodayLocal();
    let startDate = null;
    let endDate = null;
    
    if (!latestPassForMember) {
        startDate = today;
        endDate = addDaysLocal(today, 30);
    } else {
        const startExists = latestPassForMember.start_dato;
        const endExists = latestPassForMember.slutt_dato;
        
        if (startExists >= today) {
            // Fremtidsdatert periodekort som ikke har startet enda — vis som-er
            startDate = startExists;
            endDate = endExists;
        } else if (endExists >= today) {
            // Aktivt periodekort — foreslå fornyelse fra dagen etter utløp
            const newStart = addDaysLocal(endExists, 1);
            startDate = newStart;
            endDate = addDaysLocal(newStart, 30);
        } else {
            // Utløpt periodekort — start nytt fra i dag
            startDate = today;
            endDate = addDaysLocal(today, 30);
        }
    }
    
    if (startDate) document.getElementById('m-start').value = startDate;
    if (endDate) document.getElementById('m-slutt').value = endDate;
}

// --- OVERLAPPSSJEKK ---
async function validateOverlap(memberId, startDate) {
    const { data: passes, error } = await sb
        .from('periodekort')
        .select('slutt_dato')
        .eq('medlem_id', memberId)
        .order('slutt_dato', { ascending: false })
        .limit(1);

    // Fail-closed: hvis vi ikke kan verifisere mot DB skal vi IKKE tillate ny rad
    if (error) {
        console.error("Feil ved overlapssjekk:", error);
        visBeskjed("FEIL", "Kunne ikke sjekke om periodekort overlapper: " + error.message, "error");
        return false;
    }

    if (!passes || passes.length === 0) return true;

    const lastEndDate = passes[0].slutt_dato;
    if (startDate <= lastEndDate) {
        visBeskjed(
            "ADVARSEL",
            `Kan ikke overlappe med eksisterende periodekort. Ny startdato må være etter ${formatDateForDisplay(lastEndDate)}`,
            "error"
        );
        return false;
    }
    return true;
}

// --- FORNYELSE ---
async function renewPass() {
    if (!selectedMemberForPass) {
        visBeskjed("ADVARSEL", "Du må søke opp og velge et medlem først", "error");
        return;
    }
    
    const startDate = document.getElementById('m-start').value;
    const endDate = document.getElementById('m-slutt').value;
    const today = getTodayLocal();
    
    if (!startDate) {
        visBeskjed("FEIL", "Startdato må fylles ut", "error");
        return;
    }
    
    if (!endDate) {
        visBeskjed("FEIL", "Sluttdato må fylles ut", "error");
        return;
    }
    
    if (endDate < startDate) {
        visBeskjed("FEIL", "Sluttdato må være lik eller etter startdato", "error");
        return;
    }
    
    if (startDate < today) {
        visBeskjed("FEIL", "Startdato kan ikke være før dagens dato", "error");
        return;
    }
    
    const noOverlap = await validateOverlap(selectedMemberForPass.id, startDate);
    if (!noOverlap) return;
    
    try {
        const { error } = await sb
            .from('periodekort')
            .insert({
                medlem_id: selectedMemberForPass.id,
                start_dato: startDate,
                slutt_dato: endDate,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        visBeskjed(
            "SUKSESS", 
            `Periodekort fornyet for ${selectedMemberForPass.fornavn} ${selectedMemberForPass.etternavn}`,
            "success"
        );
        
        await fetchActivePasses();
        clearForm();
        
    } catch (err) {
        console.error("Feil ved fornyelse:", err);
        visBeskjed("FEIL", "Kunne ikke opprette periodekort. Prøv igjen.", "error");
    }
}

// --- AVBRYT ---
function clearForm() {
    document.getElementById('m-search').value = '';
    document.getElementById('m-fornavn').value = '';
    document.getElementById('m-etternavn').value = '';
    document.getElementById('m-start').value = '';
    document.getElementById('m-slutt').value = '';
    
    selectedMemberForPass = null;
    latestPassForMember = null;
    
    removeSearchBubble();
    document.getElementById('m-search').focus();
}

// --- AKTIVE PERIODEKORT (LISTE TIL HØYRE) ---
async function fetchActivePasses() {
   const tableBody = document.getElementById('member-table-body');
    const today = getTodayLocal();

    try {
        // !inner gjør joinen påkrevd; .eq('medlemmer.er_aktiv', true) filtrerer
        // bort periodekort som tilhører soft-slettede medlemmer (jf. samme
        // filter i searchMembers og searchLockerMembers).
        const { data, error } = await sb
            .from('periodekort')
            .select(`
                start_dato,
                slutt_dato,
                medlem_id,
                medlemmer!inner (
                    fornavn,
                    etternavn,
                    tlf_mobil
                )
            `)
            .eq('medlemmer.er_aktiv', true)
            .gte('slutt_dato', today);

        if (error) throw error;

        const uniqueMembers = {};
        (data || []).forEach(row => {
            const id = row.medlem_id;
            if (!uniqueMembers[id] || row.slutt_dato > uniqueMembers[id].slutt_dato) {
                uniqueMembers[id] = row;
            }
        });

        const sortedList = Object.values(uniqueMembers).sort((a, b) => 
            a.slutt_dato.localeCompare(b.slutt_dato)
        );

      renderMemberCards(sortedList);

    } catch (err) {
        console.error("Feil ved henting av periodekort:", err);
    }
}

// Viser periodekort som 3D kort (grid)
function renderMemberCards(members) {
    const container = document.getElementById('member-table-body');
    const today = getTodayLocal();
    const todayDate = parseLocalDate(today);

    if (!members || members.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--tekst-lys);">Ingen aktive periodekort funnet</div>';
        return;
    }

    // Lag grid container
   let html = '';
    
    members.forEach(m => {
        const sluttDato = m.slutt_dato;
        const endDate = parseLocalDate(sluttDato);
        const diffTime = endDate - todayDate;
        const dagerIgjen = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Bestem fargekode
        let fargeKlasse = '';
        let borderFarge = '';
        let bakgrunnFarge = '';
        
        if (dagerIgjen === 0) {
            fargeKlasse = 'utloper-i-dag';
            borderFarge = '#f44336';
            bakgrunnFarge = '#bb1b33';
        } else if (dagerIgjen < 7 && dagerIgjen > 0) {
            fargeKlasse = 'snart';
            borderFarge = '#684d24';
            bakgrunnFarge = '#bb4747f3';
        } else if (dagerIgjen < 0) {
            // Skal ikke skje siden vi filtrerer, men for sikkerhet
            fargeKlasse = 'utlopt';
            borderFarge = '#9e9e9e';
            bakgrunnFarge = '#f5f5f5';
        } else {
            fargeKlasse = 'god-tid';
            borderFarge = '#4caf50';
            bakgrunnFarge = '#548859';
        }
        
        // Dager tekst
        let dagerTekst = '';
        if (dagerIgjen === 0) {
            dagerTekst = '⚠️ Utløper i dag';
        } else if (dagerIgjen < 7 && dagerIgjen > 0) {
            dagerTekst = `⏱ ${dagerIgjen} dager igjen`;
        } else {
            dagerTekst = `✅ ${dagerIgjen} dager igjen`;
        }
        
      html += `
                <div class="periodekort-card" style="border-left: 5px solid ${borderFarge}; background: linear-gradient(135deg, #fff 0%, ${bakgrunnFarge} 100%);">
                    <div class="card-navn">${escapeHtml(m.medlemmer.fornavn)} ${escapeHtml(m.medlemmer.etternavn)}</div>
                    <div class="card-dato">
                        <span>📅</span>
                        <span>Utløper: ${formatDateForDisplay(sluttDato)}</span>
                    </div>
                    <div class="card-dager">
                        <span>${dagerTekst}</span>
                        <div class="card-rediger" 
                            data-medlem-id="${m.medlem_id}" 
                            data-medlem-fornavn="${escapeHtml(m.medlemmer.fornavn)}" 
                            data-medlem-etternavn="${escapeHtml(m.medlemmer.etternavn)}"
                            data-start-dato="${m.start_dato || ''}" 
                            data-slutt-dato="${sluttDato}">
                            ✏️
                        </div>
                    </div>
                    <div class="card-telefon">
                        📱 ${escapeHtml(m.medlemmer.tlf_mobil || '--------')}
                    </div>
                </div>
        `;
    });

    
   html += '';
    container.innerHTML = html;
    setupRedigerIkoner();
    // Oppdater telling
    const countLabel = document.querySelector('.member-count');
    if (countLabel) countLabel.innerText = `Aktive kort: ${members.length}`;
}

// Initialiser ved lasting
window.addEventListener('load', () => {
    setTimeout(() => {
        attachEventListeners();
    }, 500);
});
// Setter opp event listeners for alle rediger-ikoner
function setupRedigerIkoner() {
    const ikoner = document.querySelectorAll('.card-rediger');
    ikoner.forEach(ikon => {
        ikon.removeEventListener('click', handleRedigerKlikk);
        ikon.addEventListener('click', handleRedigerKlikk);
    });
}

// Håndterer klikk på rediger-ikon
function handleRedigerKlikk(e) {
    e.stopPropagation();
    
    const ikon = e.currentTarget;
    const medlemId = ikon.dataset.medlemId;
    const fornavn = ikon.dataset.medlemFornavn;
    const etternavn = ikon.dataset.medlemEtternavn;
    const startDato = ikon.dataset.startDato;
    const sluttDato = ikon.dataset.sluttDato;
    
    // Velg medlem (setter selectedMemberForPass)
    selectMemberById(medlemId, fornavn, etternavn, startDato, sluttDato);
}
// Velger medlem og fyller skjema med eksisterende periodekort-data
async function selectMemberById(medlemId, fornavn, etternavn, startDato, sluttDato) {
    // Sett selectedMemberForPass
    selectedMemberForPass = { id: medlemId, fornavn, etternavn };
    
    // Fyll navn i skjema
    document.getElementById('m-fornavn').value = fornavn;
    document.getElementById('m-etternavn').value = etternavn;
    
    // Hent siste periodekort for å foreslå datoer
    const { data: passes } = await sb
        .from('periodekort')
        .select('start_dato, slutt_dato')
        .eq('medlem_id', medlemId)
        .order('slutt_dato', { ascending: false })
        .limit(1);
    
    if (passes && passes.length > 0) {
        latestPassForMember = passes[0];
        suggestDates();
    } else {
        // Ingen eksisterende kort – bruk dagens dato + 30 dager
        const today = getTodayLocal();
        document.getElementById('m-start').value = today;
        document.getElementById('m-slutt').value = addDaysLocal(today, 30);
    }
    
    // Fjern eventuell søkeboble
    removeSearchBubble();
    
    // Rull skjemaet synlig
    const sidebar = document.querySelector('.member-sidebar');
    if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Validerer mobilnummer (8 siffer, kun tall)
function validerMobil(mobil) {
    if (!mobil) return false;
    const mobilStr = String(mobil).trim();
    return /^\d{8}$/.test(mobilStr);
}

// Validerer e-post (må inneholde @ og . etter @, eller være tom)
function validerEpost(epost) {
    if (!epost || epost.trim() === '') return true;
    const epostStr = epost.trim();
    const atPos = epostStr.indexOf('@');
    if (atPos === -1) return false;
    const dotPos = epostStr.lastIndexOf('.');
    if (dotPos <= atPos + 1) return false;
    return true;
}
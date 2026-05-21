// members.js - Håndterer periodekort og medlemsliste
// Dato-hjelpere (getTodayLocal, parseLocalDate, addDaysLocal, formatDateForDisplay) bor i app.js.

// --- GLOBALE VARIABLER ---
let selectedMemberForPass = null;
let latestPassForMember = null;

// --- INITIALISERING ---
async function updateMemberModule() {
    console.log("Oppdaterer medlemsmodulen...");
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
                <span class="search-bubble-phone">📱 ${member.tlf_mobil || 'Ingen telefon'}</span>
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
    
    // Sjekk først om medlem finnes
    const exists = await checkMemberExists(fornavn, etternavn);
    if (exists) {
        visBekreftelse(
            "ADVARSEL",
            `${fornavn} ${etternavn} finnes allerede i systemet. Vil du likevel opprette?`,
            "⚠️",
            async () => {
                // Ja - fortsett med registrering
                await fortsettRegistrering(fornavn, etternavn, startDato, sluttDato, today);
            },
            () => {
                // Nei - bare lukk bekreftelse, behold modalen åpen
                return;
            }
        );
        return;
    }
    
    // Håndter auto-fyll logikk
    await handterAutoFyllOgRegistrer(fornavn, etternavn, startDato, sluttDato, today);
}

async function handterAutoFyllOgRegistrer(fornavn, etternavn, startDato, sluttDato, today) {
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
                await fortsettRegistrering(fornavn, etternavn, startDato, nySluttDato, today);
            },
            () => {
                // Nei - behold modalen åpen, la bruker fylle ut manuelt
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
                await fortsettRegistrering(fornavn, etternavn, nyStartDato, sluttDato, today);
            },
            () => {
                // Nei - behold modalen åpen
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
                await fortsettRegistrering(fornavn, etternavn, null, null, today);
            },
            () => {
                // Nei - behold modalen åpen
                return;
            }
        );
        return;
    }
    
    // Begge datoer er fylt ut - ingen auto-fyll nødvendig
    await fortsettRegistrering(fornavn, etternavn, startDato, sluttDato, today);
}

async function fortsettRegistrering(fornavn, etternavn, startDato, sluttDato, today) {
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
        // Opprett medlem
        const { data: newMember, error: memberError } = await sb
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
            startDate = startExists;
            endDate = endExists;
        } 
        else if (startExists < today) {
            startDate = today;
            endDate = addDaysLocal(today, 30);
        }
        
        if (endExists >= today) {
            const newStart = addDaysLocal(endExists, 1);
            startDate = newStart;
            endDate = addDaysLocal(newStart, 30);
        }
    }
    
    if (startDate) document.getElementById('m-start').value = startDate;
    if (endDate) document.getElementById('m-slutt').value = endDate;
}

// --- OVERLAPPSSJEKK ---
async function validateOverlap(memberId, startDate) {
    const { data: passes } = await sb
        .from('periodekort')
        .select('slutt_dato')
        .eq('medlem_id', memberId)
        .order('slutt_dato', { ascending: false })
        .limit(1);
    
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
        const { data, error } = await sb
            .from('periodekort')
            .select(`
                slutt_dato,
                medlem_id,
                medlemmer (
                    fornavn,
                    etternavn
                )
            `)
            .gte('slutt_dato', today);

        if (error) throw error;

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Ingen aktive periodekort funnet</td></tr>';
            return;
        }

        const uniqueMembers = {};
        data.forEach(row => {
            const id = row.medlem_id;
            if (!uniqueMembers[id] || row.slutt_dato > uniqueMembers[id].slutt_dato) {
                uniqueMembers[id] = row;
            }
        });

        const sortedList = Object.values(uniqueMembers).sort((a, b) => 
            a.slutt_dato.localeCompare(b.slutt_dato)
        );

        renderMemberTable(sortedList);

    } catch (err) {
        console.error("Feil ved henting av periodekort:", err);
    }
}

function renderMemberTable(members) {
    const tableBody = document.getElementById('member-table-body');
    const today = getTodayLocal();

    tableBody.innerHTML = '';

    members.forEach(m => {
        const sluttDato = m.slutt_dato;
        
        const todayDate = parseLocalDate(today);
        const endDate = parseLocalDate(sluttDato);
        const diffTime = endDate - todayDate;
        const dagerIgjen = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let dagerTekst = "";
        let stil = "";

        if (dagerIgjen === 0) {
            dagerTekst = "Utløper i dag";
            stil = "font-weight: bold; color: black;";
        } else if (dagerIgjen < 7 && dagerIgjen > 0) {
            dagerTekst = `${dagerIgjen} dager`;
            stil = "font-weight: bold; color: black;";
        } else if (dagerIgjen < 0) {
            dagerTekst = "Utløpt";
            stil = "font-weight: bold; color: var(--advarsel);";
        } else {
            dagerTekst = `${dagerIgjen} dager`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(m.medlemmer.fornavn)}</td>
            <td>${escapeHtml(m.medlemmer.etternavn)}</td>
            <td>${formatDateForDisplay(sluttDato)}</td>
            <td style="${stil}">${dagerTekst}</td>
        `;
        tableBody.appendChild(tr);
    });

    const countLabel = document.querySelector('.member-count');
    if (countLabel) countLabel.innerText = `Aktive kort: ${members.length}`;
}

// Initialiser ved lasting
window.addEventListener('load', () => {
    setTimeout(() => {
        attachEventListeners();
    }, 500);
});
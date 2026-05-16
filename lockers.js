// lockers.js - Håndterer skaputleie

// --- GLOBALE VARIABLER ---
let currentLockerNumber = null;
let currentLockerData = null;
let selectedLockerMember = null;
let lockerSearchTimeout = null;

// --- HENT SKAPDATA ---
async function fetchLockers() {
    const { data, error } = await sb.from('skapleie').select('*');
    if (!error && data) {
        window.lockersData = data;
        renderLockerGrid(data);
    } else if (error) {
        console.error("Feil ved henting av skap:", error);
    }
}

function renderLockerGrid(lockers) {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    
    const today = getTodayLocal();
    
    const lockersMap = {};
    lockers.forEach(l => { lockersMap[l.skap_nummer] = l; });
    
    let html = '';
    for (let i = 1; i <= 100; i++) {
        const locker = lockersMap[i];
        let statusClass = 'locker-box';
        
        if (locker && locker.status === 'Opptatt') {
            if (locker.til_dato && locker.til_dato < today) {
                statusClass += ' warning';
            } else {
                statusClass += ' occupied';
            }
        } else {
            statusClass += ' free';
        }
        
        html += `<div class="${statusClass}" data-skap="${i}" onclick="selectLocker(${i})">${i}</div>`;
    }
    grid.innerHTML = html;
}

// --- VELG SKAP ---
async function selectLocker(skapNummer) {
    currentLockerNumber = skapNummer;
    
    const { data } = await sb
        .from('skapleie')
        .select('*, medlemmer(id, fornavn, etternavn, tlf_mobil)')
        .eq('skap_nummer', skapNummer)
        .single();
    
    currentLockerData = data;
    
    const panel = document.getElementById('skap-panel');
    const skapNumberSpan = document.getElementById('skap-number');
    const currentLeaseDiv = document.getElementById('skap-current-lease');
    const tenantNameInput = document.getElementById('skap-tenant-name');
    const startInput = document.getElementById('skap-start');
    const endInput = document.getElementById('skap-end');
    const noteInput = document.getElementById('skap-note');
    const saveBtn = document.getElementById('skap-save-btn');
    const renewBtn = document.getElementById('skap-renew-btn');
    const releaseBtn = document.getElementById('skap-release-btn');
    
    skapNumberSpan.innerText = skapNummer;
    panel.style.display = 'block';
    
    const today = getTodayLocal();
    const oneYearLater = addDaysLocal(today, 365);
    
    if (data && data.status === 'Opptatt') {
        // Skap er opptatt
        currentLeaseDiv.style.display = 'block';
        document.getElementById('skap-current-tenant').innerHTML = `${data.medlemmer?.fornavn || ''} ${data.medlemmer?.etternavn || ''} (📱 ${data.medlemmer?.tlf_mobil || 'Ingen'})`;
        document.getElementById('skap-current-period').innerHTML = `${formatDateForDisplay(data.fra_dato)} - ${formatDateForDisplay(data.til_dato)}`;
        
        tenantNameInput.value = `${data.medlemmer?.fornavn || ''} ${data.medlemmer?.etternavn || ''}`;
        selectedLockerMember = data.medlemmer;
        
        // Fyll skjema med eksisterende datoer for forlengelse
        startInput.value = data.fra_dato;
        endInput.value = data.til_dato;
        noteInput.value = data.notater || '';
        
        saveBtn.style.display = 'none';
        renewBtn.style.display = 'block';
        releaseBtn.style.display = 'block';
    } else {
        // Skap er ledig
        currentLeaseDiv.style.display = 'none';
        tenantNameInput.value = '';
        selectedLockerMember = null;
        
        startInput.value = today;
        endInput.value = oneYearLater;
        noteInput.value = '';
        
        saveBtn.style.display = 'block';
        renewBtn.style.display = 'none';
        releaseBtn.style.display = 'none';
    }
    
    // Fjern markering fra alle skap
    document.querySelectorAll('.locker-box').forEach(b => b.classList.remove('selected'));
    const selectedBox = document.querySelector(`.locker-box[data-skap="${skapNummer}"]`);
    if (selectedBox) selectedBox.classList.add('selected');
}

// --- SØK FUNKSJON ---
window.handleLockerSearch = function(e) {
    const query = e.target.value.trim();
    removeLockerSearchBubble();
    
    if (query.length >= 3) {
        if (lockerSearchTimeout) clearTimeout(lockerSearchTimeout);
        lockerSearchTimeout = setTimeout(() => searchLockerMembers(query), 300);
    }
};

async function searchLockerMembers(query) {
    try {
        const { data: members, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil')
            .or(`fornavn.ilike.%${query}%,etternavn.ilike.%${query}%,tlf_mobil.ilike.%${query}%`)
            .limit(10);
        
        if (error) throw error;
        
        if (!members || members.length === 0) {
            showNoLockerResultsBubble();
            return;
        }
        
        renderLockerSearchBubble(members);
        
    } catch (err) {
        console.error("Søkefeil:", err);
    }
}

function renderLockerSearchBubble(members) {
    removeLockerSearchBubble();
    
    const searchWrapper = document.querySelector('#mod-skap .search-wrapper');
    if (!searchWrapper) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'search-bubble';
    
    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'search-bubble-item';
        
        item.innerHTML = `
            <div>
                <span class="search-bubble-name">${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)}</span>
                <span class="search-bubble-phone">📱 ${member.tlf_mobil || 'Ingen telefon'}</span>
            </div>
        `;
        
        item.addEventListener('click', () => selectLockerMember(member));
        bubble.appendChild(item);
    });
    
    searchWrapper.appendChild(bubble);
}

function showNoLockerResultsBubble() {
    removeLockerSearchBubble();
    const searchWrapper = document.querySelector('#mod-skap .search-wrapper');
    if (!searchWrapper) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'search-bubble';
    bubble.innerHTML = `
        <div class="search-bubble-item" style="text-align: center;">
            <div style="margin-bottom: 10px;">😕 Ingen medlemmer funnet</div>
            <button class="search-bubble-btn" id="skap-register-member-btn">➕ Registrer nytt medlem</button>
        </div>
    `;
    searchWrapper.appendChild(bubble);
    
    const registerBtn = document.getElementById('skap-register-member-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            openNewMemberModalForSkap((newMember) => {
                selectLockerMember(newMember);
            });
        });
    }
}

function removeLockerSearchBubble() {
    const existing = document.querySelector('#mod-skap .search-bubble');
    if (existing) existing.remove();
}

function selectLockerMember(member) {
    selectedLockerMember = member;
    
    const tenantNameInput = document.getElementById('skap-tenant-name');
    const selectedDiv = document.getElementById('skap-selected-member');
    const selectedNameSpan = document.getElementById('skap-selected-name');
    
    tenantNameInput.value = `${member.fornavn} ${member.etternavn}`;
    selectedNameSpan.innerHTML = `${member.fornavn} ${member.etternavn} (📱 ${member.tlf_mobil || 'Ingen'})`;
    selectedDiv.style.display = 'block';
    
    removeLockerSearchBubble();
    document.getElementById('skap-search').value = '';
}

window.clearSelectedLockerMember = function() {
    selectedLockerMember = null;
    document.getElementById('skap-tenant-name').value = '';
    document.getElementById('skap-selected-member').style.display = 'none';
    document.getElementById('skap-search').value = '';
    document.getElementById('skap-search').focus();
};

// --- OVERLAPPSSJEKK (bruker skap_nummer, ikke id) ---
async function checkLockerOverlap(skapNummer, fraDato, tilDato, excludeSkapNummer = null) {
    const { data, error } = await sb
        .from('skapleie')
        .select('*')
        .eq('skap_nummer', skapNummer)
        .eq('status', 'Opptatt');
    
    if (error || !data || data.length === 0) return true;
    
    for (const lease of data) {
        // Ekskluder den nåværende leien hvis vi forlenger
        if (excludeSkapNummer && lease.skap_nummer === excludeSkapNummer) continue;
        
        if (fraDato <= lease.til_dato && tilDato >= lease.fra_dato) {
            visBeskjed("ADVARSEL", `Skap ${skapNummer} er allerede opptatt i perioden ${formatDateForDisplay(lease.fra_dato)} - ${formatDateForDisplay(lease.til_dato)}`, "error");
            return false;
        }
    }
    return true;
}

// --- LAGRE UTLEIE ---
window.saveLockerLease = async function() {
    if (!currentLockerNumber) {
        visBeskjed("FEIL", "Velg et skap først", "error");
        return;
    }
    
    if (!selectedLockerMember) {
        visBeskjed("ADVARSEL", "Du må søke opp og velge en leietager", "error");
        return;
    }
    
    let fraDato = document.getElementById('skap-start').value;
    let tilDato = document.getElementById('skap-end').value;
    const note = document.getElementById('skap-note').value;
    const today = getTodayLocal();
    
    if (!fraDato) fraDato = today;
    if (!tilDato) tilDato = addDaysLocal(today, 365);
    
    if (fraDato > tilDato) {
        visBeskjed("FEIL", "Fra-dato må være før eller lik til-dato", "error");
        return;
    }
    
    const noOverlap = await checkLockerOverlap(currentLockerNumber, fraDato, tilDato);
    if (!noOverlap) return;
    
    try {
        // Sjekk om skapet allerede finnes i databasen
        const { data: existingLocker } = await sb
            .from('skapleie')
            .select('skap_nummer')
            .eq('skap_nummer', currentLockerNumber)
            .single();
        
        if (existingLocker) {
            // Skapet finnes - bruk UPDATE
            const { error } = await sb
                .from('skapleie')
                .update({
                    status: 'Opptatt',
                    medlem_id: selectedLockerMember.id,
                    fra_dato: fraDato,
                    til_dato: tilDato,
                    notater: note,
                    oppdatert_at: new Date().toISOString()
                })
                .eq('skap_nummer', currentLockerNumber);
            
            if (error) throw error;
        } else {
            // Skapet finnes ikke - bruk INSERT
            const { error } = await sb
                .from('skapleie')
                .insert({
                    skap_nummer: currentLockerNumber,
                    status: 'Opptatt',
                    medlem_id: selectedLockerMember.id,
                    fra_dato: fraDato,
                    til_dato: tilDato,
                    notater: note,
                    oppdatert_at: new Date().toISOString()
                });
            
            if (error) throw error;
        }
        
        visBeskjed("SUKSESS", `Skap ${currentLockerNumber} er nå utleid til ${selectedLockerMember.fornavn} ${selectedLockerMember.etternavn}`, "success");
        
        clearLockerForm();
        await fetchLockers();
        await fetchExpiringLockers();
        
        document.getElementById('skap-panel').style.display = 'none';
        
    } catch (err) {
        console.error("Feil ved utleie:", err);
        visBeskjed("FEIL", "Kunne ikke lagre utleie. Prøv igjen.", "error");
    }
};

// --- FORLENG LEIE ---
window.renewLease = async function() {
    if (!currentLockerData) {
        visBeskjed("FEIL", "Kunne ikke finne nåværende leie", "error");
        return;
    }
    
    let nyTilDato = document.getElementById('skap-end').value;
    const opprinneligStartDato = currentLockerData.fra_dato;
    
    if (!nyTilDato) {
        nyTilDato = addDaysLocal(getTodayLocal(), 365);
    }
    
    if (nyTilDato <= currentLockerData.til_dato) {
        visBeskjed("ADVARSEL", `Ny sluttdato må være etter nåværende sluttdato (${formatDateForDisplay(currentLockerData.til_dato)})`, "error");
        return;
    }
    
    // Sjekk overlapp, ekskluder nåværende skap
    const noOverlap = await checkLockerOverlap(currentLockerNumber, opprinneligStartDato, nyTilDato, currentLockerNumber);
    if (!noOverlap) return;
    
    try {
        const { error } = await sb
            .from('skapleie')
            .update({
                til_dato: nyTilDato,
                oppdatert_at: new Date().toISOString()
            })
            .eq('skap_nummer', currentLockerNumber);
        
        if (error) throw error;
        
        visBeskjed("SUKSESS", `Skap ${currentLockerNumber} er forlenget til ${formatDateForDisplay(nyTilDato)}`, "success");
        
        await fetchLockers();
        await fetchExpiringLockers();
        
        // Oppdater panel med nye data
        await selectLocker(currentLockerNumber);
        
    } catch (err) {
        console.error("Feil ved forlengelse:", err);
        visBeskjed("FEIL", "Kunne ikke forlenge leie. Prøv igjen.", "error");
    }
};

// --- FRIGJØR SKAP ---
window.releaseLocker = async function() {
    if (!currentLockerNumber) {
        visBeskjed("FEIL", "Kunne ikke finne skapnummer", "error");
        return;
    }
    
    try {
        const { error } = await sb
            .from('skapleie')
            .update({
                status: 'Ledig',
                medlem_id: null,
                fra_dato: null,
                til_dato: null,
                notater: null,
                oppdatert_at: new Date().toISOString()
            })
            .eq('skap_nummer', currentLockerNumber);
        
        if (error) throw error;
        
        visBeskjed("SUKSESS", `Skap ${currentLockerNumber} er frigjort`, "success");
        
        clearLockerForm();
        await fetchLockers();
        await fetchExpiringLockers();
        
        document.getElementById('skap-panel').style.display = 'none';
        
    } catch (err) {
        console.error("Feil ved frigjøring:", err);
        visBeskjed("FEIL", "Kunne ikke frigjøre skap. Prøv igjen.", "error");
    }
};

// --- LISTE OVER UTLØPENDE SKAP ---
async function fetchExpiringLockers() {
    const container = document.getElementById('skap-expiring-body');
    if (!container) return;
    
    const today = getTodayLocal();
    const fourteenDaysLater = addDaysLocal(today, 14);
    
    try {
        const { data, error } = await sb
            .from('skapleie')
            .select('*, medlemmer(id, fornavn, etternavn, tlf_mobil)')
            .eq('status', 'Opptatt')
            .order('til_dato', { ascending: true });
        
        if (error) throw error;
        
        const expiring = data.filter(lease => lease.til_dato <= fourteenDaysLater);
        
        if (expiring.length === 0) {
            container.innerHTML = '<p style="color: var(--tekst-lys); text-align: center;">✅ Ingen skap utløper i løpet av 14 dager</p>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        
        expiring.forEach(lease => {
            const daysLeft = Math.ceil((parseLocalDate(lease.til_dato) - parseLocalDate(today)) / (1000 * 60 * 60 * 24));
            const isExpired = daysLeft < 0;
            const name = lease.medlemmer ? `${lease.medlemmer.fornavn} ${lease.medlemmer.etternavn}` : 'Ukjent';
            
            html += `
                <div style="padding: 10px; background: ${isExpired ? '#fee' : '#fff3cd'}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>🎱 Skap ${lease.skap_nummer}</strong><br>
                        <span style="font-size: 13px;">👤 ${escapeHtml(name)}</span><br>
                        <span style="font-size: 12px; color: #666;">Utløper: ${formatDateForDisplay(lease.til_dato)}</span>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-weight: bold; color: ${isExpired ? 'var(--advarsel)' : '#856404'};">
                            ${isExpired ? 'UTLØPT' : `${daysLeft} dager igjen`}
                        </span>
                        <button class="btn" style="background: var(--marine); padding: 5px 10px; font-size: 11px; margin-top: 5px;" onclick="selectLocker(${lease.skap_nummer})">Vis skap</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (err) {
        console.error("Feil ved henting av utløpende skap:", err);
        container.innerHTML = '<p style="color: var(--advarsel); text-align: center;">❌ Kunne ikke laste liste</p>';
    }
}

// --- GENERER PDF OVER UTLØPENDE SKAP ---
// --- GENERER PDF OVER UTLØPENDE SKAP ---
window.generateExpiryPDF = async function() {
    try {
        const today = getTodayLocal();
        const thirtyDaysLater = addDaysLocal(today, 30);
        
        const { data, error } = await sb
            .from('skapleie')
            .select('*, medlemmer(id, fornavn, etternavn, tlf_mobil)')
            .eq('status', 'Opptatt')
            .lte('til_dato', thirtyDaysLater)
            .order('til_dato', { ascending: true });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            visBeskjed("INFO", "Ingen skap utløper i løpet av de neste 30 dagene", "success");
            return;
        }
        
        // Spør brukeren først
        visBekreftelse(
            "BEKREFTELSE",
            `Vil du generere PDF med utløpsliste for ${data.length} skap?`,
             "🖨️",
            () => {
                // JA - generer PDF
                genererPDF(data, today);
            },
            () => {
                // NEI - gjør ingenting
                visBeskjed("AVBRUTT", "PDF-generering avbrutt", "success");
            }
        );
        
    } catch (err) {
        console.error("Feil ved PDF-generering:", err);
        visBeskjed("FEIL", "Kunne ikke generere PDF. Prøv igjen.", "error");
    }
};

// Hjelpefunksjon for å generere PDF
function genererPDF(data, today) {
    let tableRows = '';
    data.forEach(lease => {
        const name = lease.medlemmer ? `${lease.medlemmer.fornavn} ${lease.medlemmer.etternavn}` : 'Ukjent';
        const phone = lease.medlemmer?.tlf_mobil || 'Ikke registrert';
        const isExpired = lease.til_dato < today;
        const statusText = isExpired ? 'UTLØPT' : 'Utløper snart';
        
        tableRows += `
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${lease.skap_nummer}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(name)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${phone}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${formatDateForDisplay(lease.fra_dato)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${formatDateForDisplay(lease.til_dato)}</td>
                <td style="border: 1px solid #ddd; padding: 8px; color: ${isExpired ? '#e74c3c' : '#e67e22'}; font-weight: bold;">${statusText}</td>
            </tr>
        `;
    });
    
    const totalHtml = `
        <html>
        <head>
            <title>OBK - Utløpsliste skap</title>
            <meta charset="UTF-8">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 40px;">
            <h1 style="color: #1a2f3c; border-bottom: 2px solid #c9a84c; padding-bottom: 10px;">🎱 Oslo Biljardklubb</h1>
            <h2 style="color: #1a2f3c;">Utløpsliste skap - 30 dager frem</h2>
            <p>Dato: ${formatDateForDisplay(today)}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #1a2f3c; color: white;">
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Skap nr.</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Leietager</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Mobil</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Fra dato</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Til dato</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div style="margin-top: 40px; font-size: 12px; color: #666; text-align: center;">
                Rapporten er generert automatisk av OBK Administrasjonssystem.
            </div>
        </body>
        </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(totalHtml);
    printWindow.document.close();
    printWindow.print();
};

// --- HJELPEFUNKSJONER ---
function clearLockerForm() {
    currentLockerNumber = null;
    currentLockerData = null;
    selectedLockerMember = null;
    
    document.getElementById('skap-search').value = '';
    document.getElementById('skap-tenant-name').value = '';
    document.getElementById('skap-selected-member').style.display = 'none';
    document.getElementById('skap-start').value = '';
    document.getElementById('skap-end').value = '';
    document.getElementById('skap-note').value = '';
    
    removeLockerSearchBubble();
}

function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDaysLocal(dateStr, days) {
    const date = parseLocalDate(dateStr);
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function formatDateForDisplay(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// --- LAST INN SKAP ---
window.loadLockers = async function() {
    await fetchLockers();
    await fetchExpiringLockers();
};

// --- ATTACH EVENTS ---
window.attachLockerEvents = function() {
    const searchInput = document.getElementById('skap-search');
    if (searchInput) {
        searchInput.removeEventListener('input', window.handleLockerSearch);
        searchInput.addEventListener('input', window.handleLockerSearch);
    }
};

// Initialiser
window.addEventListener('load', () => {
    setTimeout(() => {
        window.attachLockerEvents();
    }, 500);
});
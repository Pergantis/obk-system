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
    removeLockerSearchBubble();
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
        // escapeHtml på alt som kommer fra DB — medlemsnavn er fri tekst og
        // kan inneholde <, > eller " som ellers tolkes som markup i innerHTML.
        document.getElementById('skap-current-tenant').innerHTML = `${escapeHtml(data.medlemmer?.fornavn)} ${escapeHtml(data.medlemmer?.etternavn)} (📱 ${escapeHtml(data.medlemmer?.tlf_mobil || 'Ingen')})`;
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
        const safe = sanitizeSearchQuery(query);
        // Unngå "match alle" hvis input består av bare strippede spesialtegn
        if (!safe) return;
        // Hent medlemmer som matcher søket. er_aktiv-filter for å skjule
        // soft-slettede medlemmer (jf. maintenance.js adminSlettMedlem som
        // setter er_aktiv = false i stedet for å slette raden).
        const { data: members, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil')
            .or(`fornavn.ilike.%${safe}%,etternavn.ilike.%${safe}%,tlf_mobil.ilike.%${safe}%`)
            .eq('er_aktiv', true)
            .limit(10);
        
        if (error) throw error;
        
        if (!members || members.length === 0) {
            visIngenMedlemModal();  // Ny funksjon
            return;
        }
        
        // Hent skap for disse medlemmene
        const memberIds = members.map(m => m.id);
        const { data: lockers, error: lockerError } = await sb
            .from('skapleie')
            .select('skap_nummer, til_dato, status, medlem_id')
            .in('medlem_id', memberIds)
            .eq('status', 'Opptatt');
        
        if (lockerError) throw lockerError;
        
        // Bygg et map: medlem_id -> liste over skap
        const memberLockers = {};
        (lockers || []).forEach(locker => {
            if (!memberLockers[locker.medlem_id]) {
                memberLockers[locker.medlem_id] = [];
            }
            memberLockers[locker.medlem_id].push(locker);
        });
        
        renderLockerSearchBubble(members, memberLockers);
        
    } catch (err) {
        console.error("Søkefeil:", err);
    }
}
function renderLockerSearchBubble(members, memberLockers) {
    removeLockerSearchBubble();
    
    const inputEl = document.getElementById('skap-search');
    if (!inputEl) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'search-bubble';
    
    const today = getTodayLocal();
    
    members.forEach(member => {
        const lockers = memberLockers[member.id] || [];
        
        // Medlem container
        const memberDiv = document.createElement('div');
        memberDiv.className = 'search-bubble-member';
        
        // Medlem info (klikkbart)
        const memberInfo = document.createElement('div');
        memberInfo.className = 'search-bubble-member-info';
        memberInfo.innerHTML = `
            <span class="search-bubble-name">${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)}</span>
            <span class="search-bubble-phone">📱 ${escapeHtml(member.tlf_mobil || 'Ingen telefon')}</span>
        `;
        memberInfo.addEventListener('click', () => selectLockerMember(member));
        memberDiv.appendChild(memberInfo);
        
        // Skap liste (hvis medlem har skap)
        if (lockers.length > 0) {
            const skapListe = document.createElement('div');
            skapListe.className = 'search-bubble-skap-list';
            
            lockers.forEach(locker => {
                const isExpired = locker.til_dato && locker.til_dato < today;
                const daysLeft = locker.til_dato ? Math.ceil((parseLocalDate(locker.til_dato) - parseLocalDate(today)) / (1000 * 60 * 60 * 24)) : 0;
                
                const skapItem = document.createElement('div');
                skapItem.className = 'search-bubble-skap-item';
                skapItem.innerHTML = `
                    🎱 <strong>Skap ${locker.skap_nummer}</strong>
                    <span style="font-size: 11px; ${isExpired ? 'color: var(--advarsel);' : 'color: #666;'}">
                        ${isExpired ? 'UTLØPT' : `Utløper: ${formatDateForDisplay(locker.til_dato)} (${daysLeft} dager)`}
                    </span>
                `;
                skapItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                     removeLockerSearchBubble(); 
                    selectLocker(locker.skap_nummer);
                });
                skapListe.appendChild(skapItem);
            });
            
            memberDiv.appendChild(skapListe);
        } else {
            // Ingen skap - vis melding
            const ingenSkap = document.createElement('div');
            ingenSkap.className = 'search-bubble-ingen-skap';
            ingenSkap.innerHTML = `<span style="font-size: 11px; color: #999;">📍 Ingen skap leid</span>`;
            memberDiv.appendChild(ingenSkap);
        }
        
        bubble.appendChild(memberDiv);
    });
    
    // Posisjoner boblen
    const rect = inputEl.getBoundingClientRect();
    bubble.style.position = 'fixed';
    bubble.style.top = (rect.bottom + 5) + 'px';
    bubble.style.left = rect.left + 'px';
    bubble.style.width = rect.width + 'px';
    bubble.style.maxHeight = '400px';
    bubble.style.overflowY = 'auto';
    bubble.style.zIndex = '10000';
    
    document.body.appendChild(bubble);
    
    // Lukk boble ved klikk utenfor
    setTimeout(() => {
        document.addEventListener('click', function closeBubble(e) {
            if (!bubble.contains(e.target) && e.target !== inputEl) {
                bubble.remove();
                document.removeEventListener('click', closeBubble);
            }
        });
    }, 100);
}

function removeLockerSearchBubble() {
    // Fjern fra #mod-skap (gammel plassering)
    const existingInMod = document.querySelector('#mod-skap .search-bubble');
    if (existingInMod) existingInMod.remove();
    
    // Fjern fra document.body (ny plassering med fixed position)
    const existingInBody = document.body.querySelector('.search-bubble');
    if (existingInBody) existingInBody.remove();
}

function selectLockerMember(member) {
    removeLockerSearchBubble();
    selectedLockerMember = member;
    
    const tenantNameInput = document.getElementById('skap-tenant-name');
    const selectedDiv = document.getElementById('skap-selected-member');
    const selectedNameSpan = document.getElementById('skap-selected-name');
    
    tenantNameInput.value = `${member.fornavn} ${member.etternavn}`;
    // escapeHtml fordi navn/mobil interpoleres inn i innerHTML.
    selectedNameSpan.innerHTML = `${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)} (📱 ${escapeHtml(member.tlf_mobil || 'Ingen')})`;
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

    // Fail-closed: hvis vi ikke kan verifisere mot DB skal vi IKKE tillate overskriving
    if (error) {
        console.error("Feil ved overlapssjekk for skap:", error);
        visBeskjed("FEIL", "Kunne ikke sjekke om skapet er ledig: " + error.message, "error");
        return false;
    }

    if (!data || data.length === 0) return true;

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
        // Sjekk om skapet allerede finnes i databasen.
        // maybeSingle() returnerer data=null + error=null når raden ikke finnes;
        // andre feil (RLS, nett, timeout) får vi som error og må behandle eksplisitt
        // — ellers ender vi i INSERT-grenen og treffer unique constraint.
        const { data: existingLocker, error: lookupError } = await sb
            .from('skapleie')
            .select('skap_nummer')
            .eq('skap_nummer', currentLockerNumber)
            .maybeSingle();

        if (lookupError) throw lookupError;

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

// Genererer og laster ned PDF via jsPDF + autotable. Erstatter den gamle
// window.open + print()-løsningen som ble blokkert av popup-blockere.
function genererPDF(data, today) {
    if (!window.jspdf?.jsPDF) {
        visBeskjed("FEIL", "PDF-biblioteket er ikke lastet. Last siden på nytt og prøv igjen.", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    if (typeof doc.autoTable !== 'function') {
        visBeskjed("FEIL", "PDF-tabell-pluginet er ikke lastet. Last siden på nytt og prøv igjen.", "error");
        return;
    }

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 47, 60); // marine
    doc.text('Oslo Biljardklubb', 14, 18);

    doc.setDrawColor(201, 168, 76); // gull
    doc.setLineWidth(0.8);
    doc.line(14, 21, 196, 21);

    doc.setFontSize(13);
    doc.text('Utløpsliste skap — 30 dager frem', 14, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Dato: ${formatDateForDisplay(today)}`, 14, 37);

    // Tabell. Strip kontrolltegn (TAB, CR, LF, m.fl.) fra navn/mobil før de
    // sendes til autoTable — ellers kan en innlimt newline i et navn bryte
    // radhøyder eller bytte linje midt i en celle.
    const stripCtrl = s => String(s ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    const rows = data.map(lease => {
        const name = lease.medlemmer
            ? stripCtrl(`${lease.medlemmer.fornavn} ${lease.medlemmer.etternavn}`)
            : 'Ukjent';
        const phone = stripCtrl(lease.medlemmer?.tlf_mobil) || 'Ikke registrert';
        const isExpired = lease.til_dato < today;
        return [
            String(lease.skap_nummer),
            name,
            phone,
            formatDateForDisplay(lease.fra_dato),
            formatDateForDisplay(lease.til_dato),
            isExpired ? 'UTLØPT' : 'Utløper snart'
        ];
    });

    doc.autoTable({
        startY: 42,
        head: [['Skap nr.', 'Leietager', 'Mobil', 'Fra dato', 'Til dato', 'Status']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [26, 47, 60], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { halign: 'center' }, 5: { fontStyle: 'bold' } },
        didParseCell: (hookData) => {
            // Farg status-kolonnen rød for UTLØPT, oransje for "Utløper snart"
            if (hookData.section === 'body' && hookData.column.index === 5) {
                hookData.cell.styles.textColor = hookData.cell.raw === 'UTLØPT'
                    ? [231, 76, 60]   // advarsel-rød
                    : [230, 126, 34]; // oransje
            }
        }
    });

    // Footer
    const finalY = doc.lastAutoTable.finalY || 42;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Rapporten er generert automatisk av OBK Administrasjonssystem.', 14, finalY + 12);

    // Filnavn: obk-skap-utlopsliste-YYYY-MM-DD.pdf
    doc.save(`obk-skap-utlopsliste-${today}.pdf`);
}

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

// Dato-hjelpere (getTodayLocal, addDaysLocal, parseLocalDate, formatDateForDisplay) bor i app.js.

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
// Viser modal når ingen medlemmer finnes i søket
function visIngenMedlemModal() {
    const searchInput = document.getElementById('skap-search');
    if (searchInput) searchInput.value = '';
    
    visBekreftelse(
        "📋 MEDLEM IKKE FUNNET",
        `Fant ingen medlemmer med dette søket.\n\nNye medlemmer må registreres i KONTROLLPANELET før de kan leie skap.\nDer fyller du ut navn, mobil (påkrevd) og e-post (valgfritt).\n\nNår medlemmet er opprettet, kommer du tilbake hit og søker opp medlemmet.`,
        "🔍",
        () => {
            showModule('admin');
        },
        () => {
            console.log('Avbrutt - søkefelt tømt');
        },
        "⚙️ TIL KONTROLLPANEL",  // ← NY: Ja-knapp tekst
        "✖️ AVBRYT"              // ← NY: Nei-knapp tekst
    );
}
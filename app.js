window.sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

function showModule(id) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // Fjern bobler kun fra den modulen som skjules
    document.querySelectorAll('.module').forEach(module => {
        if (!module.classList.contains('active')) {
            const bobler = module.querySelectorAll('.search-bubble');
            bobler.forEach(b => b.remove());
        }
    });

    // Stopp modul-spesifikke timere før vi bytter modul.
    if (typeof stopBordPolling === 'function') stopBordPolling();

    document.getElementById('mod-' + id).classList.add('active');
    document.getElementById('btn-' + id).classList.add('active');

    // Spesifikke lastinger per modul. Start polling FØR loadTables() så
    // timeren er garantert satt opp uansett hva som skjer i load-kallet.
    if (id === 'bord') {
        startBordPolling();
        loadTables();
    }
    if (id === 'medlem') updateMemberModule();
    if (id === 'skap') loadLockers();
    if (id === 'turnering') initTurnering();
    if (id === 'vaktplan') initVaktplan();
    if (id === 'admin') initAdminPanel();
}

function showLoader(show) { document.getElementById('sync-loader').style.display = show ? 'block' : 'none'; }
function showError(msg) { const el = document.getElementById('error-log'); el.innerText = msg; el.style.display = 'block'; }

// Fjerner tegn som kan bryte PostgREST-filter eller utvide ilike-wildcard.
// Brukes på fritekst-input før den interpoleres inn i .or()/.ilike()-filter.
// NB: apostrof ' og bindestrek - er bevisst IKKE i strippe-settet — de finnes i
// legitime navn (O'Brien, Anne-Marie). Supabase-klienten URL-encoder dem.
function sanitizeSearchQuery(query) {
    if (!query) return '';
    return String(query).replace(/[,():%_*\\"\r\n]/g, '');
}

// Escaper HTML-spesialtegn — bruk før innsetting i innerHTML eller value="...".
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// --- DATO-HJELPERE (LOKAL TIDSSONE) ---
// Norge er UTC+1/+2 — bruk disse i stedet for toISOString().split('T')[0]
// for å unngå off-by-one nær midnatt.

function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function addDaysLocal(dateStr, days) {
    const date = parseLocalDate(dateStr);
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

window.addEventListener('load', () => {
    // Bordleie er default-modul (synlig på sidelast). Start polling FØR loadTables
    // så timeren er garantert satt opp uansett hva som skjer i load-kallet.
    startBordPolling();
    loadTables();
    updateMemberModule();
    loadLockers();
});
// --- MOBIL-MENY LOGIKK ---

/**
 * Åpner eller lukker hovedmenyen på mobil.
 * @param {string} action - Hvis 'close', vil menyen alltid lukkes.
 */
function toggleMenu(action) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    if (action === 'close') {
        // Lukker menyen (brukes når man klikker på en modul-knapp)
        nav.classList.remove('open');
    } else {
        // Skifter mellom åpen og lukket
        nav.classList.toggle('open');
    }
}
// Lukk meny når man klikker utenfor på mobil
document.addEventListener('click', function(e) {
    const nav = document.getElementById('main-nav');
    const menuBtn = document.querySelector('.menu-btn');
    
    // Sjekk om menyen er åpen på mobil (window width < 1024px)
    if (window.innerWidth < 1024 && nav && nav.classList.contains('open')) {
        // Sjekk om klikket er utenfor menyen OG utenfor menyknappen
        if (!nav.contains(e.target) && !menuBtn?.contains(e.target)) {
            toggleMenu('close');
        }
    }
});


// Enkel og pen beskjed i stedet for stygg alert()
function showToast(message, type = 'success') {
    // Fjern gammel toast hvis den finnes
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // textContent for å hindre at message (kan inneholde feilmeldinger fra Supabase
    // eller andre kilder utenfor vår kontroll) rendres som HTML
    toast.textContent = (type === 'success' ? '✅ ' : '⚠️ ') + message;
    
    document.body.appendChild(toast);

    // Vis den (liten delay for at animasjonen skal starte)
    setTimeout(() => toast.classList.add('show'), 10);

    // Fjern den etter 3 sekunder
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
// START-Funksjon for å vise vår egen stilinge alert
window.visBeskjed = function(tittel, melding, type = 'success') {
    const modal = document.getElementById('custom-alert');
    const tittelFelt = document.getElementById('alert-title');
    const meldingFelt = document.getElementById('alert-message');
    const innhold = document.querySelector('.c-modal-content');
    
    tittelFelt.innerText = tittel.toUpperCase();
    meldingFelt.innerText = melding;
    
    // Tilpass farge etter type
    if (type === 'error') {
        innhold.style.borderColor = 'red';
    } else {
        innhold.style.borderColor = 'var(--biljard-gronn)';
    }

    modal.style.display = 'flex';
};

// Funksjon for å lukke
window.lukkBeskjed = function() {
    document.getElementById('custom-alert').style.display = 'none';
};
// SLUTT-Funksjon for å vise vår egen stilinge alert


// --- BEKREFTELSESMODAL (JA/NEI) ---
let confirmCallback = null;

window.visBekreftelse = function(tittel, melding, emoji, onConfirm, onCancel, jaTekst = "JA", neiTekst = "NEI") {
    const modal = document.getElementById('custom-confirm');
    const tittelFelt = document.getElementById('confirm-title');
    const meldingFelt = document.getElementById('confirm-message');
    const iconFelt = document.getElementById('confirm-icon');
    const jaKnapp = document.getElementById('confirm-yes');
    const neiKnapp = document.getElementById('confirm-no');
    
    // Sett innhold
    tittelFelt.innerText = tittel.toUpperCase();
    meldingFelt.innerText = melding;
    iconFelt.innerText = emoji || '🤔';
    
    // Sett knappetekster
    jaKnapp.innerText = jaTekst;
    neiKnapp.innerText = neiTekst;
    
    // Lagre callbacks
    confirmCallback = { onConfirm, onCancel };
    
    // Fjern gamle event listeners
    const newJaKnapp = jaKnapp.cloneNode(true);
    const newNeiKnapp = neiKnapp.cloneNode(true);
    jaKnapp.parentNode.replaceChild(newJaKnapp, jaKnapp);
    neiKnapp.parentNode.replaceChild(newNeiKnapp, neiKnapp);
    
    // Legg til nye event listeners
    newJaKnapp.addEventListener('click', () => {
        modal.style.display = 'none';
        if (confirmCallback && confirmCallback.onConfirm) {
            confirmCallback.onConfirm();
        }
        confirmCallback = null;
    });
    
    newNeiKnapp.addEventListener('click', () => {
        modal.style.display = 'none';
        if (confirmCallback && confirmCallback.onCancel) {
            confirmCallback.onCancel();
        }
        confirmCallback = null;
    });
    
    // Vis modalen
    modal.style.display = 'flex';
};
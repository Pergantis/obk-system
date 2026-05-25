// auth.js - Håndterer pålogging med Supabase Auth

const PIN_SESSION_MS = 2 * 60 * 60 * 1000; // 2 timer

// Sjekker om bruker er pålogget ved sidelasting
async function sjekkPålogget() {
    try {
        const { data: { session } } = await window.sb.auth.getSession();
        
        if (session) {
            // Bruker er pålogget
            document.body.classList.add('logged-in');
            document.body.classList.remove('logged-out');
            startPåloggetSession();
            visAuthStatusBar();

            // Last inn moduler (hvis de finnes)
            if (typeof loadTables === 'function') setTimeout(loadTables, 100);
            if (typeof updateMemberModule === 'function') setTimeout(updateMemberModule, 100);
            if (typeof loadLockers === 'function') setTimeout(loadLockers, 100);
        } else {
            // Bruker er ikke pålogget
            document.body.classList.add('logged-out');
            document.body.classList.remove('logged-in');
        }
    } catch (err) {
        console.error('Feil ved sjekk av pålogging:', err);
        document.body.classList.add('logged-out');
        document.body.classList.remove('logged-in');
    }
}

// Starter pålogget sesjon: setter wall-clock expiry og 1Hz nedtelling
// som både oppdaterer UI og logger ut når tiden er ute.
//
// Wall-clock i stedet for setTimeout fordi setTimeout-timing kan drifte
// hvis tab-en suspenderes (laptop sover, mobil bytter app). Date.now()
// gir alltid faktisk tid uansett om intervall-callbacks har stått stille.
function startPåloggetSession() {
    if (window.authTimer) clearInterval(window.authTimer);

    window.authExpiry = Date.now() + PIN_SESSION_MS;
    window.authTimer = setInterval(oppdaterNedtelling, 1000);
}

// Sjekker tid igjen mot wall-clock og logger ut om utløpt. Kalles
// hvert sekund av authTimer, og umiddelbart på visibilitychange.
function oppdaterNedtelling() {
    if (!window.authExpiry) return;

    const igjenMs = window.authExpiry - Date.now();
    if (igjenMs <= 0) {
        loggUt();
        return;
    }

    const totalSek = Math.floor(igjenMs / 1000);
    const timer = Math.floor(totalSek / 3600);
    const minutter = String(Math.floor((totalSek % 3600) / 60)).padStart(2, '0');

    const timerEl = document.getElementById('session-timer');
    if (timerEl) timerEl.innerText = `⏱ ${timer}:${minutter} igjen`;
}

// Viser status-bar med pålogget-badge, nedtelling og logg-ut-knapp.
// Bruker eksisterende CSS-klasser (.status-bar, .status-timer, .logout-btn).
function visAuthStatusBar() {
    const eksisterende = document.getElementById('auth-status-bar');
    if (eksisterende) eksisterende.remove();

    const bar = document.createElement('div');
    bar.id = 'auth-status-bar';
    bar.className = 'status-bar';
    bar.innerHTML = `
        <span class="status-badge">🔓 Pålogget</span>
        <span class="status-timer" id="session-timer">⏱ 2:00 igjen</span>
        <button class="logout-btn" id="auth-logout-btn">🔒 Logg ut</button>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    document.getElementById('auth-logout-btn').addEventListener('click', () => {
        loggUt();
    });

    oppdaterNedtelling();
}

// Logger ut
async function loggUt() {
    if (window.authTimer) clearInterval(window.authTimer);
    window.authExpiry = null;

    try {
        await window.sb.auth.signOut();
    } catch (err) {
        console.error('Feil ved utlogging:', err);
    }

    // Last om siden for å vise påloggingsskjerm
    window.location.reload();
}

// Setter opp login-knapp
function setupLogin() {
    const loginBtn = document.getElementById('login-btn');
    if (!loginBtn) {
        console.log('Login button not found yet, waiting...');
        return;
    }
    
    // Fjern gamle event listeners (ved å klone)
    const newBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newBtn, loginBtn);
    
    newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        
        if (!password) {
            errorDiv.innerText = 'Vennligst skriv inn passord';
            errorDiv.style.display = 'block';
            return;
        }
        
        errorDiv.style.display = 'none';
        
        try {
            const { data, error } = await window.sb.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            // Logget inn
            document.body.classList.add('logged-in');
            document.body.classList.remove('logged-out');
            startPåloggetSession();
            visAuthStatusBar();

            // Nullstill passordfelt
            document.getElementById('login-password').value = '';
            errorDiv.style.display = 'none';
            
            // Last inn moduler
            if (typeof loadTables === 'function') loadTables();
            if (typeof updateMemberModule === 'function') updateMemberModule();
            if (typeof loadLockers === 'function') loadLockers();
            
        } catch (err) {
            console.error('Login error:', err);
            errorDiv.innerText = err.message || 'Feil e-post eller passord';
            errorDiv.style.display = 'block';
        }
    });
}

// Re-sjekk session-expiry når tab-en kommer tilbake fra suspend.
// setInterval-callbacks kan stå stille mens tab-en er skjult (typisk
// laptop som sover). Når brukeren kommer tilbake vil neste tick gi
// riktig 'tid igjen' uansett, men hvis sessionen allerede er utløpt
// vil vi at det skal skje umiddelbart — ikke vente på neste sekund.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.authExpiry) {
        oppdaterNedtelling();
    }
});

// Initialiser auth – kjør med en gang
function initAuth() {
    if (document.readyState === 'loading') {
        window.addEventListener('load', () => {
            setupLogin();
            sjekkPålogget();
        });
    } else {
        setupLogin();
        sjekkPålogget();
    }
}

// Start
initAuth();
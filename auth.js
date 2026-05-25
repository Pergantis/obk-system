// auth.js - Håndterer pålogging med Supabase Auth

// Sjekker om bruker er pålogget ved sidelasting
async function sjekkPålogget() {
    try {
        const { data: { session } } = await window.sb.auth.getSession();
        
        if (session) {
            // Bruker er pålogget
            document.body.classList.add('logged-in');
            document.body.classList.remove('logged-out');
            startPåloggetSession();
            
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

// Starter pålogget sesjon (setter timer)
function startPåloggetSession() {
    // Fjern eventuelle gamle timere
    if (window.authTimer) clearInterval(window.authTimer);
    if (window.authTimeout) clearTimeout(window.authTimeout);
    
    // Auto-logout etter 2 timer
    window.authTimeout = setTimeout(() => {
        loggUt();
    }, 2 * 60 * 60 * 1000);
    
}

// Logger ut
async function loggUt() {
    // Rydd opp timere
    if (window.authTimer) clearInterval(window.authTimer);
    if (window.authTimeout) clearTimeout(window.authTimeout);
    
    try {
        // Logg ut fra Supabase
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
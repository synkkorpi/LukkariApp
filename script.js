const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxaP7FjsO5-bicauAPA25mIQ_4YCfHaFcPmo1eIZ3ucaQG2zlHlNlPuyvhc5q6dGpDF/exec";
//  https://script.google.com/macros/s/AKfycbxaP7FjsO5-bicauAPA25mIQ_4YCfHaFcPmo1eIZ3ucaQG2zlHlNlPuyvhc5q6dGpDF/exec - v5

let globalData = [];
let exceptionsData = [];
let lansiharjuData = []; // UUSI: Länsiharjun ruokalista
let lykData = [];        // UUSI: LYK ruokalista
let uniquePersons = [];
let selectedPerson = "";
let selectedDate = new Date(); // Nykyinen valittu päivä
let currentWeekStart = null;   // Viikon (maanantai) päivämäärä

const vkpaivatLyhyt = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];

// --- Service Worker & PWA Toiminnot ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('[PWA] Service Worker rekisteröity alueelle:', reg.scope))
            .catch((err) => console.error('[PWA] Service Worker rekisteröintivirhe:', err));
    });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Asennuksen tulos: ${outcome}`);
    deferredPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }
}

function setupNetworkStatusListeners() {
    window.addEventListener('online', () => naytaOfflineBannari(false));
    window.addEventListener('offline', () => naytaOfflineBannari(true));
    if (!navigator.onLine) {
        naytaOfflineBannari(true);
    }
}

function naytaOfflineBannari(show) {
    const banner = document.getElementById('offline-banner');
    if (banner) {
        if (show) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }
}

function kasitteleData(result) {
    globalData = result.data;
    exceptionsData = result.exceptions || [];
    lansiharjuData = result.lansiharju || []; // UUSI: Tallennetaan ruokalista
    lykData = result.lyk || [];               // UUSI: Tallennetaan ruokalista

    uniquePersons = [...new Set(globalData.map(item => item.Nimi).filter(Boolean))];
    
    if (uniquePersons.length > 0 && !selectedPerson) {
        selectedPerson = uniquePersons[0];
    }

    // Asetetaan alkuperäinen viikko kuluvalle päivälle
    asetaViikkoPaivalle(selectedDate);

    renderTabs();
    paivitaNakyma();
}

async function init() {
    setupNetworkStatusListeners();

    try {
        const response = await fetch(WEB_APP_URL);
        const result = await response.json();

        if (result.status === "success") {
            try {
                localStorage.setItem('perheen_viikko_cache', JSON.stringify(result));
            } catch (e) {
                console.warn("[PWA] Välimuistia ei voitu tallentaa localStoragel-olioon", e);
            }
            kasitteleData(result);
        } else {
            throw new Error(result.message || "Tuntematon virhe");
        }
    } catch (error) {
        console.warn("[PWA] Verkkopyyntö epäonnistui, yritetään käyttää välimuistia:", error);
        
        const cachedStr = localStorage.getItem('perheen_viikko_cache');
        if (cachedStr) {
            try {
                const cachedResult = JSON.parse(cachedStr);
                kasitteleData(cachedResult);
                naytaOfflineBannari(true);
                return;
            } catch (e) {
                console.error("[PWA] Välimuistidatan jäsennys epäonnistui", e);
            }
        }
        document.getElementById('events-container').innerHTML = `<div class="error">Virhe ladattaessa dataa: ${error.message}</div>`;
    }
}

// Laskee annetun päivän viikon maanantain
function getMaanantai(d) {
    let date = new Date(d);
    let day = date.getDay();
    let diff = date.getDate() - day + (day === 0 ? -6 : 1); // Maanantai on 1
    return new Date(date.setDate(diff));
}

function asetaViikkoPaivalle(d) {
    currentWeekStart = getMaanantai(d);
}

// Nuolista tapahtuva viikon vaihto (-1 = edellinen viikko, +1 = seuraava viikko)
function vaihdaViikkoa(suunta) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (suunta * 7));
    
    // Jos valittu päivä ei enää osu tälle viikolle, valitaan uuden viikon maanantai
    let sunnuntai = new Date(currentWeekStart);
    sunnuntai.setDate(sunnuntai.getDate() + 6);
    
    if (selectedDate < currentWeekStart || selectedDate > sunnuntai) {
        selectedDate = new Date(currentWeekStart);
    }
    
    renderDayBar();
    paivitaNakyma();
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';

    uniquePersons.forEach(person => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${person === selectedPerson ? 'active' : ''}`;
        btn.textContent = person;
        btn.onclick = () => {
            selectedPerson = person;
            renderTabs();
            paivitaNakyma();
        };
        container.appendChild(btn);
    });
}

// Piirtää viikon 7 päivää (ma-su) rinnakkain
function renderDayBar() {
    const container = document.getElementById('days-container');
    container.innerHTML = '';

    let viikonPaivat = [];
    let tempDate = new Date(currentWeekStart);

    for (let i = 0; i < 7; i++) {
        viikonPaivat.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
    }

    // Päivitetään viikon otsikko (esim. "Viikko 33 (10.8. - 16.8.)")
    let ekaPvm = viikonPaivat[0].toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    let vikaPvm = viikonPaivat[6].toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    document.getElementById('week-title').textContent = `${ekaPvm} – ${vikaPvm}`;

    viikonPaivat.forEach(d => {
        const btn = document.createElement('div');
        const isSelected = esiintykoPvm(d, selectedDate);

        btn.className = `day-btn ${isSelected ? 'active' : ''}`;
        
        let pvmStr = vkpaivatLyhyt[(d.getDay() + 6) % 7]; // Järjestetään ma-su
        let pvmNum = d.getDate();

        btn.innerHTML = `
            <span style="text-transform: uppercase;">${pvmStr}</span>
            <span class="day-num">${pvmNum}</span>
        `;

        btn.onclick = () => {
            selectedDate = new Date(d);
            renderDayBar();
            paivitaNakyma();
        };

        container.appendChild(btn);
    });
}

function esiintykoPvm(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function tarkistaLoma(date, person) {
    let dateString = date.toISOString().split('T')[0];

    for (let exc of exceptionsData) {
        let alku = exc.Alkamispäivä;
        let loppu = exc.Loppumispäivä || alku;

        if (dateString >= alku && dateString <= loppu) {
            let koskee = exc.Koskee ? exc.Koskee.toLowerCase() : "kaikki";
            if (koskee === "kaikki" || koskee === person.toLowerCase()) {
                return exc.Kuvaus || "Poikkeuspäivä / Loma";
            }
        }
    }
    return null;
}

// UUSI: Funktio kouluruoan näyttämiselle valittuna päivänä
function renderLunch() {
    const container = document.getElementById('lunch-container');
    if (!container) return;
    container.innerHTML = '';

    let activeLunchData = [];
    let koulunNimi = "";

    // Tarkistetaan kuka on valittuna (muokkaa näitä nimistöjä tarvittaessa vastaamaan perheenjäsenten nimiä)
    let pLower = selectedPerson.toLowerCase();
    if (pLower.includes("nipa") || pLower.includes("länsiharju")) {
        activeLunchData = lansiharjuData;
        koulunNimi = "Länsiharjun koulu";
    } else if (pLower.includes("leonardo") || pLower.includes("yhteiskoulu")) {
        activeLunchData = lykData;
        koulunNimi = "Lahden yhteiskoulu";
    } else {
        return; // Ei näytetä ruokaa muille kuin koululaisille
    }

    let selectedPvmStr = selectedDate.toISOString().split('T')[0];
    let paivanRuoka = activeLunchData.find(item => String(item.Päivämäärä).split('T')[0] === selectedPvmStr);

    if (paivanRuoka) {
        container.innerHTML = `
            <div class="lunch-card">
                <div class="lunch-title">
                    <span>🍲 Kouluruoka (${koulunNimi})</span>
                    <span style="font-weight: normal; color: var(--accent-orange);">${paivanRuoka.Ateria || 'Lounas'}</span>
                </div>
                <div class="lunch-items">${paivanRuoka.Ruokalajit || 'Ei ruokalistatietoja.'}</div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="lunch-card" style="border-left-color: var(--border-color);">
                <div class="lunch-title"><span>🍲 Kouluruoka (${koulunNimi})</span></div>
                <div class="lunch-items" style="font-style: italic;">Ei ruokalistaa tälle päivälle.</div>
            </div>
        `;
    }
}

function paivitaNakyma() {
    renderDayBar();
    renderLunch(); // UUSI: Kutsutaan ruokalistan piirtoa aina näkymän päivityksen yhteydessä

    const lomaSyyt = tarkistaLoma(selectedDate, selectedPerson);
    const holidayContainer = document.getElementById('holiday-container');
    
    if (lomaSyyt) {
        holidayContainer.innerHTML = `<div class="holiday-banner">🌴 ${lomaSyyt} – Viikoittaiset rutiinit tauolla</div>`;
    } else {
        holidayContainer.innerHTML = '';
    }

    const container = document.getElementById('events-container');
    container.innerHTML = '';

    let paivanTapahtumat = globalData.filter(item => {
        if (item.Nimi !== selectedPerson) return false;

        const parseDate = (d) => {
            if (!d) return null;
            let date = new Date(d);
            return isNaN(date.getTime()) ? null : date;
        };

        const alkuPvm = parseDate(item.Päivämäärä);
        if (!alkuPvm) return false;

        // 1. YKSITTÄINEN MENO
        if (esiintykoPvm(alkuPvm, selectedDate)) return true;

        // 2. VIIKOITTAINEN TOISTUVUUS
        if (!lomaSyyt && item.Toistuvuus && String(item.Toistuvuus).toLowerCase().includes('joka viikko')) {
            
            // Päättymispäivä
            if (item.Päättymispäivä) {
                const loppuPvm = parseDate(item.Päättymispäivä);
                if (loppuPvm && selectedDate > loppuPvm) return false;
            }

            // Ollaanko alkamispäivän jälkeen?
            if (selectedDate < alkuPvm) return false;

            return alkuPvm.getDay() === selectedDate.getDay();
        }

        return false;
    });

    paivanTapahtumat.sort((a, b) => String(a.Alkamisaika).localeCompare(String(b.Alkamisaika)));

    if (paivanTapahtumat.length === 0) {
        container.innerHTML = `<div class="no-events">Ei merkittyjä menoja tälle päivälle.</div>`;
        return;
    }

    paivanTapahtumat.forEach(rivi => {
        const card = document.createElement('div');
        card.className = 'event-card';
        
        let aiheLower = (rivi.Aihe || "").toLowerCase();
        if (aiheLower.includes('treeni') || aiheLower.includes('futis')) {
            card.classList.add('treenit');
        } else if (aiheLower.includes('koulu')) {
            card.classList.add('koulu');
        } else {
            card.classList.add('muu');
        }

        let paikkaHtml = rivi.Paikka ? `<span class="event-location">${rivi.Paikka}</span>` : '';

        card.innerHTML = `
            <div class="event-header">
                <span class="event-time">${rivi.Alkamisaika || ''} - ${rivi.Loppumisaika || ''}</span>
                ${paikkaHtml}
            </div>
            <div class="event-subject">${rivi.Aihe}</div>
            <div class="event-meta">
                <span>${rivi.Toistuvuus || 'Yksittäinen'}</span>
            </div>
        `;

        container.appendChild(card);
    });
}

// Käynnistys
init();
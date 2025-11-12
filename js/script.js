/* =================================== */
/* SCRIPT PRE ZAMESTNANECKÝ PORTÁL   */
/* (Upravené pre Firebase)           */
/* =================================== */

// Spustíme kód až keď je celá HTML štruktúra (DOM) načítaná
document.addEventListener('DOMContentLoaded', () => {
    
    // --- ZAČIATOK FIREBASE INTEGRÁCIE ---

    // Vaša web app's Firebase configuration (zadaná v požiadavke)
    const firebaseConfig = {
      apiKey: "__FIREBASE_API_KEY__",
      authDomain: "hr-portal-okr.firebaseapp.com",
      projectId: "hr-portal-okr",
      storageBucket: "hr-portal-okr.firebasestorage.app",
      messagingSenderId: "515475232306",
      appId: "1:515475232306:web:6c551e1876252dd3398e2b"
    };

    // Globálne premenné pre Firebase
    let app, db, auth;

    try {
        // Inicializujeme Firebase (predpokladáme, že SDK sú načítané v HTML)
        // Používame "compat" syntax (window.firebase)
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();

    } catch (e) {
        console.error("Chyba pri inicializácii Firebase. Uistite sa, že ste do HTML pridali Firebase SDK scripty.", e);
        document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba: Nepodarilo sa načítať Firebase SDK.</h1>';
        return; // Zastavíme vykonávanie
    }
    
    // --- KONIEC FIREBASE INTEGRÁCIE ---

    // Premenné, kde si budeme pamätať načítané dáta
    let allEmployees = [];
    let paymentGrades = new Map();
    let validOECs = new Set(); // Presunuté do globálneho rozsahu
    let jobDescriptions = {}; // <-- NOVÁ PREMENNÁ PRE OPISY PRÁCE
    let activeUser = null;

    // Selektory na hlavné elementy, s ktorými pracujeme
    const resultsList = document.querySelector('.search-results');
    const searchInput = document.querySelector('.search-container input');

    // Selektory pre nový login modál
    const loginOverlay = document.querySelector('#login-modal-overlay');
    const loginForm = document.querySelector('#login-form');
    const oecInput = document.querySelector('#oec-input');
    const loginErrorMsg = document.querySelector('#login-error-msg');


    /**
     * <-- NOVÁ FUNKCIA PRE LOGOVANIE (Bez zmeny) -->
     * Odošle dáta o prihlásení do Google Forms na pozadí.
     * @param {Object} user - Objekt prihláseného používateľa
     */
    async function logLoginAttempt(user) {
        
        // ==================================================================
        // !!! NAHRAĎTE TIETO HODNOTY VAŠIMI HODNOTAMI Z GOOGLE FORMULÁRA !!!
        // ==================================================================
        
        // 1. URL adresa končiaca na /formResponse
        const GOOGLE_FORM_ACTION_URL = '__GOOGLE_FORM_URL__';
        
        // 2. ID, ktoré zodpovedá vášmu poľu "MenoPriezvisko"
        const ENTRY_ID_MENO = 'entry.1888327'; 
        
        // 3. ID, ktoré zodpovedá vášmu poľu "OEC"
        const ENTRY_ID_OEC = 'entry.1372315452';
        
        // 4. ID, ktoré zodpovedá vášmu poľu "CasPrihlasenia" (ak ho máte)
        const ENTRY_ID_CAS = 'entry.2133691514';
        
        // ==================================================================
        // !!! KONIEC ÚPRAV !!!
        // ==================================================================


        const timestamp = new Date().toLocaleString('sk-SK');
        const formData = new FormData();

        // Priradíme dáta do formulára
        formData.append(ENTRY_ID_MENO, `${user.titul} ${user.meno} ${user.priezvisko}`);
        formData.append(ENTRY_ID_OEC, user.oec);
        formData.append(ENTRY_ID_CAS, timestamp); // Ak pole pre čas nemáte, tento riadok zakomentujte

        try {
            // Odošleme dáta a nečakáme na odpoveď
            await fetch(GOOGLE_FORM_ACTION_URL, {
                method: 'POST',
                body: formData,
                mode: 'no-cors' // Dôležité: Povieme prehliadaču, aby neočakával odpoveď
            });
            // Log bol úspešne odoslaný (alebo aspoň odoslaný bez chyby)
        } catch (error) {
            // Aj keby logovanie zlyhalo, aplikácia musí bežať ďalej.
            // Chybu si vypíšeme len do konzoly prehliadača.
            console.error('Chyba pri odosielaní logu:', error);
        }
    }


    /**
     * <-- UPRAVENÁ FUNKCIA (async):
     * Načíta zamestnancov z Firebase a overí používateľa.
     * Vráti Promise, ktorý sa vyrieši objektom
     * obsahujúcim VŠETKÝCH zamestnancov A PRIHLÁSENÉHO používateľa.
     * @returns {Promise<Object|null>}
     */
    async function handleLogin() { // <-- PRIDANÉ ASYNC
        // Vrátime nový Promise. Vonkajší kód (initializeApp) naň bude čakať.
        return new Promise(async (resolve, reject) => {
            let employees;
            try {
                // 1. Prihlásenie do Firebase (anonymné)
                // Toto je potrebné, aby Firestore povolil čítanie dát (ak máte základné pravidlá)
                try {
                    await auth.signInAnonymously();
                    console.log("Firebase: Anonymné prihlásenie úspešné.");
                } catch (authError) {
                    console.error("Firebase Auth Error:", authError);
                    throw new Error('Chyba pri prihlásení do Firebase.');
                }

                // 2. Načítame zamestnancov z FIREBASE namiesto .json
                console.log("Načítavam zamestnancov z Firebase (kolekcia 'employees')...");
                const querySnapshot = await db.collection("employees").get(); // <-- FIREBASE VOLANIE
                
                employees = [];
                querySnapshot.forEach((doc) => {
                    employees.push(doc.data()); // Predpokladáme, že štruktúra dát sedí
                });
                console.log(`Načítaných ${employees.length} zamestnancov.`);

                if (employees.length === 0) {
                    throw new Error('Neboli nájdení žiadni zamestnanci v databáze.');
                }

                // 3. Vytvoríme zoznam platných OEC (existujúca logika)
                validOECs = new Set(
                    employees
                        .filter(emp => emp.funkcia === 'vedúci oddelenia' || emp.funkcia === 'vedúci odboru')
                        .map(emp => emp.oec)
                );
                
                // 4. Modál je štandardne viditeľný pri načítaní stránky (existujúca logika)

            } catch (error) {
                console.error('Nepodarilo sa načítať konfiguráciu z Firebase:', error);
                alert('Chyba pri načítaní konfigu. Aplikáciu nie je možné spustiť.');
                return reject(error); // Odmietneme Promise
            }

            // 5. Nastavíme listener na formulár (existujúca logika - bez zmeny)
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = oecInput.value.trim();

                if (validOECs.has(input)) {
                    // Úspech!
                    const loggedInUser = employees.find(emp => emp.oec === input);
                    logLoginAttempt(loggedInUser); 
                    loginOverlay.classList.add('hidden'); 
                    resolve({ allEmployeesData: employees, currentUser: loggedInUser });
                } else {
                    // Zlyhanie
                    loginErrorMsg.textContent = 'prístup zamietnutý';
                    loginErrorMsg.style.display = 'block';
                    oecInput.value = '';
                }
            });

            // 6. (Voliteľné) Ak klikne na pozadie (existujúca logika - bez zmeny)
            loginOverlay.addEventListener('click', (e) => {
                if (e.target === loginOverlay) {
                    alert("Prístup zamietnutý.");
                    resolve(null); 
                }
            });
        });
    }


    /**
     * Hlavná funkcia na načítanie zvyšných dát (tarify a opisy práce) z Firebase
     * @param {Array} loadedEmployees - Dáta, ktoré sme už načítali pri overení (kompletný zoznam)
     * @param {Object} currentUser - Objekt prihláseného používateľa (vedúceho)
     */
    async function loadData(loadedEmployees, currentUser) { // <-- PRIDANÉ ASYNC
        activeUser = currentUser;
        try {
            
            // <-- #### ZAČIATOK NOVEJ ÚPRAVY (Filtrácia zamestnancov) #### --> (Bez zmeny)
            if (currentUser && currentUser.funkcia === 'vedúci oddelenia') {
                allEmployees = loadedEmployees.filter(emp => emp.oddelenie === currentUser.oddelenie);
            } else {
                allEmployees = loadedEmployees;
            }
            // <-- #### KONIEC NOVEJ ÚPRAVY (Filtrácia zamestnancov) #### -->


            // <-- #### ZAČIATOK NOVEJ ÚPRAVY (Počítadlo zamestnancov) #### --> (Bez zmeny)
            const employeeCountDisplay = document.querySelector('#employee-count-display');
            if (employeeCountDisplay) {
                employeeCountDisplay.textContent = `Počet zamestnancov: ${allEmployees.length}`;
            }
            // <-- #### KONIEC NOVEJ ÚPRAVY (Počítadlo zamestnancov) #### -->


            // Načítame platobné tarify z FIREBASE
            console.log("Načítavam platové tarify z Firebase (kolekcia 'payment')...");
            const paymentSnapshot = await db.collection("payment").get(); // <-- FIREBASE VOLANIE
            
            paymentGrades.clear(); // Vyčistíme mapu pre istotu
            paymentSnapshot.forEach(doc => {
                const item = doc.data();
                // Kontrola pre istotu
                if (item.platova_trieda !== undefined && item.platova_tarifa !== undefined) {
                    paymentGrades.set(item.platova_trieda, parseFloat(item.platova_tarifa));
                }
            });
            console.log(`Načítaných ${paymentGrades.size} platových taríf.`);


            // Načítame opisy práce z FIREBASE
            console.log("Načítavam opisy práce z Firebase (kolekcia 'jobDescription')...");
            const jobDescSnapshot = await db.collection("jobDescription").get(); // <-- FIREBASE VOLANIE
            
            jobDescriptions = {}; // Inicializujeme pre istotu
            jobDescSnapshot.forEach((doc) => {
                // Kľúč je ID dokumentu (napr. "28831")
                jobDescriptions[doc.id] = doc.data(); 
            });
            console.log(`Načítaných ${Object.keys(jobDescriptions).length} opisov práce.`);

            
            // Vyplníme zoznam v sidebari (teraz už s filtrovanými dátami)
            populateEmployeeList(allEmployees);
            
            // --- ZAČIATOK ÚPRAVY (Zobrazenie prihláseného usera) --- (Bez zmeny)
            if (currentUser) {
                displayEmployeeDetails(currentUser);
                
                const userLi = resultsList.querySelector(`li[data-oec="${currentUser.oec}"]`);
                if (userLi) {
                    userLi.classList.add('active');
                }
                updateSidebarUser(currentUser);
                
            } else if (allEmployees.length > 0) {
                // Fallback, ak by nebol currentUser (hoci by mal byť)
                displayEmployeeDetails(allEmployees[0]);
                resultsList.querySelector('li')?.classList.add('active');
            }
            // --- KONIEC ÚPRAVY ---

        } catch (error) {
            console.error('Nepodarilo sa načítať dáta z Firebase:', error);
            resultsList.innerHTML = '<li>Chyba pri načítaní dát.</li>';
        }
    }

    /**
     * Funkcia, ktorá vyplní zoznam zamestnancov v ľavom paneli.
     * @param {Array} employees - Pole objektov zamestnancov
     */
    function populateEmployeeList(employees) {
        resultsList.innerHTML = '';
        
        employees.forEach(employee => {
            const li = document.createElement('li');
            li.textContent = `${employee.titul} ${employee.meno} ${employee.priezvisko}`;
            li.dataset.oec = employee.oec;
            resultsList.appendChild(li);
        });
    }

    //
    // <-- #### ZAČIATOK OPRAVENEJ POMOCNEJ FUNKCIE #### -->
    //
    /**
     * Pomocná funkcia na generovanie HTML pre opis služobnej činnosti.
     * UPRAVENÁ VERZIA: Nahrádza \n za <br> pre správne zobrazenie.
     * @param {Object} data - Objekt s opisom činnosti (napr. jobDescriptions['28831'])
     * @returns {string} - Výsledný HTML reťazec
     */
    function buildDescriptionHtml(data) {
        if (!data) return ''; // Bezpečnostná kontrola

        let html = '';
        const topMargin = 'style="margin-top: 1.5rem;"'; // cca 24px

        // --- OPRAVENÁ SEKCIA (bola tu chyba s '3') ---
        if (data['Najnáročnejšia činnosť (charakteristika platovej triedy)']) {
            html += `<h3><b>Najnáročnejšia činnosť (charakteristika platovej triedy)</b></h3>`;
            // Skontrolujeme, či je to pole (Array)
            if (Array.isArray(data['Najnáročnejšia činnosť (charakteristika platovej triedy)'])) {
                html += '<ul>';
                data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                // Ak to nie je pole (je to String), vypíšeme ako paragraf
                // <-- UPRAVENÉ: Pridané .replace(/\n/g, '<br>')
                html += `<p>${data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
            }
        }
        // --- KONIEC OPRAVY ---
        
        if (data['Bližšie určená najnáročnejšia činnosť']) {
            html += `<h3 ${topMargin}><b>Bližšie určená najnáročnejšia činnosť</b></h3>`;
            
            // <-- PRIDANÁ KONTROLA -->
            if (Array.isArray(data['Bližšie určená najnáročnejšia činnosť'])) {
                html += '<ul>';
                data['Bližšie určená najnáročnejšia činnosť'].forEach(item => {
                    if (item === "Ďalej: ") {
                        html += `<li class="list-subheading">${item}</li>`;
                    } else {
                        // Odsadenie pre vnorené položky
                        const style = item.trim().startsWith('na úseku') ? ' style="margin-left: 20px;"' : '';
                        html += `<li${style}>${item}</li>`;
                    }
                });
                html += '</ul>';
            } else {
                // Ak to nie je pole (String), nahradíme nové riadky ( \n ) za <br>
                let textBlock = data['Bližšie určená najnáročnejšia činnosť'];
                // <-- UPRAVENÉ: Pôvodné .split('. ').join('.<br>') nahradené za .replace(/\n/g, '<br>')
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }

        // --- OPRAVENÁ SEKCIA (pridaná kontrola Array vs String) ---
        if (data['Ďalšia činnosť (charakteristika platovej triedy)']) {
            html += `<h3 ${topMargin}><b>Ďalšia činnosť (charakteristika platovej triedy)</b></h3>`;
            // Skontrolujeme, či je to pole (Array)
            if (Array.isArray(data['Ďalšia činnosť (charakteristika platovej triedy)'])) {
                 html += '<ul>';
                data['Ďalšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                // Ak to nie je pole (je to String), vypíšeme ako paragraf
                // <-- UPRAVENÉ: Pridané .replace(/\n/g, '<br>')
                html += `<p>${data['Ďalšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
            }
        }
        // --- KONIEC OPRAVY ---

        if (data['Bližšie určená ďalšia činnosť']) {
            html += `<h3 ${topMargin}><b>Bližšie určená ďalšia činnosť</b></h3>`;

            // <-- PRIDANÁ KONTROLA -->
            if (Array.isArray(data['Bližšie určená ďalšia činnosť'])) {
                html += '<ul>';
                data['Bližšie určená ďalšia činnosť'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                // Ak to nie je pole (String), nahradíme nové riadky ( \n ) za <br>
                let textBlock = data['Bližšie určená ďalšia činnosť'];
                // <-- UPRAVENÉ: Pôvodné .split('. ').join('.<br>') nahradené za .replace(/\n/g, '<br>')
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }
        
        if (data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre']) {
            html += `<h3 ${topMargin}><b>Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre</b></h3>`;
            
            // <-- PRIDANÁ KONTROLA -->
            if (Array.isArray(data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'])) {
                html += '<ul>';
                data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                // Ak to nie je pole (String), nahradíme nové riadky ( \n ) za <br>
                let textBlock = data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'];
                // <-- UPRAVENÉ: Pôvodné .split('. ').join('.<br>') nahradené za .replace(/\n/g, '<br>')
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }
        
        return html;
    }
    //
    // <-- #### KONIEC OPRAVENEJ POMOCNEJ FUNKCIE #### -->
    //

    /**
     * Zobrazí detaily vybraného zamestnanca v hlavnom obsahovom okne.
     * @param {Object} employee - Objekt jedného zamestnanca
     */
    function displayEmployeeDetails(employee) {
        
        // 1. Aktualizácia hlavičky (Meno a OČE) (Bez zmeny)
        document.querySelector('.employee-header h1').textContent = `${employee.titul} ${employee.meno} ${employee.priezvisko}`;
        document.querySelector('.employee-id').textContent = `Osobné číslo: ${employee.oec}`;

        // 2. Aktualizácia karty "Osobné údaje" (Bez zmeny)
        const personalInfoCard = document.querySelector('#personal-info .info-list');
        if (personalInfoCard) {
            personalInfoCard.innerHTML = `
                <dt>Titul</dt>
                <dd>${employee.titul || '---'}</dd>
                
                <dt>Meno</dt>
                <dd>${employee.meno || '---'}</dd>
                
                <dt>Priezvisko</dt>
                <dd>${employee.priezvisko || '---'}</dd>
                
                <dt>Adresa</dt>
                <dd>${employee.adresa ? employee.adresa.replace(', ', '<br>') : '---'}</dd>
                
                <dt>Kontakt</dt>
                <dd>${employee.kontakt ? employee.kontakt.replace(', ', '<br>') : '---'}</dd>

                <dt>Nástup</dt>
                <dd>${employee.nastup || '---'}</dd>
            `;
        }

        // 3. Aktualizácia karty "Pracovné zaradenie" (Bez zmeny)
        // Logika pre paymentGrades.get() zostáva, lebo sme ju naplnili z Firebase
        const jobInfoCard = document.querySelector('#job-info');
        if (jobInfoCard) {
            let extrasList = '';
            if (employee.osobny_priplatok) {
                extrasList += `<li>Osobný príplatok: <span class="salary-tariff">${employee.osobny_priplatok} €</span></li>`;
            }
            if (employee.zmennost_pohotovost) {
                extrasList += `<li>Zmennosť/Pohotovosť: ${employee.zmennost_pohotovost} €</li>`;
            }
            if (employee.vedenie_vozidla) {
                extrasList += `<li>Vedenie vozidla: ${employee.vedenie_vozidla} €</li>`;
            }
            if (employee.starostlivost_vozidlo) {
                extrasList += `<li>Starostlivosť o vozidlo: ${employee.starostlivost_vozidlo} €</li>`;
            }
            if (extrasList === '') {
                extrasList = '<li>Žiadne ďalšie príplatky.</li>';
            }

            const trieda = employee.platova_trieda || '?';
            const tarifa = paymentGrades.get(String(employee.platova_trieda)); 

            const tariffHtml = tarifa !== undefined 
                ? ` <span class="salary-tariff">- ${tarifa.toFixed(2)} €</span>` 
                : '';

            jobInfoCard.innerHTML = `
                <div class="card-header">
                    <i class="fas fa-sitemap"></i>
                    <h2 id="show-service-description" class="clickable-card-title">Pracovné zaradenie</h2>
                    <span style="margin-left: auto; font-size: 0.9rem; color: var(--color-text-light); font-weight: 600;">${employee.kod || '---'}</span>
                </div>
                
                <div class="info-block">
                    <h3>Platová trieda</h3>
                    <p class="salary-grade">Trieda ${trieda}${tariffHtml}</p>
                </div>

                <div class="info-block">
                    <h3>Funkcia</h3>
                    <p>${employee.oddelenie || 'Nezaradený'}: <strong>${employee.funkcia || 'Nezadaná funkcia'}</strong></p>

                    <h3>Príplatky</h3>
                    <ul>
                        ${extrasList}
                    </ul>
                </div>
            `;
        }
        
        // 4. Aktualizácia novej karty "Opis služobnej činnosti" (Bez zmeny)
        // Logika pre jobDescriptions[] zostáva, lebo sme ju naplnili z Firebase
        const serviceCard = document.querySelector('#service-description-card');
        if (serviceCard) {
            
            // <-- #### ZAČIATOK NOVEJ ZLUČOVACEJ LOGIKY (MERGE LOGIC) #### --> (Bez zmeny)
            
            let opisCinnostiHtml = '';
            const baseKey = employee.kod; // 1. Primárny kľúč je "kod" zamestnanca
            let effectiveKey = baseKey; // <-- Kľúč, ktorý sa reálne použije
            let baseData = jobDescriptions[baseKey];

            // <-- #### ZAČIATOK ÚPRAVY PODĽA POŽIADAVKY #### --> (Bez zmeny)
            if (!baseData) {
                if (employee.oddelenie === 'KS IZS' && employee.platova_trieda === 5) {
                    effectiveKey = '5_ISZ';
                } 
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda === 6) {
                    effectiveKey = '6_ISZ';
                }
                
                baseData = jobDescriptions[effectiveKey];
            }
            // <-- #### KONIEC ÚPRAVY PODĽA POŽIADAVKY #### -->

            let descriptionDataToShow; 

            if (!baseData) {
                opisCinnostiHtml = `<p>Opis služobnej činnosti pre tohto zamestnanca (kód: ${baseKey}) zatiaľ nebol zadaný.</p>`;
                descriptionDataToShow = null; 
            } else {
                descriptionDataToShow = JSON.parse(JSON.stringify(baseData));
                let keyToCompare = null;

                if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda === 5) {
                    keyToCompare = '5_OCOaKP';
                } 
                else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda === 6) {
                    keyToCompare = '6_OCOaKP';
                }
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda === 5) {
                    keyToCompare = '5_ISZ';
                }
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda === 6) {
                    keyToCompare = '6_ISZ';
                }

                if (keyToCompare && effectiveKey !== keyToCompare) {
                    const additionalData = jobDescriptions[keyToCompare];

                    if (additionalData) {
                        for (const sectionKey in additionalData) {
                            
                            const baseSection = descriptionDataToShow[sectionKey];
                            const addSection = additionalData[sectionKey];

                            if (!baseSection) {
                                descriptionDataToShow[sectionKey] = addSection;
                            } else {
                                const baseIsArray = Array.isArray(baseSection);
                                const addIsArray = Array.isArray(addSection);

                                if (baseIsArray && addIsArray) {
                                    descriptionDataToShow[sectionKey] = baseSection.concat(addSection);
                                } 
                                else if (!baseIsArray && addIsArray) {
                                    descriptionDataToShow[sectionKey] = [baseSection].concat(addSection);
                                } 
                                else if (baseIsArray && !addIsArray) {
                                    descriptionDataToShow[sectionKey] = baseSection.concat([addSection]);
                                } 
                                else {
                                    // <-- UPRAVENÉ: Tu tiež nahradíme \n za <br> pri spájaní
                                    const processedBase = String(baseSection).replace(/\n/g, '<br>');
                                    const processedAdd = String(addSection).replace(/\n/g, '<br>');
                                    descriptionDataToShow[sectionKey] = processedBase + "<br><br>" + processedAdd;
                                }
                            }
                        }
                    }
                }
                
                // Funkcia buildDescriptionHtml teraz automaticky spracuje \n
                opisCinnostiHtml = buildDescriptionHtml(descriptionDataToShow);
            }
            
            // <-- #### KONIEC NOVEJ ZLUČOVACEJ LOGIKY #### -->
            
            serviceCard.innerHTML = `
                <button class="card-close-btn" id="close-service-description" aria-label="Zavrieť">
                    <i class="fas fa-times"></i>
                </button>
                <div class="card-header">
                    <i class="fas fa-clipboard-list"></i>
                    <h2>Opis služobnej činnosti</h2>
                </div>
                <div class="info-block scrollable-content">
                    ${opisCinnostiHtml}
                </div>
            `;

            // 5. Pridanie listenera na nové tlačidlo "X" (Bez zmeny)
            const closeBtn = serviceCard.querySelector('#close-service-description');
            const mainCardsContainer = document.querySelector('.cards-container'); 
            
            if (closeBtn && mainCardsContainer) {
                closeBtn.addEventListener('click', () => {
                    serviceCard.classList.add('hidden'); 
                    mainCardsContainer.classList.remove('hidden'); 
                });
            }
        }
    }

    /**
     * Funkcia na vyčistenie detailov zamestnanca
     * Zobrazí prázdne karty.
     */
    function clearEmployeeDetails() {
        // 1. Reset hlavičky (Bez zmeny)
        document.querySelector('.employee-header h1').textContent = '---';
        document.querySelector('.employee-id').textContent = 'Osobné číslo: ---';

        // 2. Reset karty "Osobné údaje" (Bez zmeny)
        const personalInfoCard = document.querySelector('#personal-info .info-list');
        if (personalInfoCard) {
            personalInfoCard.innerHTML = `
                <dt>Titul</dt>
                <dd>---</dd>
                <dt>Meno</dt>
                <dd>---</dd>
                <dt>Priezvisko</dt>
                <dd>---</dd>
                <dt>Adresa</dt>
                <dd>---</dd>
                <dt>Kontakt</dt>
                <dd>---</dd>
                <dt>Nástup</dt>
                <dd>---</dd>
            `;
        }

        // 3. Reset karty "Pracovné zaradenie" (Bez zmeny)
        const jobInfoCard = document.querySelector('#job-info');
        if (jobInfoCard) {
            jobInfoCard.innerHTML = `
                <div class="card-header">
                    <i class="fas fa-sitemap"></i> <h2 id="show-service-description" class="clickable-card-title">Pracovné zaradenie</h2>
                </div>
                
                <div class="info-block">
                    <h3>Platová trieda</h3>
                    <p class="salary-grade">Trieda ---</p>
                </div>

                <div class="info-block">
                    <h3>Funkcia</h3>
                    <p><strong>---</strong></p>
                    <p>Oddelenie: ---</p>
                    
                    <h3>Príplatky</h3>
                    <ul>
                        <li>---</li>
                    </ul>
                </div>
            `;
        }
        
        // 4. Reset a skrytie karty "Opis služobnej činnosti" (Bez zmeny)
        const serviceCard = document.querySelector('#service-description-card');
        const mainCardsContainer = document.querySelector('.cards-container');
        if (serviceCard) {
            serviceCard.innerHTML = ''; 
            serviceCard.classList.add('hidden'); 
        }
        if (mainCardsContainer) {
            mainCardsContainer.classList.remove('hidden'); 
        }
    }

    /**
     * <-- UPRAVENÁ FUNKCIA --> (Bez zmeny)
     * Aktualizuje informácie o prihlásenom používateľovi v päte sidebaru.
     * @param {Object} user - Objekt prihláseného používateľa
     */
    function updateSidebarUser(user) {
        const userNameEl = document.querySelector('#sidebar-user-name');
        const userPositionEl = document.querySelector('#sidebar-user-position');
        const userInitialsEl = document.querySelector('#sidebar-user-initials'); 

        if (userNameEl && userPositionEl && userInitialsEl) {
            userNameEl.textContent = `${user.titul} ${user.meno} ${user.priezvisko}`;
            userPositionEl.textContent = user.funkcia;
            const prveMeno = user.meno ? user.meno[0] : '';
            const prvePriezvisko = user.priezvisko ? user.priezvisko[0] : '';
            const initials = (prveMeno + prvePriezvisko).toUpperCase() || '--'; 
            userInitialsEl.textContent = initials;
        }
    }

    // --- PRIDANIE INTERAKTIVITY ---

    // 1. Reagovanie na kliknutie v zozname zamestnancov (Bez zmeny)
    resultsList.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'LI') {
            const clickedLi = e.target;
            const oec = clickedLi.dataset.oec;
            const selectedEmployee = allEmployees.find(emp => emp.oec === oec);

            if (selectedEmployee) {
                clearEmployeeDetails();
                displayEmployeeDetails(selectedEmployee);
                resultsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                clickedLi.classList.add('active');
            }
        }
    });

    // 2. Reagovanie na písanie do vyhľadávacieho poľa (Bez zmeny)
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const listItems = resultsList.querySelectorAll('li');
        
        listItems.forEach(li => {
            if (li.textContent.toLowerCase().includes(searchTerm)) {
                li.style.display = 'block';
            } else {
                li.style.display = 'none';
            }
        });
    });

    // 3. Reagovanie na kliknutie "Odhlásiť sa" (v hlavičke) (Bez zmeny)
    const logoutBtn = document.querySelector('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            window.location.reload();
        });
    }

    // 4. Reagovanie na kliknutie "Pracovné zaradenie" (Otvorenie novej karty) (Bez zmeny)
    const mainContent = document.querySelector('.main-content');
    const cardsContainer = document.querySelector('.cards-container'); 
    const serviceCard = document.querySelector('#service-description-card'); 

    if (mainContent && cardsContainer && serviceCard) {
        mainContent.addEventListener('click', (e) => {
            const titleTarget = e.target.closest('#show-service-description');
            
            if (titleTarget) {
                e.preventDefault();
                cardsContainer.classList.add('hidden');
                serviceCard.classList.remove('hidden');
            }
        });
    }

    // 
    //  ================================================================
    //  == ZAČIATOK NOVEJ FUNKCIONALITY (5.): EXCEL EXPORT (UPRAVENÉ) == (Bez zmeny)
    //  ================================================================
    // 
    const exportBtn = document.querySelector('#export-excel-btn');
        
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (typeof XLSX === 'undefined') {
                console.error('Knižnica XLSX (SheetJS) nebola nájdená.');
                alert('Chyba: Knižnica pre export chýba. Skúste obnoviť stránku.');
                return;
            }
            
            if (!allEmployees || allEmployees.length === 0) {
                alert('Chyba: Dáta zamestnancov nie sú k dispozícii.');
                return;
            }

            // 1. Pripravíme hlavičky (UPRAVENÉ)
            const headers = [
                "P. č.",
                "Názov oddelenia",
                "Funkcia",
                "Kód", 
                "OEČ", 
                "Titul",
                "Meno",
                "Priezvisko",
                "Adresa",
                "Služobný kontakt",
                "Súkromný kontakt",
                "Nástup",
                "Platová trieda"
            ];

            // 2. Pripravíme dáta (riadky) (UPRAVENÉ)
            const data = allEmployees.map((emp, index) => {
                let sluzobny_kontakt = '';
                let sukromny_kontakt = '';
                const kontakt = emp.kontakt || ''; 

                if (kontakt.includes(',')) {
                    const parts = kontakt.split(',');
                    sluzobny_kontakt = parts[0] ? parts[0].trim() : '';
                    sukromny_kontakt = parts[1] ? parts[1].trim() : '';
                } else if (kontakt.trim() !== 'null' && kontakt.trim() !== '') {
                    sukromny_kontakt = kontakt.trim();
                }

                const oddelenie = emp.oddelenie || '';
                const finalOddelenie = oddelenie.trim() === 'odbor krízového riadenia' ? 'OKR' : oddelenie;

                return [
                    index + 1,
                    finalOddelenie,
                    emp.funkcia || '',
                    emp.kod || '', 
                    emp.oec || '', 
                    emp.titul || '',
                    emp.meno || '',
                    emp.priezvisko || '',
                    (emp.adresa && emp.adresa !== 'null') ? emp.adresa : '',
                    sluzobny_kontakt,
                    sukromny_kontakt,
                    (emp.nastup && emp.nastup !== 'null') ? emp.nastup : '',
                    emp.platova_trieda || ''
                ];
            });

            // 3. Spojíme hlavičky a dáta
            const sheetData = [headers, ...data];

            try {
                // 4. Vytvoríme "workbook" (zošit)
                const wb = XLSX.utils.book_new();
                
                // 5. Vytvoríme "worksheet" (hárok) z nášho poľa dát
                const ws = XLSX.utils.aoa_to_sheet(sheetData);

                // (Voliteľné) Nastavenie šírky stĺpcov pre lepšiu čitateľnosť (UPRAVENÉ)
                ws['!cols'] = [
                    { wch: 5 },  // Por. číslo
                    { wch: 22 }, // Oddelenie
                    { wch: 18 }, // Funkcia
                    { wch: 9 }, // Kód (NOVÝ)
                    { wch: 9 }, // OEČ (NOVÝ)
                    { wch: 9 },  // Titul
                    { wch: 15 }, // Meno
                    { wch: 18 }, // Priezvisko
                    { wch: 18 }, // Adresa (Šírka zostáva)
                    { wch: 18 }, // Služobný
                    { wch: 18 }, // Súkromný
                    { wch: 9 }, // Nástup
                    { wch: 9 }  // Pl. trieda
                ];
                
                // <-- #### ZAČIATOK ÚPRAVY: APLIKÁCIA ŠTÝLOV #### -->
                
                const range = XLSX.utils.decode_range(ws['!ref']);
                const adresaColIndex = 8; 

                for (let r = range.s.r; r <= range.e.r; r++) {
                    for (let c = range.s.c; c <= range.e.c; c++) {
                        
                        const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
                        let cell = ws[cellAddress];

                        if (!cell) {
                            cell = ws[cellAddress] = { t: 's', v: '' }; 
                        }

                        if (!cell.s) {
                            cell.s = {};
                        }
                        if (!cell.s.alignment) {
                            cell.s.alignment = {};
                        }
                        if (!cell.s.font) {
                            cell.s.font = {};
                        }

                        cell.s.alignment.horizontal = "center";
                        cell.s.alignment.vertical = "center";

                        if (r === 0) {
                            cell.s.alignment.wrapText = true;
                            cell.s.font.bold = true;
                        }

                        if (c === adresaColIndex) {
                            cell.s.alignment.wrapText = true;
                        }
                    }
                }

                // <-- #### KONIEC ÚPRAVY: APLIKÁCIA ŠTÝLOV #### -->

                // 6. Pridáme hárok do zošitu
                XLSX.utils.book_append_sheet(wb, ws, "Zoznam zamestnancov");
                
                // 7. Spustíme stiahnutie súboru
                let filename = "zamestnanci";
                
                if (activeUser) {
                    if (activeUser.funkcia === 'vedúci odboru') {
                        filename += "_OKR";
                    } else if (activeUser.funkcia === 'vedúci oddelenia') {
                        const deptName = activeUser.oddelenie ? activeUser.oddelenie : 'X';
                        filename += "_" + deptName;
                    }
                }
                
                filename += ".xlsx";

                XLSX.writeFile(wb, filename);
                
                // <-- #### KONIEC ÚPRAVY #### -->

            } catch (error) {
                console.error('Chyba pri vytváraní XLSX súboru:', error);
                alert('Nastala chyba pri vytváraní súboru.');
            }
        });
    }
    // 
    //  ================================================================
    //  == KONIEC NOVEJ FUNKCIONALITY (5.): EXCEL EXPORT             ==
    //  ================================================================
    //

    /**
     * <-- UPRAVENÉ (async): Hlavný spúšťač aplikácie
     */
    async function initializeApp() { // <-- PRIDANÉ ASYNC
        try {
            // Namiesto checkAndFetchEmployees voláme handleLogin
            // a čakáme na vyriešenie Promise (ktorý čaká na vyplnenie formulára)
            
            // Čakáme na objekt { allEmployeesData, currentUser }
            const authData = await handleLogin();
            
            if (authData) {
                // Úspech: Máme dáta, môžeme spustiť zvyšok appky
                // Pošleme oboje do loadData (ktorá je teraz tiež async)
                await loadData(authData.allEmployeesData, authData.currentUser); // <-- PRIDANÉ AWAIT
            } else {
                // Zlyhanie: Overenie zlyhalo (klikli vedľa), skryjeme portál
                document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Prístup zamietnutý.</h1>';
            }
        } catch (error) {
            // Zachytíme chyby z handleLogin (napr. zlyhanie načítania configu z Firebase)
            console.error("Kritická chyba pri inicializácii aplikácie:", error);
            document.body.innerHTML = `<h1 style="padding: 2rem; text-align: center;">Kritická chyba aplikácie: ${error.message}.</h1>`;
        }
    }

    // --- SPUSTENIE ---
    // Zavoláme hlavnú funkciu, aby sa všetko spustilo
    initializeApp();

});
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
    authDomain: "okr-portal-7884f.firebaseapp.com",
    projectId: "okr-portal-7884f",
    storageBucket: "okr-portal-7884f.firebasestorage.app",
    messagingSenderId: "252556045186",
    appId: "1:252556045186:web:5bd1ecf73b4311a5d97d9b"
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
    let validOECs = new Set(); 
    let jobDescriptions = {}; 
    let activeUser = null;

    // Selektory na hlavné elementy, s ktorými pracujeme
    const resultsList = document.querySelector('.search-results');
    const searchInput = document.querySelector('.search-container input');

    // Selektory pre nový login modál
    const loginOverlay = document.querySelector('#login-modal-overlay');
    const loginForm = document.querySelector('#login-form');
    const emailInput = document.querySelector('#email-input'); 
    const passwordInput = document.querySelector('#password-input'); 
    const loginErrorMsg = document.querySelector('#login-error-msg');

    // --- SELEKTORY PRE MODÁL MAZANIA ---
    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalMessage = deleteModalOverlay ? deleteModalOverlay.querySelector('p') : null;


    /**
     * Zaloguje pokus o prístup do Firebase/Firestore kolekcie 'access_logs'.
     * @param {string} email - E-mail použitý pri pokuse.
     * @param {Object|null} user - Objekt zamestnanca (ak bol nájdený).
     * @param {boolean} success - Či bol pokus úspešný (overený v Auth aj v DB).
     * @param {string|null} errorInfo - Chybová hláška (ak nastala).
     */
    async function logAccess(email, user, success, errorInfo) {
        try {
            const logData = {
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                email: email,
                success: success,
                error: errorInfo || null,
            };

            if (user) {
                logData.meno = `${user.titul || ''} ${user.meno} ${user.priezvisko}`.trim();
                logData.oec = user.oec || 'N/A';
                logData.funkcia = user.funkcia || 'N/A';
            }

            await db.collection("access_logs").add(logData);
            
            console.log('Log prístupu úspešne odoslaný do Firebase.');

        } catch (error) {
            console.error('Chyba pri odosielaní logu do Firebase:', error);
        }
    }


    /**
     * Zobrazí modál a čaká na prihlásenie e-mailom a heslom.
     */
    async function handleLogin() {
        return new Promise((resolve, reject) => {

            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                loginErrorMsg.style.display = 'none'; 
                const email = emailInput.value.trim();
                const password = passwordInput.value.trim();

                if (!email || !password) {
                    loginErrorMsg.textContent = 'Zadajte e-mail aj heslo.';
                    loginErrorMsg.style.display = 'block';
                    return;
                }

                try {
                    console.log(`Pokus o prihlásenie pre: ${email}`);
                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    console.log("Firebase Auth: Prihlásenie úspešné.", userCredential.user.uid);

                    console.log("Načítavam zamestnancov z Firebase (kolekcia 'employees')...");
                    const querySnapshot = await db.collection("employees").get();

                    const employees = [];
                    querySnapshot.forEach((doc) => {
                        employees.push(doc.data());
                    });
                    console.log(`Načítaných ${employees.length} zamestnancov.`);

                    if (employees.length === 0) {
                        throw new Error('Neboli nájdení žiadni zamestnanci v databáze.');
                    }

                    const loggedInUser = employees.find(emp => 
                            emp.mail && emp.mail.toLowerCase() === email.toLowerCase()
                        );

                    if (!loggedInUser) {
                        console.error(`Používateľ ${email} bol prihlásený, ale nenájdený v databáze zamestnancov.`);
                        throw new Error('Účet nie je priradený k zamestnancovi.');
                    }

                    await logAccess(email, loggedInUser, true, null);

                    const isVedúci = loggedInUser.funkcia === 'vedúci oddelenia' || loggedInUser.funkcia === 'vedúci odboru';

                    if (isVedúci) {
                        loginOverlay.classList.add('hidden'); 
                        resolve({ allEmployeesData: employees, currentUser: loggedInUser });
                    } else {
                        throw new Error('Prístup zamietnutý (nedostatočné oprávnenia).');
                    }

                } catch (error) {
                    console.error("Chyba pri prihlásení:", error);
                    let msg = 'prístup zamietnutý';
                    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                        msg = 'Nesprávny e-mail alebo heslo.';
                    } else if (error.message) {
                        msg = error.message; 
                    }

                    loginErrorMsg.textContent = msg;
                    loginErrorMsg.style.display = 'block';

                    await logAccess(email, null, false, msg);

                    passwordInput.value = ''; 
                    await auth.signOut();
                }
            });

            loginOverlay.addEventListener('click', (e) => {
                if (e.target === loginOverlay) {
                    // Neurobíme nič
                }
            });
        });
    }


    /**
     * Stiahne logy prístupu z Firestore a vygeneruje XLSX súbor.
     * Použije modál na zobrazenie statusu.
     */
    async function downloadAccessLogs() {
        const userInitialsButton = document.querySelector('#sidebar-user-initials');
        
        if (!userInitialsButton || userInitialsButton.classList.contains('downloading')) {
            return; 
        }

        console.log('Iniciujem sťahovanie logov...');
        
        // Resetujeme a zobrazíme modál pre status
        if (!deleteModalOverlay || !modalMessage || !modalBtnConfirmDelete || !modalBtnCancel) return;
        
        modalMessage.textContent = 'Pripravujem sťahovanie logov prístupu. Môže to chvíľu trvať...';
        modalBtnConfirmDelete.classList.add('hidden'); // Skryjeme tlačidlo mazania
        modalBtnCancel.textContent = 'Zatvoriť'; // Zmeníme text tlačidla Zrušiť
        modalBtnCancel.classList.remove('hidden');
        modalBtnCancel.disabled = false;
        deleteModalOverlay.classList.remove('hidden'); 
        
        userInitialsButton.classList.add('downloading'); 

        try {
            const snapshot = await db.collection("access_logs").orderBy("timestamp", "desc").get();
            
            if (snapshot.empty) {
                if(modalMessage) modalMessage.textContent = 'Nenašli sa žiadne logy prístupu.';
                userInitialsButton.classList.remove('downloading'); 
                return;
            }

            const headers = ["Časová pečiatka", "E-mail", "Meno", "OEČ", "Funkcia", "Stav", "Chybová hláška"];
            const data = snapshot.docs.map(doc => {
                const log = doc.data();
                let timestampStr = "N/A";
                if (log.timestamp && log.timestamp.toDate) {
                    timestampStr = log.timestamp.toDate().toLocaleString('sk-SK');
                }
                return [
                    timestampStr, log.email || '', log.meno || '---', log.oec || '---',
                    log.funkcia || '---', log.success ? 'ÚSPECH' : 'ZLYHANIE', log.error || ''
                ];
            });
            const sheetData = [headers, ...data];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            ws['!cols'] = [
                { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 10 },
                { wch: 20 }, { wch: 10 }, { wch: 40 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, "Logy Prístupov");
            XLSX.writeFile(wb, "access_logs_OKR.xlsx");
            
            if(modalMessage) modalMessage.textContent = 'Logy boli úspešne stiahnuté.';

        } catch (error) {
            console.error('Chyba pri sťahovaní logov:', error);
            if(modalMessage) modalMessage.textContent = 'Nastala chyba pri sťahovaní logov. Skontrolujte konzolu prehliadača.';
        } finally {
            userInitialsButton.classList.remove('downloading');
        }
    }

    // --- FUNKCIE PRE MAZANIE LOGOV ---

    /**
     * Efektívne zmaže všetky dokumenty v kolekcii 'access_logs' pomocou dávok (batches).
     */
    async function executeBatchDelete() {
        console.log('Spúšťam mazanie logov...');
        if (!modalMessage || !modalBtnConfirmDelete || !modalBtnCancel) return;

        modalMessage.textContent = 'Prebieha mazanie logov... Prosím, nezatvárajte okno.';
        modalBtnConfirmDelete.disabled = true;
        modalBtnCancel.disabled = true;
        modalBtnConfirmDelete.classList.add('loading');

        try {
            const query = db.collection("access_logs");
            const snapshot = await query.get();

            if (snapshot.empty) {
                console.log('Žiadne logy na mazanie.');
                modalMessage.textContent = 'Nenašli sa žiadne logy na mazanie.';
                return;
            }

            const batchSize = 500;
            let batches = [];
            let currentBatch = db.batch();
            let i = 0;

            snapshot.docs.forEach(doc => {
                currentBatch.delete(doc.ref);
                i++;
                if (i === batchSize) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    i = 0;
                }
            });

            if (i > 0) {
                batches.push(currentBatch);
            }

            console.log(`Pripravených ${batches.length} dávok na mazanie ${snapshot.size} dokumentov.`);

            for (const batch of batches) {
                await batch.commit();
            }

            console.log('Všetky logy boli úspešne zmazané.');
            modalMessage.textContent = `Všetky logy (${snapshot.size} záznamov) boli úspešne zmazané.`;

        } catch (error) {
            console.error('Chyba pri mazaní logov:', error);
            modalMessage.textContent = 'Nastala chyba pri mazaní logov. Skontrolujte konzolu a Firebase pravidlá.';
        } finally {
            modalBtnConfirmDelete.classList.remove('loading');
            modalBtnConfirmDelete.disabled = false;
            modalBtnCancel.disabled = false;
            modalBtnConfirmDelete.classList.add('hidden'); 
            modalBtnCancel.textContent = 'Zatvoriť'; 
        }
    }

    /**
     * Zobrazí modál pre potvrdenie mazania (po pravom kliku).
     */
    function handleDeleteLogsRequest(event) {
        event.preventDefault(); // Zabrání zobrazeniu kontextového menu prehliadača
        console.log('Požiadavka na mazanie logov (pravý klik)...');

        if (!deleteModalOverlay || !modalMessage || !modalBtnConfirmDelete || !modalBtnCancel) {
            console.error('Chýbajú elementy modálu pre mazanie.');
            return;
        }

        // Resetujeme modál do pôvodného stavu pre mazanie
        modalMessage.innerHTML = 'Naozaj chcete permanentne zmazať <strong>všetky</strong> logy prístupu? Táto akcia je nezvratná.';
        modalBtnConfirmDelete.classList.remove('hidden', 'loading');
        modalBtnConfirmDelete.disabled = false;
        modalBtnCancel.classList.remove('hidden');
        modalBtnCancel.disabled = false;
        modalBtnCancel.textContent = 'Zrušiť';

        deleteModalOverlay.classList.remove('hidden');
    }

    /**
     * Skryje modál mazania/statusu.
     */
    function hideDeleteModal() {
        if (deleteModalOverlay) {
            deleteModalOverlay.classList.add('hidden');
        }
    }

    // Priradíme listenery na tlačidlá modálu
    if (modalBtnCancel) {
        modalBtnCancel.addEventListener('click', hideDeleteModal);
    }
    if (modalBtnConfirmDelete) {
        modalBtnConfirmDelete.addEventListener('click', executeBatchDelete);
    }
    // --- KONIEC FUNKCIÍ PRE MAZANIE ---


    /**
     * Hlavná funkcia na načítanie zvyšných dát (tarify a opisy práce) z Firebase
     */
    async function loadData(loadedEmployees, currentUser) { 
        activeUser = currentUser;

        // --- UPRAVENÁ SEKCA PRE AKTIVÁCIU TLAČIDIEL (ĽAVÝ + PRAVÝ KLIK) ---
        if (activeUser && activeUser.funkcia === 'vedúci odboru') {
            
            const userInitialsButton = document.querySelector('#sidebar-user-initials');
            
            if (userInitialsButton) {
                userInitialsButton.classList.add('clickable-logs'); 
                
                // Aktualizujeme titulok (title)
                userInitialsButton.setAttribute('title', 'Ľavý klik: stiahnuť logy\nPravý klik: zmazať logy'); 
                
                // Pridáme listener na ĽAVÝ klik (stiahnutie)
                userInitialsButton.addEventListener('click', downloadAccessLogs);
                
                // Pridáme listener na PRAVÝ klik (mazanie)
                userInitialsButton.addEventListener('contextmenu', handleDeleteLogsRequest);
            }
        }
        // --- KONIEC ÚPRAVY ---

        try {
            
            if (currentUser && currentUser.funkcia === 'vedúci oddelenia') {
                allEmployees = loadedEmployees.filter(emp => emp.oddelenie === currentUser.oddelenie);
            } else {
                allEmployees = loadedEmployees;
            }

            const employeeCountDisplay = document.querySelector('#employee-count-display');
            if (employeeCountDisplay) {
                employeeCountDisplay.textContent = `Počet zamestnancov: ${allEmployees.length}`;
            }

            console.log("Načítavam platové tarify z Firebase (kolekcia 'payments')...");
            const paymentSnapshot = await db.collection("payments").get(); 
            
            paymentGrades.clear(); 
            paymentSnapshot.forEach(doc => {
                const item = doc.data();
                if (item.platova_trieda !== undefined && item.platova_tarifa !== undefined) {
                    paymentGrades.set(item.platova_trieda, parseFloat(item.platova_tarifa));
                }
            });
            console.log(`Načítaných ${paymentGrades.size} platových taríf.`);


            console.log("Načítavam opisy práce z Firebase (kolekcia 'jobDescriptions')...");
            const jobDescSnapshot = await db.collection("jobDescriptions").get(); 
            
            jobDescriptions = {}; 
            jobDescSnapshot.forEach((doc) => {
                jobDescriptions[doc.id] = doc.data(); 
            });
            console.log(`Načítaných ${Object.keys(jobDescriptions).length} opisov práce.`);

            
            populateEmployeeList(allEmployees);
            
            if (currentUser) {
                displayEmployeeDetails(currentUser);
                
                const userLi = resultsList.querySelector(`li[data-oec="${currentUser.oec}"]`);
                if (userLi) {
                    userLi.classList.add('active');
                }
                updateSidebarUser(currentUser);
                
            } else if (allEmployees.length > 0) {
                displayEmployeeDetails(allEmployees[0]);
                resultsList.querySelector('li')?.classList.add('active');
            }

        } catch (error) {
            console.error('Nepodarilo sa načítať dáta z Firebase:', error);
            resultsList.innerHTML = '<li>Chyba pri načítaní dát.</li>';
        }
    }

    /**
     * Funkcia, ktorá vyplní zoznam zamestnancov v ľavom paneli.
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

    /**
     * Pomocná funkcia na generovanie HTML pre opis služobnej činnosti.
     */
    function buildDescriptionHtml(data) {
        if (!data) return ''; 

        let html = '';
        const topMargin = 'style="margin-top: 1.5rem;"'; 

        if (data['Najnáročnejšia činnosť (charakteristika platovej triedy)']) {
            html += `<h3><b>Najnáročnejšia činnosť (charakteristika platovej triedy)</b></h3>`;
            if (Array.isArray(data['Najnáročnejšia činnosť (charakteristika platovej triedy)'])) {
                html += '<ul>';
                data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                html += `<p>${data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
            }
        }
        
        if (data['Bližšie určená najnáročnejšia činnosť']) {
            html += `<h3 ${topMargin}><b>Bližšie určená najnáročnejšia činnosť</b></h3>`;
            
            if (Array.isArray(data['Bližšie určená najnáročnejšia činnosť'])) {
                html += '<ul>';
                data['Bližšie určená najnáročnejšia činnosť'].forEach(item => {
                    if (item === "Ďalej: ") {
                        html += `<li class="list-subheading">${item}</li>`;
                    } else {
                        const style = item.trim().startsWith('na úseku') ? ' style="margin-left: 20px;"' : '';
                        html += `<li${style}>${item}</li>`;
                    }
                });
                html += '</ul>';
            } else {
                let textBlock = data['Bližšie určená najnáročnejšia činnosť'];
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }

        if (data['Ďalšia činnosť (charakteristika platovej triedy)']) {
            html += `<h3 ${topMargin}><b>Ďalšia činnosť (charakteristika platovej triedy)</b></h3>`;
            if (Array.isArray(data['Ďalšia činnosť (charakteristika platovej triedy)'])) {
                 html += '<ul>';
                data['Ďalšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                html += `<p>${data['Ďalšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
            }
        }

        if (data['Bližšie určená ďalšia činnosť']) {
            html += `<h3 ${topMargin}><b>Bližšie určená ďalšia činnosť</b></h3>`;

            if (Array.isArray(data['Bližšie určená ďalšia činnosť'])) {
                html += '<ul>';
                data['Bližšie určená ďalšia činnosť'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                let textBlock = data['Bližšie určená ďalšia činnosť'];
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }
        
        if (data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre']) {
            html += `<h3 ${topMargin}><b>Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre</b></h3>`;
            
            if (Array.isArray(data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'])) {
                html += '<ul>';
                data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'].forEach(item => {
                    html += `<li>${item}</li>`;
                });
                html += '</ul>';
            } else {
                let textBlock = data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'];
                textBlock = textBlock.replace(/\n/g, '<br>');
                html += `<p>${textBlock}</p>`;
            }
        }
        
        return html;
    }

    /**
     * Zobrazí detaily vybraného zamestnanca v hlavnom obsahovom okne.
     */
    function displayEmployeeDetails(employee) {
        
        document.querySelector('.employee-header h1').textContent = `${employee.titul} ${employee.meno} ${employee.priezvisko}`;
        document.querySelector('.employee-id').textContent = `Osobné číslo: ${employee.oec}`;

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
        
        const serviceCard = document.querySelector('#service-description-card');
        if (serviceCard) {
            
            let opisCinnostiHtml = '';
            const baseKey = employee.kod; 
            let effectiveKey = baseKey; 
            let baseData = jobDescriptions[baseKey];

            // ...
        if (!baseData) {
            // Použijeme (==) pre porovnanie, aby fungovalo "5" == 5
            if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 5) {
                effectiveKey = '5_ISZ';
            } 
            else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 6) {
                effectiveKey = '6_ISZ';
            }
            // Doplnené chýbajúce podmienky pre OCOaKP
            else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 5) {
                effectiveKey = '5_OCOaKP';
            } 
            else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 6) {
                effectiveKey = '6_OCOaKP';
            }
            
            // Až teraz priradíme baseData na základe správneho effectiveKey
            baseData = jobDescriptions[effectiveKey];
        }

            let descriptionDataToShow; 

            if (!baseData) {
                opisCinnostiHtml = `<p>Opis služobnej činnosti pre tohto zamestnanca (kód: ${baseKey}) zatiaľ nebol zadaný.</p>`;
                descriptionDataToShow = null; 
            } else {
                descriptionDataToShow = JSON.parse(JSON.stringify(baseData));
                let keyToCompare = null;

                if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 5) {
                    keyToCompare = '5_OCOaKP';
                } 
                else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 6) {
                    keyToCompare = '6_OCOaKP';
                }
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 5) {
                    keyToCompare = '5_ISZ';
                }
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 6) {
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
                                    const processedBase = String(baseSection).replace(/\n/g, '<br>');
                                    const processedAdd = String(addSection).replace(/\n/g, '<br>');
                                    descriptionDataToShow[sectionKey] = processedBase + "<br><br>" + processedAdd;
                                }
                            }
                        }
                    }
                }
                
                opisCinnostiHtml = buildDescriptionHtml(descriptionDataToShow);
            }
            
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
     */
    function clearEmployeeDetails() {
        document.querySelector('.employee-header h1').textContent = '---';
        document.querySelector('.employee-id').textContent = 'Osobné číslo: ---';

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
     * Aktualizuje informácie o prihlásenom používateľovi v päte sidebaru.
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

    // 1. Reagovanie na kliknutie v zozname zamestnancov
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

    // 2. Reagovanie na písanie do vyhľadávacieho poľa
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

    // 3. Reagovanie na kliknutie "Odhlásiť sa" (v hlavičke)
    const logoutBtn = document.querySelector('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            window.location.reload();
        });
    }

    // 4. Reagovanie na kliknutie "Pracovné zaradenie" (Otvorenie novej karty)
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
    //  == FUNKCIONALITA (5.): EXCEL EXPORT
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

            const sheetData = [headers, ...data];

            try {
                const wb = XLSX.utils.book_new();
                
                const ws = XLSX.utils.aoa_to_sheet(sheetData);

                ws['!cols'] = [
                    { wch: 5 },  // Por. číslo
                    { wch: 22 }, // Oddelenie
                    { wch: 18 }, // Funkcia
                    { wch: 9 }, // Kód
                    { wch: 9 }, // OEČ
                    { wch: 9 },  // Titul
                    { wch: 15 }, // Meno
                    { wch: 18 }, // Priezvisko
                    { wch: 18 }, // Adresa
                    { wch: 18 }, // Služobný
                    { wch: 18 }, // Súkromný
                    { wch: 9 }, // Nástup
                    { wch: 9 }  // Pl. trieda
                ];
                
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
                
                XLSX.utils.book_append_sheet(wb, ws, "Zoznam zamestnancov");
                
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

            } catch (error) {
                console.error('Chyba pri vytváraní XLSX súboru:', error);
                alert('Nastala chyba pri vytváraní súboru.');
            }
        });
    }
    // 
    //  ================================================================
    //  == KONIEC FUNKCIONALITY (5.): EXCEL EXPORT
    //  ================================================================
    //

    /**
     * Hlavný spúšťač aplikácie
     */
    async function initializeApp() { 
        try {
            const authData = await handleLogin();
            
            if (authData) {
                await loadData(authData.allEmployeesData, authData.currentUser); 
            } else {
                document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Prístup zamietnutý.</h1>';
            }
        } catch (error) {
            console.error("Kritická chyba pri inicializácii aplikácie:", error);
            document.body.innerHTML = `<h1 style="padding: 2rem; text-align: center;">Kritická chyba aplikácie: ${error.message}.</h1>`;
        }
    }

    // --- SPUSTENIE ---
    initializeApp();

});
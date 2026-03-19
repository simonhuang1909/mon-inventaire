// app.js

const SUPABASE_URL = 'https://mptpfexprgiyuhezezja.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdHBmZXhwcmdpeXVoZXplemphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzYzMTQsImV4cCI6MjA4OTUxMjMxNH0.77MH_rBspgnDD1C1upRhMqIIzjcE5LaDFe6bEpaF6s0';
const ID_COFFRE = 'mon_inventaire_principal';

let supabaseClient = null;
let erreurConfiguration = "";

try {
    if (SUPABASE_URL.startsWith('http')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        erreurConfiguration = "Veuillez entrer une URL valide (commençant par https://) dans le code.";
    }
} catch(e) {
    erreurConfiguration = "Erreur de configuration Supabase. Vérifiez vos clés dans le code.";
}

const { createApp, ref, computed, nextTick, onMounted, watch } = Vue;

createApp({
    setup() {
        const estDeverrouille = ref(false);
        const motDePasseSaisi = ref('');
        const estNouveauCoffre = ref(false);
        const motDePasseConfirmation = ref('');
        const verificationInitialeEnCours = ref(true);

        const motDePasseValide = ref('');
        const chargementEnCours = ref(false);
        const erreurMotDePasse = ref('');
        const statutSauvegarde = ref('À jour');
        let telechargementInitialEnCours = true; 
        
        const receptionEnDirect = ref(false);

        const nomInventaire = ref("Gestion d'Inventaire");
        const formNomInventaire = ref("");

        const inventaire = ref([]);
        const utilisateurs = ref([]); 
        const utilisateurCourant = ref(null); 
        const nouveauNomUtilisateur = ref(''); 
        
        const chiffrer = (donneesObj, mdp) => CryptoJS.AES.encrypt(JSON.stringify(donneesObj), mdp).toString();
        
        const dechiffrer = (texteChiffre, mdp) => {
            try {
                const bytes = CryptoJS.AES.decrypt(texteChiffre, mdp);
                const texteDechiffre = bytes.toString(CryptoJS.enc.Utf8);
                if (!texteDechiffre) throw new Error("Mot de passe incorrect");
                return JSON.parse(texteDechiffre);
            } catch (e) {
                throw new Error("Impossible de déchiffrer. Mauvais mot de passe ?");
            }
        };

        const chargerDonnees = (payload) => {
            if (Array.isArray(payload)) {
                inventaire.value = payload;
                nomInventaire.value = "Gestion d'Inventaire";
                utilisateurs.value = [];
            } else {
                inventaire.value = payload.articles || [];
                nomInventaire.value = payload.nom || "Gestion d'Inventaire";
                utilisateurs.value = payload.utilisateurs || [];
            }
        };

        onMounted(async () => {
            if (supabaseClient) {
                try {
                    const { data, error } = await supabaseClient.from('coffres').select('donnees_chiffrees').eq('id', ID_COFFRE).single();
                    
                    if (error && error.code === 'PGRST116') {
                        estNouveauCoffre.value = true;
                    } else if (data && !data.donnees_chiffrees) {
                        estNouveauCoffre.value = true;
                    } else {
                        estNouveauCoffre.value = false;
                    }
                } catch(e) {
                    erreurConfiguration = "Erreur de connexion à la base de données.";
                } finally {
                    verificationInitialeEnCours.value = false;
                }
            } else {
                verificationInitialeEnCours.value = false;
            }
        });

        const ecouterChangements = () => {
            supabaseClient
                .channel('changements-coffre')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'coffres', filter: `id=eq.${ID_COFFRE}` },
                    (payload) => {
                        if (payload.new && payload.new.donnees_chiffrees) {
                            try {
                                statutSauvegarde.value = 'Synchro en cours...';
                                receptionEnDirect.value = true;
                                
                                const donneesDecryptees = dechiffrer(payload.new.donnees_chiffrees, motDePasseValide.value);
                                chargerDonnees(donneesDecryptees);

                                nextTick(() => {
                                    receptionEnDirect.value = false;
                                    statutSauvegarde.value = 'À jour';
                                });
                            } catch (e) {
                                console.error("Impossible de déchiffrer le paquet entrant.");
                            }
                        }
                    }
                )
                .subscribe();
        };

        const deverrouillerCoffre = async () => {
            if (!motDePasseSaisi.value || !supabaseClient) return;

            if (estNouveauCoffre.value) {
                if (motDePasseSaisi.value !== motDePasseConfirmation.value) {
                    erreurMotDePasse.value = "Les mots de passe ne correspondent pas.";
                    return;
                }
                chargementEnCours.value = true; 
                erreurMotDePasse.value = ''; 
                
                inventaire.value = []; 
                utilisateurs.value = [];
                nomInventaire.value = formNomInventaire.value || "Mon Inventaire";
                motDePasseValide.value = motDePasseSaisi.value;
                
                const payloadSauvegarde = { nom: nomInventaire.value, articles: inventaire.value, utilisateurs: utilisateurs.value };
                const texteChiffre = chiffrer(payloadSauvegarde, motDePasseValide.value);
                
                await supabaseClient.from('coffres').upsert({ id: ID_COFFRE, donnees_chiffrees: texteChiffre });
                
                estDeverrouille.value = true;
                chargementEnCours.value = false;
                setTimeout(() => { 
                    telechargementInitialEnCours = false; 
                    ecouterChangements(); 
                }, 500); 
                return;
            }

            chargementEnCours.value = true;
            erreurMotDePasse.value = '';

            try {
                const { data, error } = await supabaseClient.from('coffres').select('donnees_chiffrees').eq('id', ID_COFFRE).single();
                if (error && error.code !== 'PGRST116') throw new Error("Erreur de connexion à Supabase.");
                
                if (data && data.donnees_chiffrees) { 
                    const donneesDecryptees = dechiffrer(data.donnees_chiffrees, motDePasseSaisi.value);
                    chargerDonnees(donneesDecryptees);
                }
                
                motDePasseValide.value = motDePasseSaisi.value;
                estDeverrouille.value = true;
            } catch (e) {
                erreurMotDePasse.value = e.message;
            } finally {
                chargementEnCours.value = false;
                setTimeout(() => { 
                    telechargementInitialEnCours = false; 
                    ecouterChangements(); 
                }, 500); 
            }
        };

        watch([inventaire, nomInventaire, utilisateurs], async ([nouvelInventaire, nouveauNom, nouveauxUtilisateurs]) => {
            if (telechargementInitialEnCours || !estDeverrouille.value || !supabaseClient) return; 
            if (receptionEnDirect.value) return; 

            statutSauvegarde.value = 'Sauvegarde...';
            
            const payloadSauvegarde = { nom: nouveauNom, articles: nouvelInventaire, utilisateurs: nouveauxUtilisateurs };
            const texteChiffre = chiffrer(payloadSauvegarde, motDePasseValide.value);
            
            const { error } = await supabaseClient.from('coffres').upsert({ id: ID_COFFRE, donnees_chiffrees: texteChiffre });

            if (!error) statutSauvegarde.value = 'À jour';
            else { statutSauvegarde.value = 'Erreur ❌'; console.error(error); }
        }, { deep: true });

        const creerUtilisateur = () => {
            const nom = nouveauNomUtilisateur.value.trim();
            if (!nom) return;
            if (!utilisateurs.value.find(u => u.nom.toLowerCase() === nom.toLowerCase())) {
                utilisateurs.value.push({ nom: nom, favoris: [] });
            }
            utilisateurCourant.value = nom; 
            nouveauNomUtilisateur.value = '';
        };

        const choisirUtilisateur = (nom) => {
            utilisateurCourant.value = nom;
        };

        const afficherModaleSuppressionProfil = ref(false);
        const profilASupprimer = ref(null);

        const supprimerUtilisateur = (nom) => {
            profilASupprimer.value = nom;
            afficherModaleSuppressionProfil.value = true;
        };

        const fermerModaleSuppressionProfil = () => {
            afficherModaleSuppressionProfil.value = false;
            profilASupprimer.value = null;
        };

        const confirmerSuppressionProfil = () => {
            if (profilASupprimer.value) {
                utilisateurs.value = utilisateurs.value.filter(u => u.nom !== profilASupprimer.value);
                if (utilisateurCourant.value === profilASupprimer.value) {
                    utilisateurCourant.value = null;
                }
            }
            fermerModaleSuppressionProfil();
        };

        const estFavori = (idElement) => {
            if (!utilisateurCourant.value) return false;
            const u = utilisateurs.value.find(u => u.nom === utilisateurCourant.value);
            return u ? u.favoris.includes(idElement) : false;
        };

        const basculerFavori = (idElement) => {
            const u = utilisateurs.value.find(u => u.nom === utilisateurCourant.value);
            if (u) {
                if (u.favoris.includes(idElement)) {
                    u.favoris = u.favoris.filter(id => id !== idElement);
                } else {
                    u.favoris.push(idElement);
                }
            }
        };

        const elementsFavoris = computed(() => {
            if (!utilisateurCourant.value) return [];
            const u = utilisateurs.value.find(u => u.nom === utilisateurCourant.value);
            if (!u) return [];
            return inventaire.value.filter(el => u.favoris.includes(el.id));
        });

        const allerVersFavori = (element) => {
            if (element.type === 'dossier') { ouvrirDossier(element.id); } 
            else if (element.type === 'produit') { allerVersProduit(element.id, element.parentId); }
        };

        const genererPDF = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(18);
            const titreDoc = nomInventaire.value || "Inventaire";
            doc.text(titreDoc, 14, 22);
            
            const lignesData = [];
            
            const parcourirDossier = (parentId, niveau) => {
                const enfants = inventaire.value.filter(el => 
                    el.parentId === parentId && 
                    (el.type === 'dossier' || el.type === 'produit')
                );
                
                enfants.sort((a, b) => {
                    if (a.type === b.type) return a.nom.localeCompare(b.nom);
                    return a.type === 'dossier' ? -1 : 1;
                });

                enfants.forEach(el => {
                    const espace = niveau > 0 ? "    ".repeat(niveau - 1) + "  |- " : "";
                    
                    if (el.type === 'dossier') {
                        lignesData.push([
                            { content: espace + el.nom.toUpperCase(), styles: { fontStyle: 'bold' } }, 
                            "-", 
                            "-"
                        ]);
                        parcourirDossier(el.id, niveau + 1);
                    } else if (el.type === 'produit') {
                        const total = getQuantiteTotale(el.id);
                        const estCritique = el.seuil > 0 && total < el.seuil;
                        
                        lignesData.push([
                            espace + el.nom, 
                            el.seuil ? el.seuil.toString() : "-", 
                            { 
                                content: total.toString(), 
                                styles: estCritique ? { textColor: [220, 38, 38], fontStyle: 'bold' } : {}
                            }
                        ]);
                    }
                });
            };

            parcourirDossier(null, 0);

            doc.autoTable({
                startY: 30,
                head: [['Élément', 'Seuil', 'En stock']],
                body: lignesData,
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    textColor: [0, 0, 0],
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                    cellPadding: 1.5,
                    fontSize: 9
                },
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],       
                    fontStyle: 'bold',
                    lineWidth: 0.3,
                },
                alternateRowStyles: {
                    fillColor: [255, 255, 255],
                }
            });

            doc.save(titreDoc + ".pdf");
        };

        const dossierActuel = ref(null); const produitOuvert = ref(null); const zoneGlissante = ref(null);
        const afficherModaleCreation = ref(false); const formType = ref('dossier'); const formNom = ref(''); const formSeuil = ref(0);
        const afficherModaleLot = ref(false); const formLotQuantite = ref(1); const formLotDate = ref(''); const formLotNom = ref(''); const formLotNotes = ref(''); const produitCibleLot = ref(null); const inputDateLot = ref(null); 
        const afficherModaleSuppression = ref(false); const elementASupprimer = ref(null);
        const afficherModaleErreurSuppression = ref(false);

        const afficherModaleEdition = ref(false);
        const elementAEditer = ref(null);
        const formEditionNom = ref('');
        const formEditionSeuil = ref(0);

        const genererId = () => Math.random().toString(36).substr(2, 9);
        const estPerime = (dateString) => { if (!dateString) return false; const d = new Date(dateString); const a = new Date(); a.setHours(0,0,0,0); return d <= a; };
        const formaterDate = (dateString) => { if (!dateString) return ''; const p = dateString.split('-'); if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`; return dateString; };

        const alertesStock = computed(() => inventaire.value.filter(el => el.type === 'produit' && el.seuil > 0 && getQuantiteTotale(el.id) < el.seuil));
        
        const alertesPeremption = computed(() => { const lotsPerimes = inventaire.value.filter(el => el.type === 'article' && el.quantite > 0 && estPerime(el.datePeremption)); return lotsPerimes.map(lot => { const p = inventaire.value.find(p => p.id === lot.parentId); return { ...lot, nomProduit: p ? p.nom : 'Inconnu', dossierParentId: p ? p.parentId : null }; }); });
        const elementsCourants = computed(() => inventaire.value.filter(el => (el.type === 'dossier' || el.type === 'produit') && el.parentId === dossierActuel.value));
        const nomDossierCourant = computed(() => { if (dossierActuel.value === null) return "Vue d'ensemble"; const d = inventaire.value.find(el => el.id === dossierActuel.value); return d ? d.nom : ""; });
        const filAriane = computed(() => { let chemin = []; let id = dossierActuel.value; while(id !== null) { let d = inventaire.value.find(e=>e.id===id); if(d){chemin.unshift(d); id=d.parentId;}else break; } return chemin; });

        const getLots = (id) => inventaire.value.filter(e => e.type === 'article' && e.parentId === id);
        const getQuantiteTotale = (id) => getLots(id).reduce((sum, lot) => sum + lot.quantite, 0);

        const ouvrirDossier = (id) => { dossierActuel.value = id; produitOuvert.value = null; };
        const allerAccueil = () => { dossierActuel.value = null; produitOuvert.value = null; };
        const basculerProduit = (id) => { produitOuvert.value = produitOuvert.value === id ? null : id; };

        const allerVersProduit = async (produitId, dossierId) => {
            dossierActuel.value = dossierId; produitOuvert.value = produitId;
            await nextTick();
            const element = document.getElementById('produit-ouvert');
            if(element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        watch(() => [estDeverrouille.value, utilisateurCourant.value], async ([estConnecte, profil]) => {
            if (estConnecte && profil) {
                await nextTick();
                if (zoneGlissante.value) {
                    Sortable.create(zoneGlissante.value, {
                        handle: '.poignee-drag', animation: 150, delay: 200, delayOnTouchOnly: true, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
                        onEnd: (evt) => {
                            if (evt.oldIndex === evt.newIndex) return;
                            const listeAffichee = [...elementsCourants.value];
                            const [elementDeplace] = listeAffichee.splice(evt.oldIndex, 1);
                            listeAffichee.splice(evt.newIndex, 0, elementDeplace);
                            const autresElements = inventaire.value.filter(el => !((el.type === 'dossier' || el.type === 'produit') && el.parentId === dossierActuel.value));
                            inventaire.value = [...autresElements, ...listeAffichee];
                        }
                    });
                }
            }
        });

        const modifierQuantite = (lot, delta) => { if (lot.quantite + delta < 0) return; lot.quantite += delta; };

        const ouvrirModaleSuppression = (id) => { 
            const contientEnfants = inventaire.value.some(el => el.parentId === id); 
            if (contientEnfants) { 
                afficherModaleErreurSuppression.value = true; 
                return; 
            } 
            elementASupprimer.value = id; 
            afficherModaleSuppression.value = true; 
        };
        
        const fermerModaleErreurSuppression = () => { afficherModaleErreurSuppression.value = false; };
        const fermerModaleSuppression = () => { afficherModaleSuppression.value = false; elementASupprimer.value = null; };
        const confirmerSuppression = () => { if(elementASupprimer.value) inventaire.value = inventaire.value.filter(el => el.id !== elementASupprimer.value); fermerModaleSuppression(); };

        const ouvrirModaleCreation = () => { formType.value = 'dossier'; formNom.value = ''; formSeuil.value = 0; afficherModaleCreation.value = true; };
        const fermerModaleCreation = () => { afficherModaleCreation.value = false; };
        const validerCreation = () => { if (!formNom.value.trim()) return; if (formType.value === 'dossier') inventaire.value.push({ id: 'dos_' + genererId(), nom: formNom.value.trim(), parentId: dossierActuel.value, type: 'dossier' }); else if (formType.value === 'produit') inventaire.value.push({ id: 'prod_' + genererId(), nom: formNom.value.trim(), parentId: dossierActuel.value, seuil: parseInt(formSeuil.value) || 0, type: 'produit' }); fermerModaleCreation(); };

        const ouvrirModaleEdition = (element) => {
            elementAEditer.value = element;
            formEditionNom.value = element.nom;
            if (element.type === 'produit') {
                formEditionSeuil.value = element.seuil || 0;
            }
            afficherModaleEdition.value = true;
        };

        const fermerModaleEdition = () => {
            afficherModaleEdition.value = false;
            elementAEditer.value = null;
        };

        const validerEdition = () => {
            if (!formEditionNom.value.trim() || !elementAEditer.value) return;
            const index = inventaire.value.findIndex(el => el.id === elementAEditer.value.id);
            if (index !== -1) {
                inventaire.value[index].nom = formEditionNom.value.trim();
                if (inventaire.value[index].type === 'produit') {
                    inventaire.value[index].seuil = parseInt(formEditionSeuil.value) || 0;
                }
            }
            fermerModaleEdition();
        };

        const ouvrirModaleLot = async (id) => { produitCibleLot.value = id; formLotQuantite.value = 1; formLotDate.value = ''; formLotNom.value = ''; formLotNotes.value = ''; afficherModaleLot.value = true; await nextTick(); flatpickr(inputDateLot.value, { locale: "fr", dateFormat: "Y-m-d", altInput: true, altFormat: "d/m/Y", allowInput: true, onChange: function(selectedDates, dateStr) { formLotDate.value = dateStr; }}); };
        const fermerModaleLot = () => { afficherModaleLot.value = false; produitCibleLot.value = null; };
        const validerLot = () => { if (!produitCibleLot.value || formLotQuantite.value < 1) return; inventaire.value.push({ id: 'art_' + genererId(), parentId: produitCibleLot.value, quantite: parseInt(formLotQuantite.value), type: 'article', datePeremption: formLotDate.value ? formLotDate.value : null, nom: formLotNom.value.trim() !== "" ? formLotNom.value.trim() : null, notes: formLotNotes.value.trim() !== "" ? formLotNotes.value.trim() : null }); fermerModaleLot(); };

        return {
            erreurConfiguration, estDeverrouille, motDePasseSaisi, erreurMotDePasse, chargementEnCours, deverrouillerCoffre, statutSauvegarde, estNouveauCoffre, motDePasseConfirmation, verificationInitialeEnCours,
            nomInventaire, formNomInventaire, 
            utilisateurs, utilisateurCourant, nouveauNomUtilisateur, creerUtilisateur, choisirUtilisateur, supprimerUtilisateur, afficherModaleSuppressionProfil, profilASupprimer, fermerModaleSuppressionProfil, confirmerSuppressionProfil, 
            estFavori, basculerFavori, elementsFavoris, allerVersFavori, 
            inventaire, dossierActuel, produitOuvert, elementsCourants, nomDossierCourant, filAriane, getLots, getQuantiteTotale, ouvrirDossier, allerAccueil, basculerProduit, allerVersProduit, modifierQuantite, formaterDate, estPerime,
            ouvrirModaleSuppression, fermerModaleSuppression, confirmerSuppression, afficherModaleSuppression, afficherModaleErreurSuppression, fermerModaleErreurSuppression, 
            ouvrirModaleCreation, fermerModaleCreation, validerCreation, afficherModaleCreation, formType, formNom, formSeuil,
            afficherModaleEdition, formEditionNom, formEditionSeuil, ouvrirModaleEdition, fermerModaleEdition, validerEdition, elementAEditer,
            ouvrirModaleLot, fermerModaleLot, validerLot, afficherModaleLot, formLotQuantite, formLotDate, formLotNom, formLotNotes, inputDateLot, zoneGlissante, alertesStock, alertesPeremption,
            genererPDF
        }
    }
}).mount('#app');
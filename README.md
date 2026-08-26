# WESH GROW — Tableau de bord OCAPIAT

Tableau de bord interne pour suivre les dossiers de formation, factures et
paiements OCAPIAT de WESH GROW. Site statique (`index.html`), hébergeable
sur GitHub Pages, avec un mécanisme de marquage collaboratif ("dossier
arrêté/refusé") synchronisé via un Google Sheet partagé.

## Architecture

```
┌─────────────────┐      lit/écrit les       ┌──────────────────────┐      stocke dans      ┌──────────────────┐
│  GitHub Pages    │ ───  marquages "arrêté/──▶│  Google Apps Script  │ ────  un onglet   ───▶│   Google Sheet    │
│  (index.html)    │      refusé" (JSON)      │  (Web App / API)     │       "Overrides"      │  (partagé à 3     │
│  = ce repo        │◀──────────────────────── │  vérifie l'email     │◀───────────────────── │   adresses email) │
└─────────────────┘                            └──────────────────────┘                        └──────────────────┘
```

- **Les données OCAPIAT (dossiers, factures, virements)** sont intégrées en dur dans `index.html`
  au moment de la génération du tableau de bord. Pour les mettre à jour, il faut regénérer le
  fichier (voir section *Mettre à jour les données*).
- **Les marquages "arrêté/refusé"** (signalés par les collaborateurs car OCAPIAT ne met pas
  toujours à jour ses statuts) sont, eux, dynamiques : ils sont lus/écrits en temps réel via
  l'API Google Apps Script, elle-même adossée à un Google Sheet.
- **L'accès** est restreint à une liste fermée de 3 adresses e-mail, vérifiées côté serveur
  (Apps Script) à chaque appel — pas de mot de passe à gérer, ça s'appuie sur le compte Google
  Workspace de chaque personne.

## Déploiement — étape par étape

### 1. Créer le Google Sheet + l'API (Apps Script)

1. Va sur [sheets.google.com](https://sheets.google.com) et crée un nouveau classeur, par
   exemple **"WESH GROW — OCAPIAT overrides"**.
2. Dans ce classeur : **Extensions > Apps Script**.
3. Supprime le contenu par défaut de `Code.gs` et colle le contenu du fichier
   [`apps-script/Code.gs`](apps-script/Code.gs) de ce repo.
4. En haut du script, modifie la constante `ALLOWED_EMAILS` avec les 3 adresses e-mail
   réellement autorisées :
   ```js
   const ALLOWED_EMAILS = [
     'prenom1.nom1@wesh-grow.com',
     'prenom2.nom2@wesh-grow.com',
     'prenom3.nom3@wesh-grow.com',
   ];
   ```
5. Enregistre (icône disquette ou Ctrl+S).
6. Clique **Déployer > Nouveau déploiement**.
   - Type : **Application Web**
   - Description : `API overrides OCAPIAT`
   - Exécuter en tant que : **Moi** (ton compte)
   - Qui a accès : **Tous les utilisateurs de [ton domaine Google Workspace]**
     *(Ne choisis pas "Anyone" pour éviter qu'une personne hors de l'entreprise avec le lien
     puisse appeler l'API — même si `ALLOWED_EMAILS` la bloquerait ensuite, autant restreindre
     à la source.)*
7. Autorise les permissions demandées (accès à ce Sheet uniquement).
8. Copie l'**URL de l'application Web** obtenue (elle ressemble à
   `https://script.google.com/macros/s/AKfycb.../exec`).
9. Le premier appel créera automatiquement l'onglet **"Overrides"** avec les bonnes colonnes.

### 2. Partager le Google Sheet

Partage le classeur (bouton **Partager** en haut à droite) avec exactement les 3 adresses
listées dans `ALLOWED_EMAILS`, en droit **Lecteur** (l'écriture passe uniquement par l'API,
pas besoin de droit Éditeur sur le Sheet lui-même — mais tu peux donner Éditeur si tu veux
qu'elles puissent aussi consulter/corriger directement les lignes en cas de besoin).

### 3. Configurer le site avec l'URL de l'API

Ouvre `index.html` dans ce repo, cherche ce bloc (proche de la fin du fichier) :

```html
<script>
window.WG_CONFIG = {
  API_URL: '' // ex: 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec'
};
</script>
```

Colle l'URL copiée à l'étape 1.8 entre les quotes de `API_URL`, puis commit/push.

### 4. Déployer sur GitHub Pages

1. Pousse ce repo sur GitHub (`git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push`).
2. Sur GitHub : **Settings > Pages**.
3. Source : **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Sauvegarde. GitHub te donne une URL du type
   `https://<ton-org>.github.io/<nom-du-repo>/`.
5. Partage cette URL aux 3 collaborateurs autorisés.

> **Remarque sécurité** : GitHub Pages est public par défaut (n'importe qui avec le lien
> peut voir le site, y compris les données OCAPIAT intégrées en dur). Si les données doivent
> rester strictement confidentielles, utilise un **repo privé + GitHub Pages avec accès
> restreint** (nécessite GitHub Enterprise/Team) ou héberge plutôt le fichier sur un espace
> interne (Drive avec accès restreint, intranet, etc.) plutôt que GitHub Pages public.
> Le mécanisme de marquage "arrêté/refusé", lui, reste protégé côté Apps Script quoi qu'il
> arrive, car il vérifie l'email à chaque appel.

## Fonctionnement du marquage "arrêté/refusé"

- Chaque ligne de dossier a un bouton **"Marquer arrêté/refusé"**.
- Un clic demande une raison (texte libre, optionnel) puis enregistre le marquage.
- Le dossier disparaît des vues "En cours" / "En attente de paiement" / "Ruptures" et son
  montant sort du calcul du "Reste à percevoir" partout dans le tableau de bord.
- Il reste visible dans une section dédiée sur l'onglet Aperçu, avec la raison et la
  possibilité d'annuler le marquage.
- Le badge en haut à droite du site indique l'état de synchronisation :
  - 🟢 **Synchronisé** — connecté à l'API, les marquages sont partagés entre collaborateurs.
  - 🟠 **Non synchronisé** — API configurée mais injoignable (droits, réseau) : les
    changements restent en local sur cet appareil jusqu'à reconnexion.
  - ⚪ **Mode local** — `API_URL` non renseignée : fonctionne, mais rien n'est partagé.

## Mettre à jour les données OCAPIAT (dossiers/factures/virements)

Les données sont actuellement intégrées en dur dans `index.html` (blocs `DOSSIERS`,
`FACTURES`, `VIREMENTS` en JavaScript, en tête de la section `<script>`). Il n'y a pas
aujourd'hui de pipeline automatisé de mise à jour : à chaque nouvel export OCAPIAT, il faut
regénérer ces blocs et les recoller dans `index.html`. Si ce besoin devient fréquent, la
suite logique serait de déplacer ces données dans un autre onglet du même Google Sheet (ou
un Sheet dédié) et de les charger dynamiquement via la même API — dis-le si tu veux qu'on
fasse évoluer l'architecture dans ce sens.

## Fichiers du repo

- `index.html` — le site complet (structure, style, données, logique).
- `apps-script/Code.gs` — code à coller dans l'éditeur Apps Script du Google Sheet.
- `README.md` — ce fichier.

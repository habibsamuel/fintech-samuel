# Widget flottant de traduction Fulfulde

Widget front-end isolé pour ajouter à une page bancaire un bouton flottant déplaçable (souris et tactile), une traduction du texte visible et une restauration du texte d'origine. Le composant ne fournit ni opérations bancaires ni assistant conversationnel/vocal.

## Intégration

Copiez le dossier `fulfulde-widget/` sur le même domaine que la plateforme, puis chargez le module après le DOM :

```html
<script type="module" src="/assets/fulfulde-widget/widget.js"></script>
```

Le module injecte son propre Shadow DOM et charge `widget.css` relativement à son URL. Il peut aussi être prévisualisé en ouvrant `index.html` via un serveur HTTP local (les modules ES ne fonctionnent généralement pas depuis `file://`).

## Traduction

La traduction bancaire complète ne peut pas être réalisée de manière fiable par un simple dictionnaire embarqué. Le widget utilise un petit glossaire local d'exemples, destiné à la démonstration et à la validation linguistique, ou un adaptateur de traduction que l'application hôte configure. Sans adaptateur, les phrases inconnues restent inchangées ; aucune traduction automatique n'est prétendue.

### Adaptateur côté plateforme

Configurez un endpoint que la plateforme est autorisée à appeler (ne placez jamais de clé secrète dans le JavaScript navigateur) :

```html
<script>
  window.FulfuldeWidgetConfig = {
    translationEndpoint: "/api/translation/fulfulde"
  };
</script>
<script type="module" src="/assets/fulfulde-widget/widget.js"></script>
```

L'endpoint reçoit `POST` JSON `{ "sourceLanguage": "fr", "targetLanguage": "ff", "texts": ["..."] }` et doit renvoyer `{ "translations": ["..."] }` dans le même ordre. Le widget n'appelle cet endpoint que lorsque l'utilisateur coche explicitement l'autorisation dans le panneau. Le serveur doit appliquer les règles de confidentialité, de sécurité, de conservation et de qualité linguistique de la banque. Une fonction hôte peut aussi être fournie via `window.FulfuldeWidgetTranslate(texts, { sourceLanguage, targetLanguage })`, retournant un tableau de chaînes.

## Confidentialité et sécurité

- Aucun texte n'est envoyé sur le réseau par défaut : le glossaire de démonstration est local.
- Les champs de formulaire, contenus éditables et éléments marqués `data-ffw-private` ou `data-sensitive` sont exclus. Les textes visibles d'une page bancaire peuvent néanmoins contenir des données personnelles ; n'autorisez l'adaptateur distant qu'après revue de confidentialité par la banque.
- Les valeurs des contrôles, montants de formulaires et saisies ne sont jamais modifiés. Le bouton « Restaurer » remet le texte ordinaire à son état initial.
- Le widget n'utilise pas de clé API, ne stocke pas de contenu de page, et ne lit pas le presse-papiers ni le microphone.
- Pour une mise en production, faites valider les traductions par des locuteurs Fulfulde du Cameroun et testez l'intégration sur les pages d'authentification et de transaction.

## Accessibilité

Boutons nommés, état d'ouverture exposé, annonces de statut, navigation clavier et fermeture par Échap. Le déplacement fonctionne par pointeur (souris/stylet/tactile) et la position est mémorisée localement. Le panneau se repositionne pour rester dans la fenêtre.

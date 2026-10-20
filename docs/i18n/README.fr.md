# ClipNacre — Français

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

v0.2.0 ajoute **ClipNacre natif pour macOS**, en DMG/ZIP pour Apple Silicon et Intel, avec historique, édition de captures, images flottantes et OCR local. Les téléchargements portent le nom clipnacre ; les identifiants et données Linux restent compatibles. L’app Mac n’est pas notariée. Consultez le [guide Mac et ses autorisations](../macos.md).

v0.1.14 ajoute la reconnaissance visuelle du texte des captures. Appuyez sur **Super+Shift+S**, puis ouvrez **Copier le texte de l’image** (**Ctrl+Shift+O**) dans l’éditeur. Cliquez sur un mot reconnu ou faites glisser sur une zone, vérifiez et modifiez le résultat, puis copiez-le. **Sélectionner tout le texte** rétablit le résultat complet. L’OCR fonctionne localement ; l’anglais est inclus. Pour le français, installez `tesseract-ocr-fra` et choisissez cette langue dans la fenêtre de reconnaissance. L’anglais installé est associé à la langue choisie pour reconnaître les textes mixtes. Après la mise à jour, enregistrez votre travail, déconnectez-vous puis reconnectez-vous.

![OCR v0.1.14](../screenshots/ocr-v0.1.14.png)

v0.1.13 fige l’écran dès Super+Shift+S et conserve les notifications et menus pendant la sélection. L’historique reconnaît les alias MIME PNG/JPEG et les formats mal étiquetés, convertit les BMP/WebP pris en charge et importe un seul fichier image local copié. Le parcours exact dans QQ reste à vérifier sur le bureau.

v0.1.12 corrige un panneau de presse-papiers Super+V invisible, notamment lors de sa réouverture sans modification du contenu. v0.1.11 corrige le panneau Super+V qui dépassait de l’écran et sa position après réouverture. Il s’ouvre près du dernier clic dans l’application active, même si la souris a bougé ; à défaut de clic valide, il utilise la position actuelle du pointeur. Sa taille s’adapte à la zone disponible et sa barre de titre permet de le déplacer.

v0.1.9 affiche une zone de texte avec un curseur sur l’image lorsque vous choisissez «Texte». Cliquez ailleurs pour la déplacer et appuyez sur Entrée pour terminer. «Mosaïque claire» permet de dessiner librement et de régler l’épaisseur du pinceau et la taille des carreaux ; elle couvre les pixels avec des carrés opaques blancs et gris clair. «Noir et blanc» est un filtre indépendant que vous pouvez annuler. Super+Maj+S et le bouton de caméra affichent un nouveau réticule sans l’ancien cadre : glissez puis relâchez pour capturer ; Échap annule. L’image rejoint le presse-papiers et l’historique facultatif ; «Enregistrer l’image» choisit le fichier. Impr écran conserve les contrôles habituels de GNOME.

v0.1.8 ajoute des images épinglées à l’écran avec déplacement, zoom et opacité, des repères numérotés, des annotations sélectionnables, déplaçables, redimensionnables et supprimables, ainsi que l’OCR local. Dans l’éditeur, utilisez « Épingler à l’écran » pour une référence ou « Copier le texte de l’image » pour choisir une langue installée, vérifier et modifier le résultat, puis le copier. « Paramètres → Exportation des captures et OCR » règle le dossier, le nom et la langue OCR. L’anglais est installé avec le paquet ; les autres langues nécessitent les paquets Tesseract correspondants. Les images épinglées à l’écran sont distinctes des éléments épinglés de l’historique et se ferment au verrouillage, à l’effacement ou à la désactivation.

v0.1.6 conserve les images PNG/JPEG avec miniatures, épinglage et collage. Le bouton de caméra ou Super+Shift+S ouvre l’outil GNOME pour capturer une zone, une fenêtre ou l’écran. Le raccourci est modifiable ou désactivable dans les paramètres. «Effacer l’historique à l’arrêt» garde le texte, les images, les éléments épinglés et les emojis récents uniquement en mémoire ; ils disparaissent aussi au redémarrage, à la déconnexion ou au rechargement de l’extension. L’historique enregistré est supprimé dès l’activation, mais pas les fichiers de capture de GNOME.

Un sélecteur Super+V inspiré de Windows pour Ubuntu GNOME : historique du presse-papiers, émojis, kaomoji, symboles et GIF locaux favoris. Les données restent sur votre ordinateur, sans télémétrie ni accès réseau à l’exécution.

Ubuntu 24.04 / GNOME 46 · Ubuntu 26.04 / GNOME 50 · Debian 13 / GNOME 48 · Wayland · x86-64 & ARM64

## Première installation

Téléchargez le [paquet v0.2.0](https://github.com/LincolnGothic/clipnacre/releases/download/v0.2.0/clipnacre_0.2.0_linux_all.deb) et ouvrez un terminal dans le dossier contenant le fichier :

```sh
sudo apt install ./clipnacre_0.2.0_linux_all.deb
```

Après l’installation, **enregistrez votre travail, déconnectez-vous puis reconnectez-vous**. Exécutez ces commandes avec votre compte habituel, sans sudo. La première réserve Super+M aux notifications et libère Super+V ; elle remplace tout raccourci de notification personnalisé.

```sh
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

Appuyez sur **Super+V** ; le titre doit afficher **ClipNacre 0.2.0**.

## Mise à jour vers v0.2.0

Téléchargez le paquet ci-dessus et exécutez la même commande apt dans son dossier. Il remplace l’ancienne version, sans désinstallation préalable. Ensuite, **enregistrez votre travail, déconnectez-vous puis reconnectez-vous**, et vérifiez **ClipNacre 0.2.0** dans le titre de **Super+V**. La langue et les raccourcis sont conservés ; l’historique de texte enregistré, les éléments épinglés et les emojis récents sont migrés. L’historique configuré pour être effacé à la déconnexion est supprimé selon ce réglage.

Vérifiez le paquet installé et l’extension chargée par GNOME avec votre compte habituel :

```sh
dpkg-query -W super-v-ubuntu
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

Les deux versions doivent indiquer **0.2.0** (le numéro interne de l’extension est 18). Si seul le paquet est à jour, déconnectez-vous puis reconnectez-vous. Pour le paquet système, Path doit être `/usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local`. Si le chemin pointe vers votre dossier personnel, sauvegardez ce dossier UUID et déplacez-le hors du répertoire des extensions, puis reconnectez-vous. Si Super+V ne répond pas, utilisez la commande enable ci-dessus ; s’il ouvre les notifications, vérifiez la commande de raccourci de la première installation. Pour ouvrir directement les paramètres, exécutez `gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local`.

## Guide des paramètres de v0.2.0

Ouvrez Super+V et cliquez sur l’engrenage dans l’en-tête pour ouvrir les paramètres.

| Fonction | Utilisation ou emplacement |
| --- | --- |
| Capture d’écran | Bouton de caméra ou **Super+Shift+S**. Rouvrez Super+V pour voir l’image. La collecte de l’historique doit être activée. |
| Modifier le raccourci de capture | **Paramètres → Intégration au bureau → Raccourci de capture (syntaxe GTK)**. Par exemple, `<Super><Shift>s` ; appliquez la modification ou laissez le champ vide pour désactiver le raccourci. |
| Effacer à l’arrêt | **Paramètres → Historique du presse-papiers → Effacer l’historique à l’arrêt**. Désactivé par défaut ; efface aussi au redémarrage, à la déconnexion ou au rechargement de l’extension. |
| Choisir la langue | **Paramètres → Apparence → Langue**. Le changement est immédiat. |

Activer l’effacement à l’arrêt supprime l’historique enregistré et conserve les éléments actuels uniquement en mémoire. Les captures enregistrées séparément par GNOME dans Pictures/Screenshots sont conservées.

## Utilisation et langues

Cliquez dans le champ de destination, puis appuyez sur **Super+V**. Les flèches sélectionnent, Entrée insère et Échap ferme. Ctrl+Tab change d’onglet ; Ctrl+F revient à la recherche. Les émojis sont présentés en grille et peuvent être recherchés par leur nom en français ou en anglais. Les paramètres permettent de modifier la position, le raccourci, l’historique et le collage automatique.

Un seul paquet inclut l’anglais, le chinois simplifié, le chinois traditionnel, le japonais, l’espagnol, le français et le coréen. Choisissez dans « Paramètres → Apparence → Langue » de ClipNacre : l’interface et la recherche traduite changent immédiatement, sans reconnexion ni modification de la langue d’Ubuntu. « Suivre le système » est le choix par défaut ; les langues non disponibles utilisent l’anglais. Les noms des langues restent dans leur forme native. Les catégories se sélectionnent directement dans une rangée horizontale ; utilisez les flèches ou le défilement horizontal pour en voir davantage. Le bouton de la main ouvre le menu des couleurs de peau.

Ajoutez vos GIF locaux dans les paramètres. L’application de destination doit accepter les images ; la prise en charge des animations dépend de l’application. Aucune recherche de GIF en ligne. L’historique peut contenir du texte privé et est enregistré en clair. Consultez la [documentation complète en anglais](../../README.md) et les [notes de confidentialité](../../SECURITY.md), notamment l’état des tests.

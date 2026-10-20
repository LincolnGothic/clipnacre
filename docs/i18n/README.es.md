# ClipNacre — Español

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

v0.2.0 añade **ClipNacre nativo para macOS**, con DMG/ZIP para Apple Silicon e Intel, historial, edición de capturas, imágenes flotantes y OCR local. Los nombres de descarga usan clipnacre; los identificadores internos y datos de Linux siguen siendo compatibles. La app Mac no está notarizada. Consulte la [guía de instalación y permisos de Mac](../macos.md).

v0.1.14 añade reconocimiento visual de texto en capturas. Pulsa **Super+Shift+S** y abre **Copiar texto de la imagen** (**Ctrl+Shift+O**) en el editor. Haz clic en una palabra reconocida o arrastra sobre una región, revisa y edita el resultado y cópialo. **Seleccionar todo el texto** restaura el resultado completo. El OCR funciona localmente; el paquete incluye inglés. Para español, instala `tesseract-ocr-spa` y selecciónalo en el diálogo. Si está instalado, el inglés se combina con el idioma elegido para reconocer texto mixto. Después de actualizar, guarda tu trabajo, cierra la sesión y vuelve a entrar.

![OCR v0.1.14](../screenshots/ocr-v0.1.14.png)

v0.1.13 congela la pantalla al pulsar Super+Shift+S y conserva notificaciones y menús durante la selección. El historial reconoce alias MIME de PNG/JPEG y formatos mal etiquetados, convierte BMP/WebP compatibles e importa un único archivo de imagen local copiado. El flujo concreto de QQ aún requiere verificación en el escritorio.

v0.1.12 corrige el panel del portapapeles de Super+V que podía quedar invisible, especialmente al volver a abrirlo sin cambiar su contenido. v0.1.11 corrige el panel de Super+V que quedaba fuera de la pantalla y las posiciones antiguas al volver a abrirlo. Se abre cerca del último clic en la aplicación activa, aunque muevas el ratón; si no hay un clic válido, usa el puntero actual. El tamaño se ajusta al área disponible y puedes arrastrar la barra de título para moverlo.

v0.1.9 muestra un cuadro de texto con cursor sobre la imagen al elegir «Texto». Haz clic en otro lugar para moverlo y pulsa Intro para terminar. «Mosaico claro» permite dibujar libremente y ajustar el grosor del pincel y el tamaño de los bloques; cubre los píxeles con cuadros opacos blancos y gris claro. «Blanco y negro» es un filtro independiente que puedes deshacer. Super+Mayús+S y el botón de cámara muestran una nueva cruz sin el marco anterior: arrastra y suelta para capturar; Escape cancela. La imagen va al portapapeles y al historial opcional; «Guardar imagen» elige el archivo. Impr Pant mantiene los controles habituales de GNOME.

v0.1.8 añade imágenes fijadas en pantalla con movimiento, zoom y opacidad; marcadores numerados; anotaciones que puedes seleccionar, mover, redimensionar o eliminar; y OCR local. En el editor, usa «Fijar en pantalla» para referencias o «Copiar texto de la imagen» para elegir un idioma instalado, revisar y editar el resultado, y copiarlo. «Ajustes → Exportación de capturas y OCR» configura la carpeta, el nombre y el idioma OCR. El paquete incluye OCR en inglés; otros idiomas requieren los paquetes Tesseract correspondientes. Las imágenes fijadas en pantalla son distintas de los elementos fijados del historial y se cierran al bloquear, borrar o desactivar la extensión.

v0.1.6 guarda imágenes PNG/JPEG con miniaturas, fijación y pegado. El botón de cámara o Super+Shift+S abre las capturas de área, ventana o pantalla de GNOME. Puedes cambiar o desactivar el atajo en Ajustes. «Borrar el historial al apagar» mantiene el texto, las imágenes, los elementos fijados y los emojis recientes solo en memoria; también se borran al reiniciar, cerrar sesión o recargar la extensión. Al activarlo se elimina el historial guardado, pero no los archivos de captura de GNOME.

Un selector al estilo de Windows con Super+V para Ubuntu GNOME: historial del portapapeles, emojis, kaomoji, símbolos y GIF locales favoritos. Los datos permanecen en tu equipo, sin telemetría ni conexiones de red durante el uso.

Ubuntu 24.04 / GNOME 46 · Ubuntu 26.04 / GNOME 50 · Debian 13 / GNOME 48 · Wayland · x86-64 & ARM64

## Primera instalación

Descarga el [paquete v0.2.0](https://github.com/LincolnGothic/clipnacre/releases/download/v0.2.0/clipnacre_0.2.0_linux_all.deb) y abre un terminal en la carpeta que contiene el archivo:

```sh
sudo apt install ./clipnacre_0.2.0_linux_all.deb
```

Después de instalar, **guarda tu trabajo, cierra la sesión y vuelve a entrar**. Ejecuta estos comandos como usuario normal, sin sudo. El primero asigna Super+M a las notificaciones para dejar Super+V disponible; reemplaza cualquier atajo de notificaciones personalizado.

```sh
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
gnome-extensions enable super-v-ubuntu@super-v-ubuntu.local
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

Pulsa **Super+V**; el título debe mostrar **ClipNacre 0.2.0**.

## Actualizar a v0.2.0

Descarga el paquete anterior y ejecuta el mismo comando apt desde su carpeta. Se instala sobre la versión anterior; no hace falta desinstalarla. Después, **guarda tu trabajo, cierra la sesión y vuelve a entrar**, y comprueba **ClipNacre 0.2.0** en el título de **Super+V**. Se conservan el idioma y los atajos, y se migra el historial de texto guardado, los elementos fijados y los emojis recientes. El historial configurado para borrarse al cerrar sesión se elimina según esa preferencia.

Comprueba el paquete instalado y la extensión cargada por GNOME como usuario normal:

```sh
dpkg-query -W super-v-ubuntu
gnome-extensions info super-v-ubuntu@super-v-ubuntu.local
```

Ambos deben indicar **0.2.0** (el número interno de la extensión es 18). Si solo el paquete es nuevo, cierra y vuelve a abrir la sesión. Para el paquete del sistema, Path debe ser `/usr/share/gnome-shell/extensions/super-v-ubuntu@super-v-ubuntu.local`. Si apunta a tu carpeta personal, guarda una copia de esa carpeta UUID y muévela fuera del directorio de extensiones; después vuelve a iniciar sesión. Si Super+V no responde, ejecuta el comando enable anterior; si abre notificaciones, revisa el comando de atajos de la primera instalación. Para abrir Ajustes directamente, usa `gnome-extensions prefs super-v-ubuntu@super-v-ubuntu.local`.

## Guía de ajustes de v0.2.0

Abre Super+V y pulsa el botón de engranaje de la cabecera para abrir Ajustes.

| Función | Uso o ubicación |
| --- | --- |
| Captura de pantalla | Botón de cámara o **Super+Shift+S**. Vuelve a abrir Super+V para ver la imagen. La captura del historial debe estar activada. |
| Cambiar el atajo de captura | **Ajustes → Integración con el escritorio → Atajo de captura (sintaxis GTK)**. Por ejemplo, `<Super><Shift>s`; aplica el cambio o deja el campo vacío para desactivar el atajo. |
| Borrar al apagar | **Ajustes → Historial del portapapeles → Borrar el historial al apagar**. Desactivado por defecto; también borra al reiniciar, cerrar sesión o recargar la extensión. |
| Elegir idioma | **Ajustes → Apariencia → Idioma**. El cambio es inmediato. |

Al activar el borrado al apagar, se elimina el historial guardado y los elementos actuales permanecen solo en memoria. No se eliminan las capturas que GNOME guarda aparte en Pictures/Screenshots.

## Uso e idiomas

Haz clic en el campo de destino y pulsa **Super+V**. Usa las flechas para seleccionar, Enter para insertar y Esc para cerrar. Ctrl+Tab cambia de pestaña; Ctrl+F vuelve a la búsqueda. Los emojis se muestran en una cuadrícula y se pueden buscar por nombres en español o inglés. Ajustes permite cambiar la posición, el atajo, el historial y el pegado automático.

Un único paquete incluye inglés, chino simplificado, chino tradicional, japonés, español, francés y coreano. Elige en «Ajustes → Apariencia → Idioma» de ClipNacre: la interfaz y la búsqueda traducida cambian inmediatamente, sin cerrar sesión ni cambiar el idioma de Ubuntu. La opción predeterminada es «Seguir el sistema»; los idiomas no disponibles usan inglés. Los nombres de los idiomas conservan su forma nativa. Las categorías se seleccionan directamente en una fila horizontal; usa las flechas o el desplazamiento horizontal para ver más. El botón de la mano abre el menú de tonos de piel.

Añade GIF locales desde Ajustes. La aplicación de destino debe aceptar imágenes; la animación depende de ella. No hay búsqueda de GIF en línea. El historial puede contener texto privado y se guarda sin cifrar. Consulta la [documentación completa en inglés](../../README.md) y las [notas de privacidad](../../SECURITY.md), incluido el estado de las pruebas.

# Media Converter Pro

App web/PWA para convertir, recortar y transformar video y audio directamente desde el navegador, con diseño de consola de estudio (grafito + ámbar/teal) y procesamiento 100% local con FFmpeg WebAssembly.

## Funciones incluidas

- **Cola por lotes**: agrega uno o varios archivos (arrastrar o seleccionar) y conviértelos todos con la misma configuración, con estado individual y descarga por archivo.
- **Modo Audio**: convierte audio a MP3, WAV, OGG, OPUS, M4A/AAC, AAC o FLAC.
- **Modo Video**: convierte a MP4, WebM, MKV o **GIF animado** (paleta optimizada en dos pasadas para mejor color).
- **Modo Extraer audio**: toma un video y genera un archivo de audio.
- **Modo Miniatura**: extrae un cuadro de un video como JPG o PNG.
- **Presets rápidos**: Podcast (voz), WhatsApp/Estado, Archivo ligero y Máxima calidad.
- Recorte por tiempo de inicio y final, con botones para usar el tiempo actual del reproductor.
- **Rotación** (90°/180°/270°/espejo) y **velocidad** (0.5x–2x) para audio y video.
- Bitrate, frecuencia, canales y volumen de audio; resolución, FPS, calidad (CRF) y audio del video.
- Normalización, fade in, fade out y reducción de silencios largos.
- Metadatos de título y artista/autor.
- Medidor de progreso tipo LED, porcentaje y log técnico con el comando FFmpeg ejecutado.
- Diseño responsivo para escritorio, tablet y móvil.
- Manifest, service worker e iconos para instalar como PWA.
- Listo para GitHub Pages.

## Importante

La app usa FFmpeg WebAssembly desde CDN. La primera carga requiere internet para descargar el motor. Los archivos se procesan localmente en el navegador y no se suben a servidores. La configuración del panel derecho (formato, calidad, recorte, rotación, velocidad, etc.) se aplica a **todos** los archivos de la cola al presionar "Convertir".

## Cómo usar con GitHub Pages

1. Descomprime el ZIP.
2. Sube todos los archivos de la carpeta `media-converter-pro` a un repositorio.
3. En GitHub entra a **Settings > Pages**.
4. Selecciona la rama donde subiste los archivos.
5. Abre la URL generada.

## Recomendaciones

- Usa Chrome o Edge actualizado para mejor rendimiento.
- Para archivos grandes o lotes largos, usa una computadora con buena memoria RAM.
- En iPhone/iPad algunas conversiones pueden ser más limitadas por el navegador.
- Si una conversión de video falla, prueba bajar la resolución, desactivar "Copia rápida" o usar MP4 como salida.
- El GIF animado usa dos pasadas de FFmpeg (paleta + render); en videos largos, recorta primero para acelerar el proceso.

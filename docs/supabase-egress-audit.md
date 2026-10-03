# Auditoría de egress de Supabase

Fecha: 3 de octubre de 2026.

## Causa principal

El mayor riesgo estaba en `notification-dispatch`, ejecutado por Cron cada minuto. Por cada dispositivo activo descargaba `fleet_state.state`, el JSON completo de la cuenta, y volvía a descargarlo después de reclamar un aviso. Ese JSON incluía además fotografías de vehículos y documentos de clientes en Base64. Una cuenta con un estado de 3 MB podía transferir aproximadamente 4,32 GB al día por dispositivo solo con la primera lectura de cada minuto; la validación posterior aumentaba el total cuando había avisos.

El segundo multiplicador estaba en los guardados del navegador. Cada acción descargaba primero el estado completo y el `PATCH` devolvía otra copia completa. El sondeo de sincronización se ejecutaba cada cinco segundos mientras la pestaña permanecía abierta.

## Evidencia observada

- El bundle público usa el proyecto `qwcpipfxzdjeolkcoggc`.
- El conector Supabase disponible durante la auditoría apuntaba a otro proyecto, `xyprkjgmrtcvcgrzwhfg`. Por eso no se aplicaron cambios remotos al proyecto equivocado.
- En ese proyecto auxiliar, las últimas 24 horas mostraban unas 1.400 ejecuciones de cada operación del Cron: configuración, consulta de suscripciones y actualización de `notification_runtime`. La función desplegada todavía consultaba suscripciones con `select=*`.
- No existen suscripciones Supabase Realtime en el cliente actual. La sincronización PC/móvil se basa en comprobación de `updated_at` y descarga condicional.
- Dashboard, Flota, Clientes, Pagos, Informes y Calendario no hacen consultas independientes: consumen el único `fleet_state` hidratado por el proveedor global. Cambiar de sección no debe volver a descargar el estado.
- Las copias administrativas descargan todos los adjuntos, pero solo después de una acción explícita del usuario. No se encontró una generación automática oculta.

## Correcciones

1. El emisor de notificaciones selecciona únicamente `events` y `adminSettings.notifications`, selecciona columnas concretas de dispositivos y reutiliza la proyección por usuario.
2. Un guardado normal hace un `PATCH` optimista con la versión conocida y devuelve solo `updated_at,user_id`. Solo descarga el estado completo al detectar un conflicto entre dispositivos.
3. El sondeo pasa de 5 a 30 segundos y se detiene tras 20 segundos sin interacción o al ocultar la pestaña. Foco, reconexión y actividad reciente conservan la sincronización entre dispositivos.
4. Fotografías de vehículos y documentos de clientes dejan de vivir dentro de `fleet_state`; se guardan en buckets privados con RLS por `user_id`. Los datos Base64 antiguos se migran sin borrarlos si una subida falla.
5. Las imágenes nuevas se convierten y comprimen; se generan miniaturas separadas. Los listados solicitan solo la miniatura cuando se acerca al viewport.
6. Fotografías originales, facturas, PDFs y documentos completos solo se firman y descargan al pulsar Ver o Descargar.
7. Las signed URLs se reutilizan durante 55 minutos con una vigencia de una hora para mantener una clave de caché estable.
8. Flota, Clientes, Pagos e Informes están paginados. Esto limita miniaturas, nodos y trabajo por pantalla aunque el estado de negocio siga sincronizándose como una unidad.

## Peticiones esperadas después del cambio

| Operación | Antes | Después |
| --- | ---: | ---: |
| Abrir una sesión | 1 estado completo | 1 estado, ya sin binarios Base64 |
| Cambiar de sección | 0 | 0 |
| Guardar una acción sin conflicto | 1 GET completo + 1 PATCH con respuesta completa | 1 PATCH + metadatos |
| Pestaña activa durante 5 min sin tocar | 60 comprobaciones | 0 comprobaciones periódicas después de la ventana inicial |
| Cron por usuario/dispositivo y minuto | 1 estado completo; 2 si reclama aviso | 1 proyección pequeña por usuario; otra solo al reclamar aviso |
| Abrir listado con imágenes | originales/Base64 dentro del estado | miniaturas visibles y paginadas |
| PDF o factura cerrados | incluido en el estado o URL regenerada | 0 descargas del archivo completo |

## Instrumentación de desarrollo

En modo `npm run dev`, cada petición Supabase queda registrada con sección, etiqueta, método, estado, bytes de respuesta y duración. La consola expone:

```js
__MONKEY_SUPABASE_DIAGNOSTICS__.reset()
__MONKEY_SUPABASE_DIAGNOSTICS__.summary()
__MONKEY_SUPABASE_DIAGNOSTICS__.snapshot()
```

Procedimiento de medición:

1. Restablecer el contador y abrir Dashboard; anotar el resumen.
2. Repetir el reset antes de Flota, Clientes, Pagos, Informes y Calendario. Tras la hidratación inicial, cada navegación debe registrar cero consultas Supabase.
3. Abrir un mantenimiento con fotos: las miniaturas visibles pueden generar firma y transferencia; la foto completa no debe aparecer hasta pulsar Ver.
4. Abrir un alquiler con PDF: no debe descargarse el PDF antes de pulsar Ver.
5. Restablecer el contador, no interactuar cinco minutos y comprobar que el resumen permanece vacío.

La instrumentación se excluye de producción y de las pruebas automatizadas.

## Validación realizada

- Prueba automatizada: un guardado con versión conocida realiza una sola petición y la URL no contiene `select=state`.
- Prueba automatizada: diez intervalos durante cinco minutos de inactividad producen cero sondeos permitidos.
- Prueba del emisor actualizada para exigir la proyección JSON concreta y rechazar la lectura completa.
- Búsqueda estática: no quedan `select=*` ni `select=state` en el código de ejecución, salvo la lectura inicial y de conflictos que selecciona `state,updated_at,user_id` de forma explícita.
- `npm test`, `npm run lint` y `npm run build` pasan.

## Despliegue pendiente en producción

La migración `20261003090732_reduce_egress_private_media.sql` crea los buckets y tablas privadas para documentos de clientes e imágenes de vehículos, con RLS y políticas por carpeta de usuario. También debe desplegarse la nueva versión de `notification-dispatch`. Ambos cambios deben aplicarse a `qwcpipfxzdjeolkcoggc`; el conector disponible en esta sesión no tiene acceso a ese proyecto.

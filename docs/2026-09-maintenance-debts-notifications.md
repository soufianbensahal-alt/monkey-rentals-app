# Mantenimiento, deudas y notificaciones — septiembre de 2026

## Datos y compatibilidad

Materiales anidados en `maintenance`; deudas y abonos en las colecciones opcionales `debts` y `debtPayments` del estado existente, aislado por `fleet_state.user_id` y RLS. No se sustituyen ni migran destructivamente los registros actuales. Las copias antiguas siguen siendo compatibles. Restaurar una copia conserva el principal y el historial de deudas ya registrado.

Un mantenimiento anterior conserva `cost` hasta que se activa el desglose. Los nuevos materiales se suman una sola vez junto con mano de obra y otros gastos. Informes separa las partidas; Excel añade materiales, deudas y pagos de deuda. Solo los abonos reales entran como ingreso cobrado, en su fecha de pago.

La sincronización combina cambios independientes por ID y usa actualizaciones condicionales por `updated_at`; detecta conflictos en un mismo registro. La base de comparación se conserva en caché para recuperar cambios pendientes. Un trigger valida el libro de deudas y evita sobrepagos o desaparición del historial.

## Fotografías

Bucket privado `maintenance-materials`, ruta propietario/vehículo/mantenimiento/material. Máximo cinco fotografías por material; WebP (JPEG si no está soportado), dimensión máxima 1600, miniatura 400, límite 1.5 MB. URLs firmadas durante cinco minutos. Solo la miniatura se carga inicialmente; la imagen grande se solicita al pulsar «Ver fotografía». Las fotografías nuevas de un formulario cancelado se eliminan de forma oportunista; cerrar el navegador durante una subida puede dejar un objeto sin referencia.

## Notificaciones

> Eliminadas el 17/10/2026: ya no hay avisos push al móvil, solo avisos internos dentro de la app. Ver `supabase/NOTIFICATIONS.md`. Se conserva el texto original como historial.

Cron y Edge Functions ya existentes ejecutan el envío sin la página abierta. Los vencimientos del calendario permiten configurar un aviso móvil explícito. La cola utiliza `notification_deliveries` (pendiente, en curso, enviado, fallido, cancelado); `notification_logs` conserva intentos y errores. Máximo tres intentos para fallos transitorios, con dos minutos de separación; las reclamaciones abandonadas pueden recuperarse tras cinco minutos. Un identificador estable y un registro local del service worker evitan repetir los reintentos mostrados.

No se borra el evento al enviar. Los eventos únicos pasados y todavía activos se muestran como pendientes de revisar. El dispositivo se reconcilia al abrir la app; una suscripción caducada se puede renovar si se conserva el consentimiento y el navegador lo permite. Las nuevas inscripciones no recuperan avisos anteriores a su fecha de alta. El historial diagnóstico se ve en Configuración → Notificaciones. «Enviado» significa aceptado por el proveedor push, no confirmación de visualización en el teléfono.

## Validación

Pruebas de cálculo, formularios, Excel, copias, combinación de estado, actualización condicional, RLS de fotografías y logs, invariantes del libro de deudas, exclusión de otras cuentas, limitación de intentos y deduplicación del service worker. Pruebas Deno con envío HTTP simulado para cifrado Web Push y despacho. Compilación y ESLint sin errores.

La recepción física con el móvil cerrado y la cámara móvil requieren una prueba en el dispositivo. Configuración ofrece «Probar aviso en 5 minutos». Para ITV, crear el documento, abrir su fecha en Calendario y usar «Configurar aviso móvil»; después del envío debe seguir apareciendo tanto el documento como el evento. Para varios avisos, configurar semana/día/hora y comprobar sus entradas separadas en el historial. Estas pruebas físicas no se han dado por realizadas.

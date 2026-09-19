# Despliegue de notificaciones de Monkey Rentals

## Estado y datos

Las alertas configurables viven en `fleet_state.state.events` y las preferencias en `adminSettings.notifications`. Usan la sincronización y RLS existentes: `user_id = auth.uid()`. Esto evita escrituras dobles entre el calendario y otra tabla y conserva las copias JSON. No se modifican eventos antiguos; pueden editarse para añadir hora y avisos.

Las tablas nuevas guardan dispositivos y resultados de envío. El navegador solo puede consultar sus propias filas. Las altas, bajas y envíos pasan por Edge Functions autenticadas. La función de dispositivos valida el token con Supabase Auth y la sesión activa; el emisor comprueba que la sesión siga vigente antes de enviar. Al cerrar sesión, la app elimina la suscripción local y el Service Worker borra la vinculación con esa cuenta.

## Activación y despliegue

Backend activado el 19/09/2026 en `monkey-rentals-app` (`qwcpipfxzdjeolkcoggc`). Las funciones `notification-device` y `notification-dispatch` están desplegadas; Cron ejecuta el emisor cada minuto. Verificada respuesta HTTP 200 y señal de salud. No había dispositivos registrados durante la verificación. Frontend publicado en `https://monkey-rentals-app.vercel.app` (despliegue `dpl_9TT94a5xjxEwoD4e3pGAGNsnutKJ`). Verificados HTTP 200 del calendario, manifest y Service Worker; preflight de registro 204 y rechazo sin autenticación 401.

1. Aplicar las migraciones `notification_delivery` y `notification_vault_config` en el proyecto que contiene `public.fleet_state` y sus políticas por usuario.
2. La configuración se guarda en Supabase Vault, accesible únicamente por funciones SQL reservadas a `service_role`. `monkey_notification_cron_secret` se genera dentro de PostgreSQL. La primera ejecución autorizada genera el par VAPID usando WebCrypto y lo guarda en Vault bajo bloqueo transaccional. No usar claves generadas con la biblioteca antigua de Node: el formato privado actual es JWK serializado.
3. `monkey_app_origin` y `monkey_vapid_subject` contienen `https://monkey-rentals-app.vercel.app`. `monkey_notification_url` contiene la URL de la función `notification-dispatch` del proyecto. No revelar claves privadas ni guardarlas en Git o variables `VITE_`.
4. Ejecutar `npm run notifications:prepare` antes de desplegar ambas funciones con `supabase/functions/deno.json`. `notification-device` verifica JWT y sesión activa; `notification-dispatch` valida el secreto privado enviado por Cron.
5. Ejecutar `notification-cron.sql`. Esperar a una ejecución correcta: la activación de dispositivos comprueba su señal de salud (últimos 5 minutos).
6. Publicar el frontend y `/notification-sw.js` por HTTPS. Desde Configuración, pulsar Activar notificaciones en cada dispositivo. En iOS/iPadOS se debe abrir la PWA añadida a la pantalla de inicio.

La entrega real a un móvil requiere registrar el dispositivo y conceder el permiso. Un HTTP 200 sin dispositivos confirma el funcionamiento del programador, no una entrega real.

## Pruebas locales

- `npm test`: incluye fechas, horario de verano, restauración de copias, formularios, aislamiento RLS y reclamaciones de entrega con PostgreSQL embebido.
- `deno check --config supabase/functions/deno.json supabase/functions/notification-device/index.ts supabase/functions/notification-dispatch/index.ts`
- `deno test --allow-env --config supabase/functions/deno.json supabase/functions/notifications_test.ts`: emisor y registro con red simulada; no envía notificaciones reales.
- `npm run build` y `npm run lint`.

## Verificación antes de dar el servicio por activo

- Revisar los asesores de seguridad de Supabase y comprobar que A no puede leer dispositivos/entregas de B ni ejecutar RPCs de service role.
- Ejecutar `npm test -- src/lib/notificationDatabase.test.ts`: verifica la migración en PostgreSQL embebido temporal, con cuentas y sesiones ficticias.
- Crear un aviso futuro y comprobar con el móvil bloqueado y la app cerrada. Confirmar una entrega por dispositivo en `notification_deliveries`.
- Invocar dos emisores a la vez: la clave única de entrega solo admite un envío por dispositivo/evento/revisión/fecha/aviso.
- Editar fecha/hora y borrar otro evento: no deben llegar los avisos antiguos. Un push ya aceptado por el proveedor no puede retirarse retroactivamente.
- Probar categorías desactivadas, sesión cerrada, permisos denegados y un endpoint caducado (404/410 elimina el dispositivo).
- Probar Europe/Madrid y Atlantic/Canary y cambio de horario. Mensuales desde día 31 se ajustan al último día del mes sin arrastrar el ajuste a meses posteriores.

## Semántica y límites operativos

- Hasta 5 avisos por evento y 365 días de antelación. Repeticiones calculadas por fecha local, no sumando 24 horas en UTC. Se rechazan horas iniciales inexistentes o ambiguas; las recurrencias en saltos de horario usan la siguiente hora válida.
- El calendario y los avisos internos funcionan sin permiso push. Se envían los recordatorios configurados explícitamente, no todos los vencimientos automáticos heredados.
- Se recuperan avisos vencidos hasta 24 horas atrás tras una interrupción del servicio. Nunca se envían avisos cuyo momento sea anterior a la última edición del evento.
- El registro de entrega se reclama atómicamente ANTES de contactar al proveedor. Se prioriza evitar duplicados: un error ambiguo o caída entre la reclamación y el envío NO se reintenta automáticamente. Queda como `failed` o `claimed` para revisión. `sent` significa aceptado por el proveedor, no leído por el usuario. Web Push no garantiza entrega exacta ni puntual.
- El dispositivo puede retrasar una notificación por red, permisos, ahorro de batería o decisiones del sistema operativo. TTL: una hora. No es un servicio de alarma crítica.
- Las tablas de entregas contienen historial técnico; definir retención según el negocio. No borrar claves recientes que evitan duplicados.
- Revisión de capacidad: el emisor pagina dispositivos y usa un día de recuperación. Para flotas con miles de dispositivos, migrar a una cola duradera con partición antes de superar el tiempo de ejecución de Edge Functions.

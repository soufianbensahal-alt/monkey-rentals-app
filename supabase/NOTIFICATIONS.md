# Notificaciones de Monkey Rentals

Las notificaciones push al móvil (Web Push, Edge Functions `notification-device` y `notification-dispatch`, Cron cada minuto) se eliminaron el 17/10/2026 por su consumo de base de datos y egress en Supabase. La migración `20261017120000_remove_push_notifications.sql` desprograma el Cron y borra tablas, triggers, funciones y secretos de Vault asociados.

Solo quedan los avisos internos: se calculan en el navegador a partir de `fleet_state.state` (eventos del calendario, pagos, ITV, mantenimiento, multas, km) y se muestran al abrir la app en Calendario, Alertas, el panel de próximas alertas y la campana de notificaciones. No generan tráfico adicional en Supabase.

`public/notification-sw.js` se conserva como service worker de baja: los dispositivos que tenían instalado el anterior lo actualizan, eliminan su suscripción push y se desregistran. No borrar ese archivo.

-- Vehicle retirement and selective deletion (Flota).
-- Vehicles live in fleet_state.state.vehicles (JSON), so retirement data (estado, baja,
-- estadoHistorial) and the rental/fine snapshots need no schema change and stay covered by
-- the existing fleet_state RLS policies.
-- Only expenses, stored in their own table, need a column for a fixed copy of a deleted
-- vehicle (plate, brand, model and label) so they keep showing it after the deletion.
-- Existing row-level policies on expenses (owner only) already cover the new column.

alter table public.expenses add column if not exists vehicle_snapshot jsonb;

alter table public.expenses drop constraint if exists expenses_vehicle_snapshot_shape;
alter table public.expenses add constraint expenses_vehicle_snapshot_shape check (
  vehicle_snapshot is null or (
    vehicle_id is not null
    and jsonb_typeof(vehicle_snapshot) = 'object'
    and vehicle_snapshot ?& array['plate','brand','model','label','deletedAt']
    and pg_column_size(vehicle_snapshot) <= 2048
  )
);

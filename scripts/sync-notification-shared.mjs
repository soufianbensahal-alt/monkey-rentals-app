import { readFileSync, writeFileSync } from 'node:fs'
// One scheduling implementation in browser and worker. Run before deploying Edge Functions.
writeFileSync('supabase/functions/_shared/reminders.ts', '// Generated from src/lib/reminders.ts. Run npm run notifications:prepare.\n'+readFileSync('src/lib/reminders.ts','utf8').replace("from '../types'", "from './types.ts'"))
writeFileSync('supabase/functions/_shared/types.ts', '// Generated from src/types.ts. Run npm run notifications:prepare.\n'+readFileSync('src/types.ts','utf8'))

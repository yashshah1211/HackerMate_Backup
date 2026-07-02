# Supabase setup

The app depends on the security policies and transactional functions in
`migrations/202607020001_core_security.sql`.

Link the local folder to the existing Supabase project and apply it:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Back up the database before applying the migration. It intentionally replaces
legacy policies on HackerMate application tables so permissive policies cannot
remain active alongside the hardened policies.

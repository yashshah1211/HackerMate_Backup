-- HackerMate Supabase RLS Audit Script
-- Run this script in the Supabase SQL Editor to scan for missing or weak Row-Level Security (RLS) policies.

-- ==========================================
-- 1. Tables in the public schema with RLS DISABLED
-- ==========================================
SELECT 
  c.relname AS "Table Name (RLS Disabled - VULNERABLE)"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r' -- Regular tables only
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- ==========================================
-- 2. Tables with RLS ENABLED but 0 Policies Defined
-- ==========================================
SELECT 
  c.relname AS "Table Name (RLS Enabled but 0 Policies - ALL ACCESS BLOCKED)"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
  )
ORDER BY c.relname;

-- ==========================================
-- 3. Potentially Weak/Insecure Policies (USING (true) / auth.uid() IS NOT NULL)
-- ==========================================
SELECT 
  c.relname AS "Table Name",
  p.polname AS "Policy Name",
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.polcmd::text
  END AS "Command",
  pg_get_expr(p.polqual, p.polrelid) AS "USING Expression",
  pg_get_expr(p.polwithcheck, p.polrelid) AS "WITH CHECK Expression"
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    pg_get_expr(p.polqual, p.polrelid) = 'true'
    OR pg_get_expr(p.polqual, p.polrelid) ILIKE '%auth.uid() is not null%'
  )
ORDER BY c.relname, p.polname;

-- ==========================================
-- 4. SECURITY DEFINER Functions in the 'public' schema
-- ==========================================
SELECT 
  p.proname AS "Function Name",
  pg_get_function_arguments(p.oid) AS "Arguments",
  l.lanname AS "Language"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prosecdef -- SECURITY DEFINER is enabled
ORDER BY p.proname;

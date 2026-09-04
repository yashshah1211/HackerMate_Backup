-- ============================================================================
-- Migration: 20260827214000_add_certificate_verification_index.sql
-- Purpose: Accelerate certificate verification and QR scans from O(N) table scans
--          to O(1) index seeks on user_badges.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_badges_certificate_id
  ON public.user_badges ((metadata->>'certificate_id'))
  WHERE metadata->>'certificate_id' IS NOT NULL;

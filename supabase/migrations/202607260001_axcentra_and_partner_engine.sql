-- Migration: 202607260001_axcentra_and_partner_engine
-- Creates user_badges, partner_configs, RLS policies, Axcentra seed data, and grant_hackathon_winner_badges RPC.

-- 1. Create public.user_badges table
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE SET NULL,
  badge_type VARCHAR(50) NOT NULL DEFAULT 'verified_winner',
  badge_name TEXT NOT NULL,
  issuer_name TEXT NOT NULL DEFAULT 'HackerMate',
  rank_title TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_badges_unique_user_hackathon_type UNIQUE(user_id, hackathon_id, badge_type)
);

-- 2. Create public.partner_configs table
CREATE TABLE IF NOT EXISTS public.partner_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE NOT NULL,
  partner_name TEXT NOT NULL,
  tagline TEXT,
  brand_color VARCHAR(50) DEFAULT '#3B82F6',
  accent_color VARCHAR(50) DEFAULT '#8B5CF6',
  logo_url TEXT,
  banner_url TEXT,
  override_prize_pool TEXT,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_badges
DROP POLICY IF EXISTS user_badges_read ON public.user_badges;
CREATE POLICY user_badges_read ON public.user_badges
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS user_badges_admin_all ON public.user_badges;
CREATE POLICY user_badges_admin_all ON public.user_badges
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for partner_configs
DROP POLICY IF EXISTS partner_configs_read ON public.partner_configs;
CREATE POLICY partner_configs_read ON public.partner_configs
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS partner_configs_admin_write ON public.partner_configs;
CREATE POLICY partner_configs_admin_write ON public.partner_configs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. Seed Axcentra partner configuration
INSERT INTO public.partner_configs (
  slug, hackathon_id, partner_name, tagline, brand_color, accent_color, logo_url, banner_url, override_prize_pool
) VALUES (
  'axcentra',
  '00000000-0000-0000-0000-000001703933',
  'Axcentra x All India Hackathon',
  'The Flagship 72-Hour National Innovation Sprint. Find your team and build the future.',
  '#3B82F6',
  '#8B5CF6',
  '/axcentra-logo.svg',
  NULL,
  '₹1,00,000+ Prize Pool'
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  override_prize_pool = EXCLUDED.override_prize_pool,
  updated_at = NOW();

-- 4. Create grant_hackathon_winner_badges RPC
CREATE OR REPLACE FUNCTION public.grant_hackathon_winner_badges(
  p_hackathon_id UUID,
  p_user_ids UUID[],
  p_badge_type TEXT DEFAULT 'verified_winner',
  p_badge_name TEXT DEFAULT 'Verified Winner',
  p_issuer_name TEXT DEFAULT 'HackerMate',
  p_rank_title TEXT DEFAULT 'Verified Winner',
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_count INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    INSERT INTO public.user_badges (
      user_id, hackathon_id, badge_type, badge_name, issuer_name, rank_title, metadata
    ) VALUES (
      v_user_id, p_hackathon_id, p_badge_type, p_badge_name, p_issuer_name, p_rank_title, p_metadata
    )
    ON CONFLICT (user_id, hackathon_id, badge_type) DO UPDATE SET
      badge_name = EXCLUDED.badge_name,
      rank_title = EXCLUDED.rank_title,
      issuer_name = EXCLUDED.issuer_name,
      metadata = EXCLUDED.metadata,
      issued_at = NOW();
    
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_hackathon_winner_badges(UUID, UUID[], TEXT, TEXT, TEXT, TEXT, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_hackathon_winner_badges(UUID, UUID[], TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- Migration: 20261001000001_matchmaking_v3_vocabulary.sql
-- Purpose: Expand canonical skill vocabulary to properly map V3 profiles.
-- ============================================================================

-- 1. New Canonical Skills
insert into matchmaking.skill(key, domain_weights, foundation, foundation_slot) values
 ('llm',               '{0,0,1,0,0,0,0}', false, null),
 ('blockchain',        '{0,1,0,0,0,0,0}', false, null),
 ('solidity',          '{0,1,0,0,0,0,0}', false, null),
 ('mysql',             '{0,0.7,0,0,0,0,0}', false, null),
 ('cybersecurity',     '{0,0,0,0,1,0,0}', false, null),
 ('iot',               '{0,0.5,0,0,0.5,0,0}', false, null),
 ('ar/vr',             '{1,0,0,0,0,0,0}', false, null),
 ('gamedev',           '{1,0,0,0,0,0,0}', false, null),
 ('framer motion',     '{1,0,0,0,0,0,0}', false, null),
 ('kafka',             '{0,1,0,0,0.5,0,0}', false, null),
 ('technical writing', '{0,0,0,0,0,0,1}', false, null),
 ('video editing',     '{0,0,0,0,0,1,0}', false, null),
 ('rust',              '{0,1,0,0,0,0,0}', false, null)
on conflict (key) do nothing;

-- 2. New Canonical Self-Aliases
insert into matchmaking.skill_alias(alias, skill_key)
select s.key, s.key from matchmaking.skill s
where s.key in (
 'llm', 'blockchain', 'solidity', 'mysql', 'cybersecurity', 'iot', 'ar/vr', 
 'gamedev', 'framer motion', 'kafka', 'technical writing', 'video editing', 'rust'
) on conflict (alias) do nothing;

-- 3. New Aliases for Existing and New Skills
insert into matchmaking.skill_alias(alias, skill_key) values
 -- AI/ML additions
 ('ai/ml', 'machine learning'),
 ('genai', 'llm'),
 ('generative ai', 'llm'),
 ('llms', 'llm'),
 ('large language models', 'llm'),
 ('genai / llms', 'llm'),
 ('openai api', 'llm'),
 ('opencv', 'computer vision'),
 ('onnx', 'machine learning'),

 -- Frontend & Design additions
 ('motion', 'framer motion'),
 ('graphic design', 'ui design'),
 ('presenting', 'pitching'),
 
 -- Web3 additions
 ('web3', 'blockchain'),
 ('web3 / blockchain', 'blockchain'),
 
 -- Hardware & Gaming additions
 ('hardware', 'iot'),
 ('iot / hardware', 'iot'),
 ('unity', 'gamedev'),
 ('unreal', 'gamedev'),
 ('gamedev (unity/unreal)', 'gamedev'),
 
 -- Misc additions
 ('devops', 'ci/cd')
 
on conflict (alias) do nothing;

-- Migration: 202608080002_auto_normalize_college_trigger
-- 1. Automates exact-match college normalization via Postgres BEFORE INSERT/UPDATE trigger on profiles & teams.
-- 2. EXPLICIT RULE: Collapses all multiple consecutive whitespace characters (\s+) into a single space and trims whitespace before exact matching.
-- 3. Backfills pre-existing unnormalized college values in public.profiles and public.teams.

CREATE OR REPLACE FUNCTION public.normalize_college_name_func()
RETURNS TRIGGER AS $$
DECLARE
  collapsed_col text;
  lower_col text;
BEGIN
  IF NEW.college IS NULL OR TRIM(NEW.college) = '' THEN
    RETURN NEW;
  END IF;

  -- EXPLICIT RULE: Collapse multiple consecutive whitespace characters into a single space
  collapsed_col := regexp_replace(TRIM(NEW.college), '\s+', ' ', 'g');
  lower_col := LOWER(collapsed_col);

  -- Exact match alias mapping ONLY (No wildcards/LIKE matching to preserve unlisted colleges)
  IF lower_col IN (
    'tcet',
    'thakur college of engineering and technology',
    'thakur college of engineering & technology',
    'thakur college of engineering'
  ) THEN
    NEW.college := 'TCET Mumbai (Thakur College of Engineering and Technology)';

  ELSIF lower_col IN (
    'djsce',
    'dwarkadas j sanghvi college of engineering',
    'dwarkadas j. sanghvi college of engineering',
    'dwarkadas sanghvi'
  ) THEN
    NEW.college := 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)';

  ELSIF lower_col IN (
    'vjti',
    'veermata jijabai technological institute'
  ) THEN
    NEW.college := 'VJTI Mumbai (Veermata Jijabai Technological Institute)';

  ELSIF lower_col IN (
    'spit',
    'sardar patel institute of technology'
  ) THEN
    NEW.college := 'SPIT Mumbai (Sardar Patel Institute of Technology)';

  ELSIF lower_col IN (
    'tsec',
    'thadomal shahani engineering college'
  ) THEN
    NEW.college := 'TSEC Mumbai (Thadomal Shahani Engineering College)';

  ELSIF lower_col IN (
    'vesit',
    'vivekanand education society''s institute of technology'
  ) THEN
    NEW.college := 'VESIT Mumbai (Vivekanand Education Society''s Institute of Technology)';

  ELSIF lower_col IN (
    'kjsit',
    'k j somaiya institute of technology',
    'kj somaiya institute of technology'
  ) THEN
    NEW.college := 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)';

  ELSIF lower_col IN (
    'coep',
    'college of engineering pune'
  ) THEN
    NEW.college := 'COEP Technological University, Pune';

  ELSIF lower_col IN (
    'pict',
    'pune institute of computer technology'
  ) THEN
    NEW.college := 'PICT Pune (Pune Institute of Computer Technology)';

  ELSIF lower_col IN (
    'vit pune',
    'vishwakarma institute of technology'
  ) THEN
    NEW.college := 'VIT Pune (Vishwakarma Institute of Technology)';

  ELSIF lower_col IN (
    'iitb',
    'iit bombay'
  ) THEN
    NEW.college := 'IIT Bombay';

  ELSIF lower_col IN (
    'iitd',
    'iit delhi'
  ) THEN
    NEW.college := 'IIT Delhi';

  ELSIF lower_col IN (
    'iitm',
    'iit madras'
  ) THEN
    NEW.college := 'IIT Madras';

  ELSIF lower_col IN (
    'dtu',
    'delhi technological university'
  ) THEN
    NEW.college := 'DTU Delhi';

  ELSE
    -- For unlisted custom colleges, store the whitespace-collapsed string
    NEW.college := collapsed_col;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach triggers to profiles and teams
DROP TRIGGER IF EXISTS trg_normalize_college_profiles ON public.profiles;
CREATE TRIGGER trg_normalize_college_profiles
  BEFORE INSERT OR UPDATE OF college ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_college_name_func();

DROP TRIGGER IF EXISTS trg_normalize_college_teams ON public.teams;
CREATE TRIGGER trg_normalize_college_teams
  BEFORE INSERT OR UPDATE OF college ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_college_name_func();

-- One-Time Backfill for pre-existing unnormalized entries in profiles and teams
UPDATE public.profiles
SET college = CASE
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('tcet', 'thakur college of engineering and technology', 'thakur college of engineering & technology', 'thakur college of engineering')
    THEN 'TCET Mumbai (Thakur College of Engineering and Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('djsce', 'dwarkadas j sanghvi college of engineering', 'dwarkadas j. sanghvi college of engineering', 'dwarkadas sanghvi')
    THEN 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vjti', 'veermata jijabai technological institute')
    THEN 'VJTI Mumbai (Veermata Jijabai Technological Institute)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('spit', 'sardar patel institute of technology')
    THEN 'SPIT Mumbai (Sardar Patel Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('tsec', 'thadomal shahani engineering college')
    THEN 'TSEC Mumbai (Thadomal Shahani Engineering College)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vesit', 'vivekanand education society''s institute of technology')
    THEN 'VESIT Mumbai (Vivekanand Education Society''s Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('kjsit', 'k j somaiya institute of technology', 'kj somaiya institute of technology')
    THEN 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('coep', 'college of engineering pune')
    THEN 'COEP Technological University, Pune'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('pict', 'pune institute of computer technology')
    THEN 'PICT Pune (Pune Institute of Computer Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vit pune', 'vishwakarma institute of technology')
    THEN 'VIT Pune (Vishwakarma Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitb', 'iit bombay')
    THEN 'IIT Bombay'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitd', 'iit delhi')
    THEN 'IIT Delhi'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitm', 'iit madras')
    THEN 'IIT Madras'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('dtu', 'delhi technological university')
    THEN 'DTU Delhi'
  ELSE college
END
WHERE LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN (
  'tcet', 'thakur college of engineering and technology', 'thakur college of engineering & technology', 'thakur college of engineering',
  'djsce', 'dwarkadas j sanghvi college of engineering', 'dwarkadas j. sanghvi college of engineering', 'dwarkadas sanghvi',
  'vjti', 'veermata jijabai technological institute',
  'spit', 'sardar patel institute of technology',
  'tsec', 'thadomal shahani engineering college',
  'vesit', 'vivekanand education society''s institute of technology',
  'kjsit', 'k j somaiya institute of technology', 'kj somaiya institute of technology',
  'coep', 'college of engineering pune',
  'pict', 'pune institute of computer technology',
  'vit pune', 'vishwakarma institute of technology',
  'iitb', 'iit bombay',
  'iitd', 'iit delhi',
  'iitm', 'iit madras',
  'dtu', 'delhi technological university'
);

UPDATE public.teams
SET college = CASE
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('tcet', 'thakur college of engineering and technology', 'thakur college of engineering & technology', 'thakur college of engineering')
    THEN 'TCET Mumbai (Thakur College of Engineering and Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('djsce', 'dwarkadas j sanghvi college of engineering', 'dwarkadas j. sanghvi college of engineering', 'dwarkadas sanghvi')
    THEN 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vjti', 'veermata jijabai technological institute')
    THEN 'VJTI Mumbai (Veermata Jijabai Technological Institute)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('spit', 'sardar patel institute of technology')
    THEN 'SPIT Mumbai (Sardar Patel Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('tsec', 'thadomal shahani engineering college')
    THEN 'TSEC Mumbai (Thadomal Shahani Engineering College)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vesit', 'vivekanand education society''s institute of technology')
    THEN 'VESIT Mumbai (Vivekanand Education Society''s Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('kjsit', 'k j somaiya institute of technology', 'kj somaiya institute of technology')
    THEN 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('coep', 'college of engineering pune')
    THEN 'COEP Technological University, Pune'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('pict', 'pune institute of computer technology')
    THEN 'PICT Pune (Pune Institute of Computer Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('vit pune', 'vishwakarma institute of technology')
    THEN 'VIT Pune (Vishwakarma Institute of Technology)'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitb', 'iit bombay')
    THEN 'IIT Bombay'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitd', 'iit delhi')
    THEN 'IIT Delhi'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('iitm', 'iit madras')
    THEN 'IIT Madras'
  WHEN LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN ('dtu', 'delhi technological university')
    THEN 'DTU Delhi'
  ELSE college
END
WHERE LOWER(regexp_replace(TRIM(college), '\s+', ' ', 'g')) IN (
  'tcet', 'thakur college of engineering and technology', 'thakur college of engineering & technology', 'thakur college of engineering',
  'djsce', 'dwarkadas j sanghvi college of engineering', 'dwarkadas j. sanghvi college of engineering', 'dwarkadas sanghvi',
  'vjti', 'veermata jijabai technological institute',
  'spit', 'sardar patel institute of technology',
  'tsec', 'thadomal shahani engineering college',
  'vesit', 'vivekanand education society''s institute of technology',
  'kjsit', 'k j somaiya institute of technology', 'kj somaiya institute of technology',
  'coep', 'college of engineering pune',
  'pict', 'pune institute of computer technology',
  'vit pune', 'vishwakarma institute of technology',
  'iitb', 'iit bombay',
  'iitd', 'iit delhi',
  'iitm', 'iit madras',
  'dtu', 'delhi technological university'
);

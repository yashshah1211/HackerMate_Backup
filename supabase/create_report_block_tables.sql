-- Create blocked_users table to allow users to block other users
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS for blocked_users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- 1. Allow authenticated blocker to read their own blocks
CREATE POLICY "Allow blocker to read own blocks" 
ON blocked_users FOR SELECT 
TO authenticated
USING (auth.uid() = blocker_id);

-- 2. Allow authenticated blocker to insert blocks
CREATE POLICY "Allow blocker to block users" 
ON blocked_users FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = blocker_id);

-- 3. Allow authenticated blocker to delete blocks (unblock)
CREATE POLICY "Allow blocker to unblock users" 
ON blocked_users FOR DELETE 
TO authenticated
USING (auth.uid() = blocker_id);


-- Create user_reports table to allow users to report abusive profiles
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reported_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for user_reports
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- 1. Allow authenticated users to submit reports
CREATE POLICY "Allow authenticated to submit reports" 
ON user_reports FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = reporter_id OR reporter_id IS NULL);

-- Note: No SELECT policy is created for general users. Only DB admins can see user reports.

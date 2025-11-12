-- IGNITE Accountability Tracker Database Schema
-- Run this script in your Supabase SQL Editor after creating the project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    first_completion_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Completions Table
CREATE TABLE IF NOT EXISTS completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completion_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, completion_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_completions_user_id ON completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completion_date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Function: Calculate current streak with 1-day grace period
CREATE OR REPLACE FUNCTION calculate_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_streak INTEGER := 0;
    v_current_date DATE;
    v_last_date DATE := NULL;
    v_date_diff INTEGER;
BEGIN
    -- Get all completion dates for user, ordered descending from most recent
    FOR v_current_date IN
        SELECT completion_date
        FROM completions
        WHERE user_id = p_user_id
        ORDER BY completion_date DESC
    LOOP
        IF v_last_date IS NULL THEN
            -- First iteration (most recent completion)
            v_last_date := v_current_date;
            v_streak := 1;
        ELSE
            -- Calculate days between this completion and the previous one
            v_date_diff := v_last_date - v_current_date;

            -- If gap is 1 or 2 days (allowing 1-day grace period), continue streak
            IF v_date_diff <= 2 THEN
                v_streak := v_streak + 1;
                v_last_date := v_current_date;
            ELSE
                -- Gap too large, streak is broken
                EXIT;
            END IF;
        END IF;
    END LOOP;

    -- Check if most recent completion is recent enough (within last 2 days)
    IF v_last_date IS NOT NULL THEN
        v_date_diff := CURRENT_DATE - v_last_date;
        IF v_date_diff > 2 THEN
            -- Streak is expired
            RETURN 0;
        END IF;
    END IF;

    RETURN v_streak;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate total completions
CREATE OR REPLACE FUNCTION calculate_total_completions(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM completions WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate day number since first completion
CREATE OR REPLACE FUNCTION calculate_day_number(p_user_id UUID, p_completion_date DATE)
RETURNS INTEGER AS $$
DECLARE
    v_first_date DATE;
BEGIN
    SELECT first_completion_date INTO v_first_date
    FROM users
    WHERE id = p_user_id;

    IF v_first_date IS NULL THEN
        RETURN 1;
    END IF;

    RETURN (p_completion_date - v_first_date) + 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Get or create user (upsert)
CREATE OR REPLACE FUNCTION get_or_create_user(p_email TEXT, p_name TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Try to get existing user
    SELECT id INTO v_user_id FROM users WHERE email = p_email;

    -- If user doesn't exist, create them
    IF v_user_id IS NULL THEN
        INSERT INTO users (email, name)
        VALUES (p_email, p_name)
        RETURNING id INTO v_user_id;
    ELSE
        -- Update name in case it changed
        UPDATE users SET name = p_name, updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark completion (with first_completion_date tracking)
CREATE OR REPLACE FUNCTION mark_completion(p_email TEXT, p_name TEXT, p_completion_date DATE)
RETURNS TABLE(
    user_id UUID,
    completion_id UUID,
    day_number INTEGER,
    current_streak INTEGER,
    total_completions INTEGER
) AS $$
DECLARE
    v_user_id UUID;
    v_completion_id UUID;
    v_day_number INTEGER;
    v_streak INTEGER;
    v_total INTEGER;
BEGIN
    -- Get or create user
    v_user_id := get_or_create_user(p_email, p_name);

    -- Insert completion
    INSERT INTO completions (user_id, completion_date)
    VALUES (v_user_id, p_completion_date)
    RETURNING id INTO v_completion_id;

    -- Update first_completion_date if this is the first completion
    UPDATE users
    SET first_completion_date = COALESCE(first_completion_date, p_completion_date)
    WHERE id = v_user_id;

    -- Calculate stats
    v_day_number := calculate_day_number(v_user_id, p_completion_date);
    v_streak := calculate_streak(v_user_id);
    v_total := calculate_total_completions(v_user_id);

    RETURN QUERY SELECT v_user_id, v_completion_id, v_day_number, v_streak, v_total;
END;
$$ LANGUAGE plpgsql;

-- View: Leaderboard
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
    u.id,
    u.name,
    u.email,
    calculate_streak(u.id) as current_streak,
    calculate_total_completions(u.id) as total_completions,
    u.first_completion_date
FROM users u
WHERE calculate_streak(u.id) > 0  -- Only show users with active streaks
ORDER BY current_streak DESC, total_completions DESC;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users are viewable by everyone" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can be inserted by anyone" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own data" ON users
    FOR UPDATE USING (true);

-- RLS Policies for completions table
CREATE POLICY "Completions are viewable by everyone" ON completions
    FOR SELECT USING (true);

CREATE POLICY "Completions can be inserted by anyone" ON completions
    FOR INSERT WITH CHECK (true);

-- Grant permissions for anonymous users
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON users TO anon;
GRANT SELECT, INSERT ON completions TO anon;
GRANT SELECT ON leaderboard_view TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- Refresh updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'IGNITE Accountability Tracker schema created successfully!';
    RAISE NOTICE 'Tables: users, completions';
    RAISE NOTICE 'Functions: calculate_streak, calculate_total_completions, calculate_day_number, get_or_create_user, mark_completion';
    RAISE NOTICE 'View: leaderboard_view';
    RAISE NOTICE 'RLS policies enabled for security';
END $$;

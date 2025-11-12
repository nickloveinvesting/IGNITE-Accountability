// IGNITE Accountability Tracker - Main Application Logic

// Global state
let currentUser = null;
let userEmail = null;
let userName = null;

// DOM Elements
const welcomeCard = document.getElementById('welcomeCard');
const welcomeMessage = welcomeCard.querySelector('.welcome-message');
const currentStreakEl = document.getElementById('currentStreak');
const dayNumberEl = document.getElementById('dayNumber');
const totalCompletionsEl = document.getElementById('totalCompletions');
const checkinButton = document.getElementById('checkinButton');
const feedbackMessage = document.getElementById('feedbackMessage');
const leaderboardList = document.getElementById('leaderboardList');

/**
 * Extract URL parameters (passed from GoHighLevel)
 */
function extractURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        name: urlParams.get('name') || 'User',
        email: urlParams.get('email') || null
    };
}

/**
 * Get current date in user's local timezone (YYYY-MM-DD format)
 */
function getTodayDate() {
    const today = new Date();
    return today.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
}

/**
 * Show feedback message to user
 */
function showFeedback(message, type = 'info', duration = 5000) {
    feedbackMessage.textContent = message;
    feedbackMessage.className = 'feedback-message show ' + type;

    if (duration > 0) {
        setTimeout(() => {
            feedbackMessage.classList.remove('show');
        }, duration);
    }
}

/**
 * Set button loading state
 */
function setButtonLoading(isLoading) {
    if (isLoading) {
        checkinButton.classList.add('loading');
        checkinButton.disabled = true;
    } else {
        checkinButton.classList.remove('loading');
        checkinButton.disabled = false;
    }
}

/**
 * Get or create user in database
 */
async function getOrCreateUser(email, name) {
    try {
        const { data, error } = await window.supabaseClient.rpc('get_or_create_user', {
            p_email: email,
            p_name: name
        });

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error getting/creating user:', error);
        throw error;
    }
}

/**
 * Check if user has completed today
 */
async function hasCompletedToday(userId) {
    try {
        const today = getTodayDate();
        const { data, error } = await window.supabaseClient
            .from('completions')
            .select('id')
            .eq('user_id', userId)
            .eq('completion_date', today)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
        return !!data;
    } catch (error) {
        console.error('Error checking today completion:', error);
        return false;
    }
}

/**
 * Get user statistics
 */
async function getUserStats(userId) {
    try {
        // Get user data including first_completion_date
        const { data: userData, error: userError } = await window.supabaseClient
            .from('users')
            .select('first_completion_date')
            .eq('id', userId)
            .single();

        if (userError) throw userError;

        // Calculate stats using SQL functions
        const { data: streak, error: streakError } = await window.supabaseClient.rpc(
            'calculate_streak',
            { p_user_id: userId }
        );
        if (streakError) throw streakError;

        const { data: total, error: totalError } = await window.supabaseClient.rpc(
            'calculate_total_completions',
            { p_user_id: userId }
        );
        if (totalError) throw totalError;

        // Calculate day number
        let dayNumber = 1;
        if (userData.first_completion_date) {
            const firstDate = new Date(userData.first_completion_date);
            const today = new Date(getTodayDate());
            const diffTime = today - firstDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            dayNumber = diffDays + 1;
        }

        return {
            currentStreak: streak || 0,
            totalCompletions: total || 0,
            dayNumber: dayNumber
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        return {
            currentStreak: 0,
            totalCompletions: 0,
            dayNumber: 1
        };
    }
}

/**
 * Update UI with user statistics
 */
function updateStatsUI(stats) {
    currentStreakEl.textContent = `${stats.currentStreak} 🔥`;
    dayNumberEl.textContent = stats.dayNumber;
    totalCompletionsEl.textContent = stats.totalCompletions;
}

/**
 * Mark today as complete
 */
async function markComplete() {
    if (!currentUser || !userEmail) {
        showFeedback('User information missing. Please reload the page.', 'error');
        return;
    }

    setButtonLoading(true);
    feedbackMessage.classList.remove('show');

    try {
        const today = getTodayDate();

        // Use the mark_completion RPC function
        const { data, error } = await window.supabaseClient.rpc('mark_completion', {
            p_email: userEmail,
            p_name: userName,
            p_completion_date: today
        });

        if (error) {
            // Check for duplicate entry error
            if (error.code === '23505' || error.message.includes('duplicate')) {
                showFeedback('✅ You already completed today!', 'info');
                checkinButton.disabled = true;
                checkinButton.textContent = 'Already Completed Today';
                return;
            }
            throw error;
        }

        // Success! Update UI with new stats
        if (data && data.length > 0) {
            const result = data[0];
            updateStatsUI({
                currentStreak: result.current_streak,
                totalCompletions: result.total_completions,
                dayNumber: result.day_number
            });
        }

        showFeedback('🎉 Great job! Check-in completed successfully!', 'success');

        // Disable button and update text
        checkinButton.disabled = true;
        checkinButton.querySelector('.button-text').textContent = 'Completed Today!';

        // Reload leaderboard to show updated standings
        setTimeout(() => {
            loadLeaderboard();
        }, 1000);

    } catch (error) {
        console.error('Error marking completion:', error);
        showFeedback('❌ Failed to save check-in. Please try again.', 'error');
    } finally {
        setButtonLoading(false);
    }
}

/**
 * Load leaderboard data
 */
async function loadLeaderboard() {
    try {
        const { data, error } = await window.supabaseClient
            .from('leaderboard_view')
            .select('*')
            .limit(5);

        if (error) throw error;

        if (!data || data.length === 0) {
            leaderboardList.innerHTML = '<div class="leaderboard-empty">No completions yet. Be the first!</div>';
            return;
        }

        // Build leaderboard HTML
        let html = '';
        data.forEach((user, index) => {
            const rank = index + 1;
            const isCurrentUser = user.email === userEmail;
            const rankClass = rank <= 3 ? 'top3' : '';
            const highlightClass = isCurrentUser ? 'highlight' : '';

            html += `
                <div class="leaderboard-item ${highlightClass}">
                    <div class="leaderboard-rank ${rankClass}">${rank}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${user.name}${isCurrentUser ? ' (You)' : ''}</div>
                        <div class="leaderboard-stats">${user.total_completions} total check-ins</div>
                    </div>
                    <div class="leaderboard-streak">${user.current_streak}🔥</div>
                </div>
            `;
        });

        leaderboardList.innerHTML = html;

    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardList.innerHTML = '<div class="leaderboard-empty">Failed to load leaderboard</div>';
    }
}

/**
 * Initialize the application
 */
async function initApp() {
    // Extract URL parameters
    const params = extractURLParams();
    userName = params.name;
    userEmail = params.email;

    // Validate required parameters
    if (!userEmail) {
        welcomeMessage.textContent = '⚠️ Missing email parameter. Please access this page from your course.';
        welcomeCard.style.background = 'rgba(239, 68, 68, 0.1)';
        welcomeCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        checkinButton.disabled = true;
        return;
    }

    // Update welcome message
    welcomeMessage.textContent = `Welcome back, ${userName}! 👋`;
    welcomeCard.style.background = 'rgba(34, 197, 94, 0.1)';
    welcomeCard.style.borderColor = 'rgba(34, 197, 94, 0.3)';

    try {
        // Get or create user
        currentUser = await getOrCreateUser(userEmail, userName);

        // Load user statistics
        const stats = await getUserStats(currentUser);
        updateStatsUI(stats);

        // Check if already completed today
        const completedToday = await hasCompletedToday(currentUser);
        if (completedToday) {
            checkinButton.disabled = true;
            checkinButton.querySelector('.button-text').textContent = 'Already Completed Today';
            showFeedback('✅ You already completed today! Come back tomorrow.', 'info', 0);
        }

        // Load leaderboard
        loadLeaderboard();

        // Auto-refresh leaderboard every 30 seconds
        setInterval(loadLeaderboard, 30000);

    } catch (error) {
        console.error('Error initializing app:', error);
        welcomeMessage.textContent = '⚠️ Failed to load data. Please refresh the page.';
        welcomeCard.style.background = 'rgba(239, 68, 68, 0.1)';
        welcomeCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
}

// Event listeners
checkinButton.addEventListener('click', markComplete);

// Initialize app on page load
window.addEventListener('DOMContentLoaded', initApp);

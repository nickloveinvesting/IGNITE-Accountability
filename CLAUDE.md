# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IGNITE Accountability Tracker is a daily check-in application embedded in GoHighLevel course lessons. It tracks user completion streaks, displays personal statistics, and shows a community leaderboard.

**Tech Stack:**
- Frontend: Vanilla HTML, CSS, JavaScript (no build process)
- Backend: Supabase (PostgreSQL database with RPC functions)
- Hosting: GitHub Pages (static site)
- Integration: GoHighLevel via iframe with URL parameters

## Architecture

### Data Flow

1. **User Access**: GHL course lesson embeds tracker via iframe with URL parameters (`?name=...&email=...`)
2. **Initialization**: JavaScript extracts params, calls Supabase to get/create user
3. **Check-in**: User clicks button → RPC call to `mark_completion()` → Updates database
4. **Display**: UI shows personal stats (streak, day, total) and leaderboard (top 5)

### Database Schema

**users table:**
- Stores user profile (email, name, first_completion_date)
- `first_completion_date` used to calculate challenge day number

**completions table:**
- Records each daily check-in (user_id, completion_date)
- UNIQUE constraint on (user_id, completion_date) prevents duplicates

**Key SQL Functions:**
- `calculate_streak(user_id)`: Returns current streak with 1-day grace period
- `calculate_total_completions(user_id)`: Returns total check-ins
- `get_or_create_user(email, name)`: Upserts user record
- `mark_completion(email, name, date)`: Inserts completion and returns updated stats

**leaderboard_view:**
- Materialized view showing top users by current_streak
- Includes total_completions for secondary sorting

### Frontend Components

**index.html:**
- Single-page application structure
- Semantic HTML with accessibility considerations
- Loads Supabase JS client from CDN

**css/styles.css:**
- IGNITE brand colors (#121212 bg, #FF6A00 orange accent)
- Mobile-first responsive design
- Card-based layout with smooth animations
- Loading states and feedback messages

**js/supabase-config.js:**
- Initializes Supabase client with credentials
- Exports client to global scope for use in script.js

**js/script.js:**
- Main application logic
- URL parameter extraction
- State management (currentUser, userEmail, userName)
- CRUD operations via Supabase client
- UI updates and error handling

## Key Design Decisions

### 1. Streak Calculation with Grace Period

Users can skip ONE day without losing their streak. The `calculate_streak()` function checks if consecutive completion dates are within 2 days of each other (allowing for a 1-day gap).

**Example:**
- Day 1, Day 2, (skip Day 3), Day 4 → Streak: 4 days ✓
- Day 1, Day 2, (skip Day 3 & 4), Day 5 → Streak: 1 day (reset) ✗

### 2. Automatic Day Calculation

The "Challenge Day" is auto-calculated from the user's `first_completion_date`, not passed from GHL. This ensures consistency even if users access different lesson days out of order.

### 3. Local Timezone Handling

Completions use the user's local date (`new Date().toLocaleDateString('en-CA')`) to determine "today". This prevents issues with users in different timezones.

### 4. Public Leaderboard

All users appear on the leaderboard by default (no opt-in required). This was a conscious design choice to encourage community engagement.

### 5. No Build Process

The app uses vanilla JavaScript (no framework) and loads dependencies from CDN. This simplifies deployment to GitHub Pages and eliminates build complexity.

## Development Workflow

### Local Testing

1. Open `index.html` in browser with test params:
   ```
   file:///path/to/index.html?name=Test&email=test@test.com
   ```

2. Check browser console (F12) for errors

3. Verify Supabase connection and data flow

### Deployment

1. Update `js/supabase-config.js` with real credentials (after creating Supabase project)
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update Supabase credentials"
   git push origin main
   ```
3. GitHub Pages automatically deploys (2-3 minute delay)

### Database Changes

1. Modify `supabase/schema.sql`
2. Run updated SQL in Supabase SQL Editor
3. Test changes via Supabase Table Editor or API logs
4. Commit schema changes to repo for version control

### Debugging

**Common Issues:**

- **CORS errors**: Supabase should allow all origins by default. Check Project Settings → API → CORS.
- **RLS errors**: Verify policies allow anonymous INSERT/SELECT on tables. Check Authentication → Policies.
- **Function errors**: Test SQL functions directly in SQL Editor before calling from JS.
- **Duplicate completions**: Ensure UNIQUE constraint exists and client-side check is working.

**Monitoring:**

- Supabase Dashboard → Logs: See all API requests
- Browser DevTools → Console: Client-side errors
- Supabase Table Editor: Verify data is saving correctly

## GHL Integration

### URL Parameters

GoHighLevel passes user data via URL parameters:
- `name`: User's first name from `{{contact.first_name}}`
- `email`: User's email from `{{contact.email}}`

### Iframe Embed Code

```html
<iframe
  src="https://YOUR-USERNAME.github.io/IGNITE-Accountability/?name={{contact.first_name}}&email={{contact.email}}"
  width="100%"
  height="700"
  frameborder="0">
</iframe>
```

The tracker extracts these parameters on load and uses them to identify the user.

## Code Patterns

### Error Handling

All async functions use try-catch blocks:
```javascript
try {
  const { data, error } = await supabase.rpc('function_name');
  if (error) throw error;
  // Process data
} catch (error) {
  console.error('Error:', error);
  showFeedback('User-friendly message', 'error');
}
```

### Loading States

Buttons show loading spinner during async operations:
```javascript
setButtonLoading(true);
try {
  // API call
} finally {
  setButtonLoading(false);
}
```

### Duplicate Prevention

Check before inserting:
```javascript
const completedToday = await hasCompletedToday(userId);
if (completedToday) {
  // Disable button, show message
  return;
}
```

Database also enforces with UNIQUE constraint.

## File Organization

```
/
├── index.html          - Main app entry point
├── css/
│   └── styles.css     - All styles (mobile-first)
├── js/
│   ├── supabase-config.js  - Supabase client setup
│   └── script.js           - App logic
├── supabase/
│   └── schema.sql     - Database schema (version controlled)
├── .gitignore         - Excludes sensitive files
├── README.md          - Setup and usage guide
└── CLAUDE.md          - This file
```

## Security Considerations

- **Supabase Anon Key**: Safe to expose client-side (limited permissions via RLS)
- **Row Level Security**: Enabled on all tables with specific policies
- **No Authentication**: Users identified by email from GHL (trusted source)
- **HTTPS**: Enforced by GitHub Pages
- **Input Validation**: Supabase handles SQL injection prevention

## Future Enhancements

If extending this project, consider:
- Milestone celebrations (confetti animations)
- Admin dashboard (requires authentication)
- Email notifications (Supabase Edge Functions)
- Photo uploads (Supabase Storage)
- Progress calendar view
- Custom challenge durations

## Testing

### Manual Testing Checklist

1. ✅ Load page with valid URL params
2. ✅ Check stats display correctly
3. ✅ Click "Mark Complete" button
4. ✅ Verify stats update
5. ✅ Check button disables after completion
6. ✅ Verify leaderboard shows user
7. ✅ Test on mobile device
8. ✅ Try completing again (should show "Already Completed")
9. ✅ Check Supabase Table Editor for data
10. ✅ Test with multiple users to verify leaderboard ranking

### Edge Cases

- Missing URL parameters (email required, name optional)
- Invalid email format (database will store as-is)
- Multiple tabs open (duplicate prevention handles this)
- Timezone edge cases (midnight boundary crossings)
- Network failures (graceful error messages)

## Support

For issues or questions:
1. Check browser console for client-side errors
2. Check Supabase Logs for API errors
3. Verify schema was run correctly in SQL Editor
4. Test RLS policies allow anonymous access
5. Confirm GitHub Pages deployment succeeded

## Version History

- **v1.0** (Current): MVP with core features (streaks, leaderboard, grace period)
- Future versions will add enhancements per user feedback

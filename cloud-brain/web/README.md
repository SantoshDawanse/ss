# Sikshya-Sathi Educator Dashboard (Next.js)

Modern web dashboard for educators to monitor student progress, class performance, and curriculum coverage.

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Open in browser: http://localhost:3000
```

## Features

- **Student Progress Tracking**: View individual student progress across subjects
- **Class Performance Reports**: Aggregate class-level metrics and analytics
- **Curriculum Coverage**: Track curriculum coverage by subject and student
- **Struggling Student Identification**: Automatically identify students needing support
- **Top Performer Recognition**: Highlight high-performing students

## Technology Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: Material-UI (MUI) v5
- **Styling**: Tailwind CSS + Material-UI
- **Language**: TypeScript
- **React**: 19.2

## Project Structure

```
web/
├── app/
│   ├── components/
│   │   └── EducatorDashboard.tsx    # Main dashboard component
│   ├── layout.tsx                    # Root layout with providers
│   ├── page.tsx                      # Home page
│   ├── providers.tsx                 # MUI theme provider
│   ├── theme.tsx                     # MUI theme configuration
│   ├── types.ts                      # TypeScript interfaces
│   ├── mockData.ts                   # Development mock data
│   └── globals.css                   # Global styles
├── public/                           # Static assets
└── package.json
```

## Development

### Mock Data

The dashboard uses mock data by default for development. You'll see:
- 5 sample students with varying performance levels
- Class performance metrics
- Curriculum coverage across 3 subjects (Math, Science, English)

### Connecting to Real API

To connect to the Cloud Brain API, update the `fetchDashboardData` function in `app/components/EducatorDashboard.tsx`:

```typescript
const fetchDashboardData = async () => {
  try {
    setLoading(true);
    
    // Replace mock data with real API call
    const response = await fetch('/api/educator/dashboard', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard data');
    }

    const data = await response.json();
    setDashboardData(data);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setLoading(false);
  }
};
```

## Available Scripts

```bash
# Development
npm run dev          # Start dev server (http://localhost:3000)

# Production
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint
```

## Dashboard Tabs

### 1. Student Progress
- Individual student metrics
- Lessons and quizzes completed
- Average accuracy
- Topics mastered
- Performance status (Excellent/Good/Needs Support)

### 2. Class Performance
- Class-level aggregate metrics
- Completion rate progress bars
- Average accuracy across class
- Top performers list
- Struggling students list

### 3. Curriculum Coverage
- Subject-wise curriculum coverage
- Coverage percentage with progress bars
- Total topics vs covered topics
- Topics mastered count

## Customization

### Theme

Edit `app/theme.tsx` to customize colors:

```typescript
export const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',  // Change primary color
    },
    secondary: {
      main: '#dc004e',  // Change secondary color
    },
  },
});
```

### Adding New Features

1. Create new components in `app/components/`
2. Add new types to `app/types.ts`
3. Update mock data in `app/mockData.ts` for testing
4. Import and use in `app/page.tsx` or other pages

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Other Platforms

```bash
# Build for production
npm run build

# The output will be in .next/ directory
# Deploy the entire project folder to your hosting platform
```

## Environment Variables

Create a `.env.local` file for environment-specific configuration:

```env
NEXT_PUBLIC_API_URL=https://api.sikshya-sathi.np/v1
NEXT_PUBLIC_AUTH_DOMAIN=auth.sikshya-sathi.np
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Port already in use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
npm run dev -- -p 3001
```

### Module not found errors

```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
```

### Material-UI styling issues

Make sure the `Providers` component is properly wrapping your app in `app/layout.tsx`.

## Migration from web-dashboard

This Next.js app replaces the previous Vite-based `web-dashboard`. Key improvements:

- ✅ Better performance with Next.js App Router
- ✅ Server-side rendering support
- ✅ Improved developer experience
- ✅ Built-in optimization and code splitting
- ✅ Better TypeScript integration

## License

Proprietary - Sikshya-Sathi System

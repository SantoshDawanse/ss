# Web Dashboard Setup Guide

The Sikshya-Sathi system includes an Educator Dashboard - a web-based interface for educators to monitor student progress, class performance, and curriculum coverage.

## Quick Start

```bash
# Navigate to dashboard directory
cd cloud-brain/web-dashboard

# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser: http://localhost:5173
```

## Features

The dashboard provides three main views:

### 1. Student Progress Tab
- Individual student progress tracking
- Lessons and quizzes completed
- Average accuracy per student
- Topics mastered count
- Status indicators (Excellent / Good / Needs Support)
- Last active timestamp

### 2. Class Performance Tab
- Class-level aggregate metrics
- Completion rate progress bars
- Average accuracy across class
- Top performers list (>80% proficiency)
- Struggling students list (<40% proficiency)
- Active vs total students

### 3. Curriculum Coverage Tab
- Subject-wise curriculum coverage
- Coverage percentage with progress bars
- Total topics vs covered topics
- Topics mastered count
- Visual breakdown by subject

## Technology Stack

- **Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v5
- **Build Tool**: Vite
- **Routing**: React Router v6
- **Icons**: Material Icons

## Development

### Install Dependencies
```bash
npm install
```

### Start Dev Server
```bash
npm run dev
```
Dashboard will be available at http://localhost:5173

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Configuration

### API Endpoint

The dashboard connects to the Cloud Brain API. Configure the endpoint in `src/config.ts`:

```typescript
export const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
```

### Environment Variables

Create a `.env` file in the `web-dashboard` directory:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000/api

# Authentication (if using external auth)
VITE_AUTH_DOMAIN=auth.sikshya-sathi.np
VITE_AUTH_CLIENT_ID=your-client-id

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_EXPORT=true
```

## API Integration

The dashboard fetches data from these Cloud Brain endpoints:

### Get Complete Dashboard Data
```
GET /api/educator/dashboard
Authorization: Bearer <token>

Response:
{
  "student_progress": [...],
  "class_reports": [...],
  "curriculum_coverage": [...]
}
```

### Get Student Progress
```
GET /api/educator/student-progress?class_id=<id>
Authorization: Bearer <token>
```

### Get Class Report
```
GET /api/educator/class-report?class_id=<id>
Authorization: Bearer <token>
```

### Get Curriculum Coverage
```
GET /api/educator/curriculum-coverage?class_id=<id>
Authorization: Bearer <token>
```

## Authentication

The dashboard uses JWT Bearer token authentication:

```typescript
// Store token after login
localStorage.setItem('auth_token', token);

// Include in API requests
const response = await fetch('/api/educator/dashboard', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    'Content-Type': 'application/json',
  },
});
```

## Local Development with Mock Data

For local development without a backend, you can use mock data:

1. Create `src/mocks/mockData.ts`:

```typescript
export const mockDashboardData = {
  student_progress: [
    {
      student_id: "S001",
      student_name: "Aisha Sharma",
      subject: "Mathematics",
      lessons_completed: 15,
      quizzes_completed: 10,
      average_accuracy: 85.5,
      topics_mastered: ["Algebra", "Geometry"],
      last_active: "2024-02-20T10:30:00Z"
    },
    // ... more students
  ],
  class_reports: [
    // ... class data
  ],
  curriculum_coverage: [
    // ... coverage data
  ]
};
```

2. Use mock data in development:

```typescript
// In EducatorDashboard.tsx
const isDevelopment = import.meta.env.DEV;

useEffect(() => {
  if (isDevelopment) {
    setDashboardData(mockDashboardData);
  } else {
    fetchDashboardData();
  }
}, []);
```

## Deployment

### Option 1: AWS S3 + CloudFront

```bash
# Build for production
npm run build

# Deploy to S3
aws s3 sync dist/ s3://sikshya-sathi-dashboard --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### Option 2: AWS Amplify

1. Connect your repository to AWS Amplify Console
2. Configure build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd cloud-brain/web-dashboard
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: cloud-brain/web-dashboard/dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

3. Amplify will automatically build and deploy on push

### Option 3: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd cloud-brain/web-dashboard
vercel
```

### Option 4: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd cloud-brain/web-dashboard
npm run build
netlify deploy --prod --dir=dist
```

## Customization

### Theme

Customize the Material-UI theme in `src/theme.ts`:

```typescript
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',  // Blue
    },
    secondary: {
      main: '#dc004e',  // Pink
    },
    success: {
      main: '#4caf50',  // Green
    },
    warning: {
      main: '#ff9800',  // Orange
    },
    error: {
      main: '#f44336',  // Red
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});
```

### Add New Metrics

To add a new metric to the dashboard:

1. Update the data model in `src/types.ts`
2. Add the metric to the API response
3. Create a new component or update existing ones
4. Add the metric to the appropriate tab

Example:

```typescript
// src/types.ts
export interface StudentProgress {
  // ... existing fields
  attendance_rate: number;  // New field
}

// In StudentProgressTab.tsx
<TableCell>{student.attendance_rate}%</TableCell>
```

## Troubleshooting

### Dashboard won't start

**Issue**: `npm run dev` fails
**Solution**:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### API connection errors

**Issue**: "Failed to fetch dashboard data"
**Solution**:
1. Check API endpoint in `.env`
2. Verify Cloud Brain API is running
3. Check CORS settings on backend
4. Verify authentication token is valid

### Build fails

**Issue**: TypeScript errors during build
**Solution**:
```bash
# Check for type errors
npx tsc --noEmit

# Fix errors and rebuild
npm run build
```

### Blank page after deployment

**Issue**: Dashboard shows blank page in production
**Solution**:
1. Check browser console for errors
2. Verify base URL in `vite.config.ts`
3. Check that all assets are loading correctly
4. Verify environment variables are set

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance Optimization

### Code Splitting

Vite automatically code-splits by route. To manually split:

```typescript
import { lazy, Suspense } from 'react';

const StudentProgressTab = lazy(() => import('./StudentProgressTab'));

function Dashboard() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <StudentProgressTab />
    </Suspense>
  );
}
```

### Caching

Implement caching for API responses:

```typescript
const cache = new Map();

async function fetchWithCache(url: string) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  
  const response = await fetch(url);
  const data = await response.json();
  cache.set(url, data);
  
  return data;
}
```

### Lazy Loading Images

Use lazy loading for images:

```typescript
<img 
  src={imageUrl} 
  loading="lazy" 
  alt="Student avatar"
/>
```

## Security Best Practices

1. **Never commit secrets**: Use environment variables
2. **Validate input**: Sanitize all user input
3. **Use HTTPS**: Always use HTTPS in production
4. **Implement CSP**: Add Content Security Policy headers
5. **Regular updates**: Keep dependencies up to date

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## Monitoring

### Add Analytics

Integrate Google Analytics or similar:

```typescript
// src/analytics.ts
export function trackPageView(page: string) {
  if (window.gtag) {
    window.gtag('config', 'GA_MEASUREMENT_ID', {
      page_path: page,
    });
  }
}

// In component
useEffect(() => {
  trackPageView(window.location.pathname);
}, [location]);
```

### Error Tracking

Integrate Sentry or similar:

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: import.meta.env.MODE,
});
```

## Next Steps

1. Set up the dashboard locally
2. Connect to Cloud Brain API
3. Test with sample data
4. Customize theme and branding
5. Deploy to production
6. Monitor usage and performance

## Support

For issues or questions:
- Check `cloud-brain/web-dashboard/README.md`
- Review `cloud-brain/docs/DASHBOARD_IMPLEMENTATION.md`
- Check the main troubleshooting guide: `TROUBLESHOOTING.md`

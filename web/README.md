# SplitApp Web

A React web frontend for the SplitApp expense tracking and splitting application, built with Material-UI (MUI).

## Features

- **Authentication**: Login and registration functionality
- **Transaction Management**: Create, read, update, and delete transactions
- **Navigation**: Responsive sidebar navigation with all main features
- **Modern UI**: Built with Material-UI components and theming
- **TypeScript**: Full TypeScript support for type safety

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The app will open in your default browser at `http://localhost:3000`.

### Configuration

The app uses the same API endpoints as the React Native version. The API base URL is configured in `src/config.ts`:

- Development: `http://localhost:8080/api`
- Production: `https://shreyclinic.com/api`

## Project Structure

```
src/
├── components/          # Reusable UI components
│   └── MainLayout.tsx   # Main app layout with navigation
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication context
├── screens/            # Page components
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── TransactionsScreen.tsx
│   └── ... (other screens)
├── services/           # API services
│   ├── api.ts         # Axios configuration
│   ├── auth.ts        # Authentication API
│   └── transactions.ts # Transaction API
├── App.tsx            # Main app component
├── config.ts          # App configuration
└── index.tsx          # App entry point
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm run eject` - Ejects from Create React App (one-way operation)

## Technology Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Material-UI (MUI)** - UI component library
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Day.js** - Date manipulation
- **MUI X Date Pickers** - Date selection components

## API Integration

The web app integrates with the same backend API as the React Native app:

- Authentication endpoints: `/token/`, `/auth/register/`
- Transaction endpoints: `/transactions/`
- Other endpoints for accounts, people, categories, etc.

## Development Notes

- The app uses localStorage for token storage (instead of AsyncStorage in React Native)
- All API calls are handled through centralized service files
- The UI follows Material Design principles with MUI components
- Responsive design works on both desktop and mobile devices

## Future Enhancements

- Complete implementation of all screens (Accounts, People, Categories, etc.)
- Advanced transaction filtering and search
- Data visualization and reporting
- Offline support
- Real-time updates

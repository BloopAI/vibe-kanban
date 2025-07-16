# Vibe Kanban Mobile

React Native mobile app for Vibe Kanban - a project management tool for AI coding agents.

## Features

- **Project Management**: View and manage coding projects
- **Task Kanban Board**: Visual task management with drag-and-drop
- **Cross-platform**: iOS and Android support
- **Modern UI**: Clean, mobile-optimized interface
- **Real-time Sync**: Stay connected with your development workflow

## Screens

- **Projects**: List of all projects with progress indicators
- **Tasks**: Filterable task list view
- **Project Detail**: Kanban board for individual projects
- **Settings**: App configuration and preferences

## Tech Stack

- React Native with Expo
- Expo Router for navigation
- TypeScript for type safety
- React Native Vector Icons
- Shared types with main application

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

```bash
cd mobile
npm install
```

### Development

```bash
# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

### Building

```bash
# Build for Android
npm run build:android

# Build for iOS
npm run build:ios
```

## Project Structure

```
mobile/
├── app/                 # App screens and navigation
│   ├── (tabs)/         # Tab navigation screens
│   ├── project/        # Project detail screens
│   └── _layout.tsx     # Root layout
├── components/         # Reusable UI components
├── types/             # TypeScript type definitions
├── constants/         # App constants
└── assets/           # Images and static assets
```

## API Integration

The mobile app is designed to work with the existing Vibe Kanban backend API. Update the API endpoints in your implementation to connect to your backend server.

## Contributing

Please refer to the main project's contributing guidelines.
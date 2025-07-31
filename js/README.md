# JavaScript Modules

This directory contains the modular JavaScript files for the ChatXYZ chat application.

## File Structure

### `app.js` - Main Application Logic
- **Purpose**: Main orchestrator that coordinates all other modules
- **Responsibilities**:
  - Initializes the application
  - Handles message sending and response generation
  - Coordinates between engine, UI, and chat history modules
  - Manages message queuing

### `engine.js` - WebLLM Engine Management
- **Purpose**: Handles all WebLLM engine functionality
- **Responsibilities**:
  - Engine initialization and progress tracking
  - Welcome dialog for first-time users
  - Model loading and caching
  - AI response generation
  - URL parameter handling

### `ui.js` - UI Utilities and DOM Manipulation
- **Purpose**: Handles all UI-related functionality
- **Responsibilities**:
  - Message rendering and display
  - Smart scrolling behavior
  - Sidebar management
  - Event listener setup
  - DOM manipulation utilities

### `chat-history.js` - Chat History Management
- **Purpose**: Manages chat persistence and history
- **Responsibilities**:
  - Chat creation, loading, and deletion
  - Local storage management
  - Sidebar chat list rendering
  - Chat title management
  - Message persistence

## Module Dependencies

```
app.js
├── engine.js
├── ui.js
└── chat-history.js

ui.js
└── engine.js (for scroll state)

chat-history.js
└── ui.js (for rendering)

engine.js
└── app.js (for message handling)
```

## Usage

The main entry point is `app.js`, which is referenced in `index.html`. All other modules are imported as needed.

## Benefits

- **Separation of Concerns**: Each module has a clear, focused responsibility
- **Maintainability**: Easier to find and modify specific functionality
- **Reusability**: Modules can be reused or tested independently
- **Clarity**: Clear organization makes the codebase easier to understand 
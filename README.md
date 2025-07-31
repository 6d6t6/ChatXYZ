# ChatXYZ

A private, local AI chatbot that runs entirely in your browser using WebLLM.

## Features

- **Private & Local**: All processing happens in your browser - no data sent to servers
- **Offline Capable**: Once the model is loaded, you can disconnect from the internet
- **Fast & Responsive**: Built with modern web technologies for smooth interactions
- **Beautiful UI**: Clean, minimalist design focused on conversation

## How It Works

1. **First Visit**: The AI model (1.5GB) is downloaded and cached in your browser
2. **Subsequent Visits**: The cached model loads instantly
3. **Conversations**: Chat naturally with the AI assistant
4. **Privacy**: Everything stays on your device

## Getting Started

1. Open `index.html` in a modern web browser
2. Click "Start Chat" when prompted
3. Wait for the model to load (first time only)
4. Start chatting!

## Technical Details

- **AI Model**: Gemma 2 2B (quantized for browser performance)
- **Framework**: WebLLM for local inference
- **UI**: Vanilla JavaScript with modern CSS
- **Storage**: Browser cache for model persistence

## Browser Requirements

- Modern browser with WebAssembly support
- At least 2GB of available memory
- Stable internet connection for initial model download

## Privacy

- No data is sent to external servers
- All conversations remain on your device
- Model is cached locally in your browser
- No tracking or analytics

## Development

This is a simple static web application. To run locally:

1. Clone the repository
2. Open `index.html` in a web browser
3. No build process or server required

## License

Open source - feel free to modify and distribute.

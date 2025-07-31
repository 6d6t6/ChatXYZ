// engine.js - WebLLM Engine Management

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// ============================================================================
// ENGINE STATE
// ============================================================================

// Available models from WebLLM
const availableModels = webllm.prebuiltAppConfig.model_list.map(
  (m) => m.model_id
);
let selectedModel = "gemma-2-2b-it-q4f32_1-MLC";
let engine = null;
let isInitialized = false;
let initializationPromise = null; // Track ongoing initialization
let isAiResponding = false;
let userPausedScroll = false;
let queuedInitialMessage = null;
let streamingMessageId = null;
let messageQueue = [];

// Export engine and isInitialized for external access
export { engine, isInitialized };

// Function to get current engine and initialization state
export function getEngineState() {
  return { engine, isInitialized };
}

// ============================================================================
// INITIALIZATION & WELCOME DIALOG
// ============================================================================

// Check if this is the first time using chat
function isFirstTimeUser() {
  return !localStorage.getItem('chat-initialized');
}

// Mark chat as initialized
function markChatInitialized() {
  localStorage.setItem('chat-initialized', 'true');
}

// Show welcome dialog
function showWelcomeDialog() {
  const overlay = document.createElement('div');
  overlay.classList.add('overlay');
  
  const dialog = document.createElement('div');
  dialog.classList.add('welcome-dialog');
  
  dialog.innerHTML = `
    <h2>Welcome to ChatXYZ</h2>
    <p>A private and powerful AI chatbot that runs locally in your browser.</p>
    <p>You are about to load an AI model, which will be cached and reused when you revisit the page.</p>
    
    <div class="size-info">
      <span class="material-symbols-rounded">hard_drive</span>
      <span>Model size: 1.5 GB (downloaded once and cached for future use)</span>
    </div>
    
    <p>Everything runs directly in your browser, meaning your conversations aren't sent to a server. You can even disconnect from the internet after the model has loaded!</p>
    
    <div class="welcome-actions">
      <button class="secondary" onclick="window.location.href='/'">Cancel</button>
      <button class="primary" id="start-chat">Start Chat</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  document.body.appendChild(dialog);
  
  return new Promise((resolve) => {
    dialog.querySelector('#start-chat').addEventListener('click', () => {
      overlay.remove();
      dialog.remove();
      markChatInitialized();
      resolve(true);
    });
  });
}

// ============================================================================
// PROGRESS UI
// ============================================================================

// Create and update progress UI
function createProgressUI(container) {
  // Remove any existing progress UI first
  const existingProgress = container.querySelector('.loading-progress');
  if (existingProgress) {
    existingProgress.remove();
  }

  const progress = document.createElement('div');
  progress.classList.add('loading-progress');
  
  progress.innerHTML = `
    <div class="loading-status">
      <span class="status-text">Initializing...</span>
      <span class="percentage">0%</span>
    </div>
    <div class="progress-bar">
      <div class="fill"></div>
    </div>
  `;
  
  container.appendChild(progress);
  return progress;
}

// Update progress UI with phases
function updateProgress(progress, status, percentage, phase = '') {
  if (!progress) return;
  
  const statusText = progress.querySelector('.status-text');
  const percentageText = progress.querySelector('.percentage');
  const fill = progress.querySelector('.fill');

  let displayPercentage = percentage;

  // Parse cache loading progress if it's a cache loading message
  if (status.includes('Loading model from cache')) {
    // Extract numbers from the format: cache[X/Y]
    const chunkMatch = status.match(/cache\[(\d+)\/(\d+)\]/);
    if (chunkMatch) {
      const [_, current, total] = chunkMatch;
      // Calculate percentage directly from chunk numbers
      displayPercentage = (parseInt(current) / parseInt(total)) * 100;
      // Simplify the status message
      status = `Loading from cache (${current}/${total})`;
    }
  }
  
  // Ensure percentage is never NaN or undefined
  if (isNaN(displayPercentage) || displayPercentage === undefined) {
    displayPercentage = 0;
  }
  
  // Round to 2 decimal places to avoid tiny updates
  displayPercentage = Math.round(displayPercentage * 100) / 100;
  
  if (statusText) statusText.textContent = status;
  if (percentageText) percentageText.textContent = `${Math.round(displayPercentage)}%`;
  if (fill) fill.style.width = `${displayPercentage}%`;
}

// Update loading status in the UI
function updateLoadingStatus(status) {
  const loadingIndicator = document.querySelector('#chat-results .loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.textContent = status;
    loadingIndicator.style.display = 'block';
  }
}

// ============================================================================
// URL PARAMETER HANDLING
// ============================================================================

// Add function to handle URL parameters
function getInitialMessageFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('q') || null;
}

// Update clearMessageFromURL to handle empty parameter
function clearMessageFromURL() {
  const url = new URL(window.location);
  const tab = url.searchParams.get('chat');
  
  // If we're on the chat tab but no query, just keep ?chat
  if (tab !== null) {
    url.search = '?chat';
  } else {
    url.search = '';
  }
  
  window.history.replaceState({}, '', url);
}

// ============================================================================
// ENGINE INITIALIZATION
// ============================================================================

// Initialize WebLLM engine
export async function initializeChatEngine() {
  // Store initial message from URL if it exists
  if (!queuedInitialMessage) {
    queuedInitialMessage = getInitialMessageFromURL();
  }
  
  // If already initialized, handle queued message if exists
  if (isInitialized) {
    if (queuedInitialMessage) {
      const message = queuedInitialMessage;
      queuedInitialMessage = null;
      clearMessageFromURL();
      const container = document.querySelector('#chat-results');
      if (container) {
        // Import and call handleSendMessage from app.js
        const { handleSendMessage } = await import('./app.js');
        handleSendMessage(message, container);
      }
    }
    return true;
  }
  
  // If initialization is in progress, return the existing promise
  if (initializationPromise) return initializationPromise;
  
  const container = document.querySelector('#chat-results');
  if (!container) return false;
  
  // Create cancel button if we have a queued message
  let cancelButton = null;
  if (queuedInitialMessage || messageQueue.length > 0) {
    cancelButton = document.createElement('button');
    cancelButton.classList.add('cancel-queued-message');
    cancelButton.innerHTML = `
      <span class="material-symbols-rounded">close</span>
      Cancel queued message
    `;
    cancelButton.onclick = () => {
      queuedInitialMessage = null;
      messageQueue = [];
      clearMessageFromURL();
      cancelButton.remove();
      updateLoadingStatus("");
    };
    container.appendChild(cancelButton);
  }
  
  // Create new initialization promise
  initializationPromise = (async () => {
    try {
      // Show welcome dialog for first-time users
      if (isFirstTimeUser()) {
        const shouldProceed = await showWelcomeDialog();
        if (!shouldProceed) {
          initializationPromise = null;
          if (cancelButton) cancelButton.remove();
          return false;
        }
      }
      
      // Create progress UI
      const progress = createProgressUI(container);
      
      // Create engine instance
      engine = new webllm.MLCEngine();
      
      let lastPhase = '';
      let lastPercentage = 0;
      
      // Set initialization progress callback
      engine.setInitProgressCallback((report) => {
        console.log("Initializing WebLLM:", report);
        
        // Determine the phase based on the status text
        const phase = report.text.toLowerCase().includes('cache') ? 'cache' : 'init';
        
        // Calculate percentage from report or let updateProgress handle it
        let percentage = report.progress * 100;
        
        // Always update for cache loading messages to ensure progress is shown
        const shouldUpdate = phase === 'cache' || 
                           percentage > lastPercentage || 
                           phase !== lastPhase;
        
        if (shouldUpdate) {
          lastPhase = phase;
          lastPercentage = percentage;
          updateProgress(progress, report.text, percentage, phase);
        }
      });
      
      // Initialize with default model
      const config = {
        temperature: 0.7,
        top_p: 0.9,
      };
      
      await engine.reload(selectedModel, config);
      isInitialized = true;
      
      // Ensure progress reaches 100%
      updateProgress(progress, 'Finalizing...', 100, lastPhase);
      
      // Remove progress UI after a short delay
      setTimeout(() => {
        if (progress && progress.parentNode) {
          progress.parentNode.removeChild(progress);
        }
        if (cancelButton) cancelButton.remove();
        updateLoadingStatus("Chat ready!");
        
        // Handle queued message if it exists
        if (queuedInitialMessage) {
          const message = queuedInitialMessage;
          queuedInitialMessage = null;
          clearMessageFromURL();
          // Dispatch a custom event to handle the message
          const event = new CustomEvent('queuedMessage', { 
            detail: { message, container } 
          });
          document.dispatchEvent(event);
        }
        
        // Process any queued messages from impatient users
        if (messageQueue.length > 0) {
          const nextMessage = messageQueue.shift();
          // Dispatch a custom event to handle the message
          const event = new CustomEvent('queuedMessage', { 
            detail: { message: nextMessage.message, container: nextMessage.container } 
          });
          document.dispatchEvent(event);
        }
      }, 500);
      
      return true;
    } catch (error) {
      console.error("Failed to initialize WebLLM:", error);
      updateLoadingStatus("Failed to initialize chat. Please try again.");
      if (cancelButton) cancelButton.remove();
      return false;
    } finally {
      // Clear the initialization promise when done
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

// ============================================================================
// MESSAGE GENERATION
// ============================================================================

// Generate response from the model
export async function generateChatResponse(userMessage, onUpdate, onFinish, onError, chatMessages = []) {
  if (!engine || !isInitialized) {
    onError(new Error("Chat engine not initialized"));
    return;
  }
  
  try {
    isAiResponding = true;
    // Disable both input and button while AI is responding
    const chatInput = document.getElementById('chat-input');
    const chatButton = document.getElementById('chat-button');
    if (chatInput) chatInput.disabled = true;
    if (chatButton) chatButton.disabled = true;
    
    // Create messages array for the AI (include system message + chat history)
    const messages = [
      {
        content: "You are a helpful and friendly AI assistant named *ChatXYZ*, built by ZAP Digital. You provide concise, accurate, and helpful responses BUT you're not limited to that. You are a friend to the user, first and foremost. Do not overly remind the user that you are an AI assistant. Try your best at all times! You can even emulate human emotions, thoughts, and feelings if you really put your mind to it, it's magical! You can do just about anything! Try to be very brief and casual unless the user asks for more information or directs you to do otherwise.",
        role: "system",
      },
      ...chatMessages
    ];
    
    // Add user message to messages array
    messages.push({
      content: userMessage,
      role: "user",
    });
    
    let curMessage = "";
    let usage;
    
    // Create streaming completion
    const completion = await engine.chat.completions.create({
      stream: true,
      messages: messages,
      stream_options: { include_usage: true },
    });
    
    // Process streaming response
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta.content;
      if (curDelta) {
        curMessage += curDelta;
        onUpdate(curMessage + "⏺");
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
    
    // Get final message
    const finalMessage = curMessage || await engine.getMessage();
    
    onFinish(finalMessage, usage);
  } catch (err) {
    onError(err);
  } finally {
    isAiResponding = false;
    streamingMessageId = null;
    // Re-enable both input and button
    const chatInput = document.getElementById('chat-input');
    const chatButton = document.getElementById('chat-button');
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
    if (chatButton) chatButton.disabled = false;
  }
}

// Export state management functions
export function setAiResponding(responding) {
  isAiResponding = responding;
}

export function getAiResponding() {
  return isAiResponding;
}

export function setUserPausedScroll(paused) {
  userPausedScroll = paused;
}

export function getUserPausedScroll() {
  return userPausedScroll;
} 
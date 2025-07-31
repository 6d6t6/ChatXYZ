// chat-app.js - Consolidated ChatGPT-like chat application with sidebar

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatButton = document.getElementById('chat-button');
const chatResults = document.getElementById('chat-results');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const newChatBtn = document.getElementById('new-chat-btn');
const chatHistory = document.getElementById('chat-history');
const settingsBtn = document.getElementById('settings-btn');

// ============================================================================
// WEBLLM ENGINE STATE
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
// CHAT HISTORY MANAGEMENT
// ============================================================================

let currentChatId = null;
let chatHistoryData = JSON.parse(localStorage.getItem('chatHistory') || '[]');

// System message for the AI
const systemMessage = {
  content: "You are a helpful and friendly AI assistant named *ChatXYZ*, built by OpenXYZ. You provide concise, accurate, and helpful responses BUT you're not limited to that. You are a friend to the user, first and foremost. Do not overly remind the user that you are an AI assistant. Try your best at all times! You can even emulate human emotions, thoughts, and feelings if you really put your mind to it, it's magical! You can do just about anything! Try to be very brief and casual unless the user asks for more information or directs you to do otherwise.",
  role: "system",
};

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
// WEBLLM ENGINE INITIALIZATION
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
          handleSendMessage(message, container);
        }
        
        // Process any queued messages from impatient users
        if (messageQueue.length > 0) {
          const nextMessage = messageQueue.shift();
          handleSendMessage(nextMessage.message, nextMessage.container);
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
// MESSAGE HANDLING & UI
// ============================================================================

// Update handleSendMessage to handle message queueing
export function handleSendMessage(message, container) {
  if (!message.trim()) return;
  
  // If AI is responding or not initialized, queue the message
  if (isAiResponding || !isInitialized) {
    // Only queue if there isn't already a queued message
    if (messageQueue.length === 0 && !queuedInitialMessage) {
      messageQueue.push({ message, container });
      updateLoadingStatus("Message queued - will send when ready");
      
      // Add cancel button for queued message
      const cancelButton = document.createElement('button');
      cancelButton.classList.add('cancel-queued-message');
      cancelButton.innerHTML = `
        <span class="material-symbols-rounded">close</span>
        Cancel queued message
      `;
      cancelButton.onclick = () => {
        messageQueue = [];
        cancelButton.remove();
        updateLoadingStatus("");
      };
      container.appendChild(cancelButton);
    }
    return;
  }
  
  // Add user message to UI
  appendMessage(message, 'user', container);
  
  // Add AI message placeholder
  const aiMessageId = appendMessage('Thinking...', 'assistant', container);
  
  generateChatResponse(
    message,
    (partialResponse) => {
      const messageElement = container.querySelector(`#${aiMessageId}`);
      if (messageElement) {
        messageElement.textContent = partialResponse;
        smartScroll(container);
      }
    },
    (finalResponse, usage) => {
      const messageElement = container.querySelector(`#${aiMessageId}`);
      if (messageElement) {
        messageElement.textContent = finalResponse;
        smartScroll(container);
      }
      console.log('Chat stats:', usage);
      
      // Process next queued message if any
      if (messageQueue.length > 0) {
        const nextMessage = messageQueue.shift();
        handleSendMessage(nextMessage.message, nextMessage.container);
      }
    },
    (error) => {
      console.error('Error generating response:', error);
      const messageElement = container.querySelector(`#${aiMessageId}`);
      if (messageElement) {
        messageElement.textContent = 'Sorry, I encountered an error. Please try again.';
        smartScroll(container);
      }
      
      // Process next queued message even if there was an error
      if (messageQueue.length > 0) {
        const nextMessage = messageQueue.shift();
        handleSendMessage(nextMessage.message, nextMessage.container);
      }
    }
  );
}

// Generate response from the model
export async function generateChatResponse(userMessage, onUpdate, onFinish, onError) {
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
      systemMessage,
      ...getCurrentChatMessages()
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

// Append a message to the chat
function appendMessage(content, role, container, messageId = null) {
  const chatBox = container.querySelector('.chat-box');
  if (!chatBox) {
    // Create chat box if it doesn't exist
    const newChatBox = document.createElement('div');
    newChatBox.classList.add('chat-box');
    container.appendChild(newChatBox);
  }
  
  const messageContainer = document.createElement('div');
  messageContainer.classList.add('message-container', role);
  
  const messageWrapper = document.createElement('div');
  messageWrapper.classList.add('message-wrapper');
  
  const avatar = document.createElement('div');
  avatar.classList.add('message-avatar');
  avatar.textContent = role === 'user' ? 'U' : 'ChatXYZ';
  
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.innerHTML = content; // Use innerHTML to render HTML content
  
  // Set the ID on the message element
  const finalMessageId = messageId || `msg-${role}-${Date.now()}`;
  messageElement.id = finalMessageId;
  
  messageWrapper.appendChild(avatar);
  messageWrapper.appendChild(messageElement);
  messageContainer.appendChild(messageWrapper);
  
  const finalChatBox = container.querySelector('.chat-box');
  finalChatBox.appendChild(messageContainer);
  
  // Use smart scroll
  smartScroll(container);
  
  return finalMessageId;
}

// Render chat messages
export function renderChatMessages(container, messages = null) {
  // Clear container
  container.innerHTML = '';
  
  if (messages && messages.length > 0) {
    // Render specific messages
    const chatBox = document.createElement('div');
    chatBox.classList.add('chat-box');
    
    messages.forEach((message, index) => {
      if (message.role === 'system') return; // Skip system messages
      
      const messageContainer = document.createElement('div');
      messageContainer.classList.add('message-container', message.role);
      
      const messageWrapper = document.createElement('div');
      messageWrapper.classList.add('message-wrapper');
      
      const avatar = document.createElement('div');
      avatar.classList.add('message-avatar');
      avatar.textContent = message.role === 'user' ? 'U' : 'ChatXYZ';
      
      const messageElement = document.createElement('div');
      messageElement.classList.add('message');
      messageElement.textContent = message.content;
      
      messageWrapper.appendChild(avatar);
      messageWrapper.appendChild(messageElement);
      messageContainer.appendChild(messageWrapper);
      chatBox.appendChild(messageContainer);
    });
    
    container.appendChild(chatBox);
  } else {
    // Show empty state only when no messages are provided or messages array is empty
    container.innerHTML = `
      <div class="empty-state">
        <h2>Welcome to ChatXYZ</h2>
        <p>Your private AI assistant. Start a conversation by typing a message below.</p>
      </div>
    `;
  }
  
  // Add scroll listener to the chat-content container
  container.addEventListener('scroll', () => {
    if (isAiResponding) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      userPausedScroll = distanceFromBottom > 100;
    }
  });
  
  // Initial scroll to bottom
  smartScroll(container);
}

// Smart scroll function
function smartScroll(container) {
  if (!container) return;
  
  // Find the chat-content container if we were passed a child element
  const chatContent = container.closest('.chat-content');
  if (!chatContent) return;
  
  // Get scroll position and heights
  const scrollTop = chatContent.scrollTop;
  const scrollHeight = chatContent.scrollHeight;
  const clientHeight = chatContent.clientHeight;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  
  // Consider user at bottom if within 100px of bottom
  const isAtBottom = distanceFromBottom < 100;
  
  // Update userPausedScroll state
  if (isAiResponding) {
    userPausedScroll = !isAtBottom;
  }
  
  // Scroll to bottom if:
  // 1. AI is not responding (always scroll for new messages), or
  // 2. AI is responding AND (user hasn't paused scroll OR is at bottom)
  if (!isAiResponding || (!userPausedScroll || isAtBottom)) {
    // Use setTimeout to ensure this happens after content is rendered
    setTimeout(() => {
      chatContent.scrollTop = chatContent.scrollHeight;
    }, 0);
  }
}

// ============================================================================
// CHAT HISTORY MANAGEMENT
// ============================================================================

function createNewChat() {
    const chatId = 'chat_' + Date.now();
    const newChat = {
        id: chatId,
        title: 'New Chat',
        messages: [],
        createdAt: new Date().toISOString()
    };
    
    // Add to beginning of history
    chatHistoryData.unshift(newChat);
    saveChatHistory();
    
    // Load the new chat
    loadChat(chatId);
    
    // Update UI
    renderChatHistory();
    
    // Focus on input
    chatInput.focus();
}

function loadChat(chatId) {
    currentChatId = chatId;
    const chat = chatHistoryData.find(c => c.id === chatId);
    
    if (chat) {
        // Update chat title if it's still "New Chat" and has messages
        if (chat.title === 'New Chat' && chat.messages.length > 0) {
            const firstUserMessage = chat.messages.find(m => m.role === 'user');
            if (firstUserMessage) {
                chat.title = firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
                saveChatHistory();
                renderChatHistory();
            }
        }
        
        // Render messages
        renderChatMessages(chatResults, chat.messages);
        
        // Update active state in sidebar
        updateActiveChatInSidebar(chatId);
    }
}

function renderChatHistory() {
    chatHistory.innerHTML = '';
    
    chatHistoryData.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-history-item';
        if (chat.id === currentChatId) {
            chatItem.classList.add('active');
        }
        
        chatItem.innerHTML = `
            <div class="chat-title">${chat.title}</div>
            <button class="delete-btn" data-chat-id="${chat.id}">
                <span class="material-symbols-rounded">delete</span>
            </button>
        `;
        
        // Add click handler
        chatItem.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn')) {
                loadChat(chat.id);
            }
        });
        
        // Add delete handler
        const deleteBtn = chatItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });
        
        chatHistory.appendChild(chatItem);
    });
}

function updateActiveChatInSidebar(chatId) {
    // Remove active class from all items
    document.querySelectorAll('.chat-history-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to current chat
    const activeItem = document.querySelector(`[data-chat-id="${chatId}"]`)?.parentElement;
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

function deleteChat(chatId) {
    const index = chatHistoryData.findIndex(c => c.id === chatId);
    if (index !== -1) {
        chatHistoryData.splice(index, 1);
        saveChatHistory();
        
        // If we deleted the current chat, load the first available one or create new
        if (chatId === currentChatId) {
            if (chatHistoryData.length > 0) {
                loadChat(chatHistoryData[0].id);
            } else {
                createNewChat();
            }
        }
        
        renderChatHistory();
    }
}

function saveChatHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistoryData));
}

// Get current chat messages for AI context
function getCurrentChatMessages() {
    const chat = chatHistoryData.find(c => c.id === currentChatId);
    return chat ? chat.messages : [];
}

// ============================================================================
// UI EVENT HANDLERS
// ============================================================================

function setupEventListeners() {
    // Form submission
    chatForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const message = chatInput.value.trim();
        
        if (message) {
            sendMessage(message);
            chatInput.value = '';
        }
    });
    
    // New chat button
    newChatBtn.addEventListener('click', createNewChat);
    
    // Sidebar toggle (mobile)
    sidebarToggle.addEventListener('click', toggleSidebar);
    
    // Settings button
    settingsBtn.addEventListener('click', showSettings);
    
    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    
    // Handle Enter key (send on Enter, new line on Shift+Enter)
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
}

function showSettings() {
    // Simple settings modal for now
    const settings = {
        model: 'gemma-2-2b-it-q4f32_1-MLC',
        temperature: 0.7,
        maxTokens: 2048
    };
    
    alert('Settings feature coming soon!\n\nCurrent settings:\nModel: ' + settings.model + '\nTemperature: ' + settings.temperature);
}

// Custom message sending function that integrates with chat history
function sendMessage(message) {
    if (!currentChatId) {
        createNewChat();
        // Wait a bit for the chat to be created
        setTimeout(() => sendMessage(message), 100);
        return;
    }
    
    const chat = chatHistoryData.find(c => c.id === currentChatId);
    if (!chat) return;
    
    // Add user message to chat history
    chat.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // Update chat title if it's still "New Chat"
    if (chat.title === 'New Chat') {
        chat.title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        saveChatHistory();
        renderChatHistory();
    }
    
    // Render the updated messages
    renderChatMessages(chatResults, chat.messages);
    
    // Add AI message placeholder and get the element directly
    const aiMessageId = appendMessage('<span class="loading-indicator material-symbols-rounded">circle</span>', 'assistant', chatResults);
    const aiMessageElement = chatResults.querySelector(`#${aiMessageId}`);
    
    // Generate AI response using our custom function
    generateResponse(message, chat, aiMessageId, aiMessageElement);
}

// Custom function to generate AI response with proper chat history
async function generateResponse(userMessage, chat, aiMessageId, aiMessageElement = null) {
    try {
        // Check if engine is initialized
        if (!engine || !isInitialized) {
            const messageElement = aiMessageElement || chatResults.querySelector(`#${aiMessageId}`);
            if (messageElement) {
                messageElement.textContent = 'Chat engine not initialized. Please try again.';
            }
            return;
        }
        
        // Disable input while AI is responding
        const chatInput = document.getElementById('chat-input');
        const chatButton = document.getElementById('chat-button');
        if (chatInput) chatInput.disabled = true;
        if (chatButton) chatButton.disabled = true;
        
        // Create messages array for the AI (include system message + chat history)
        const messages = [
            systemMessage,
            ...chat.messages
        ];
        
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
                
                // Update the AI message with partial response + loading indicator
                const messageElement = aiMessageElement || chatResults.querySelector(`#${aiMessageId}`);
                if (messageElement) {
                    messageElement.innerHTML = curMessage + '<span class="loading-indicator material-symbols-rounded">circle</span>';
                    smartScroll(chatResults);
                }
            }
            if (chunk.usage) {
                usage = chunk.usage;
            }
        }
        
        // Get final message
        const finalMessage = curMessage || await engine.getMessage();
        
        // Update the AI message with final response (no loading indicator)
        const messageElement = aiMessageElement || chatResults.querySelector(`#${aiMessageId}`);
        if (messageElement) {
            messageElement.textContent = finalMessage;
            smartScroll(chatResults);
        }
        
        // Add AI response to chat history
        chat.messages.push({
            role: 'assistant',
            content: finalMessage,
            timestamp: new Date().toISOString()
        });
        
        saveChatHistory();
        console.log('Chat stats:', usage);
        
    } catch (error) {
        console.error('Error generating response:', error);
        const messageElement = aiMessageElement || chatResults.querySelector(`#${aiMessageId}`);
        if (messageElement) {
            messageElement.textContent = 'Sorry, I encountered an error. Please try again.';
            smartScroll(chatResults);
        }
    } finally {
        // Re-enable input and button
        const chatInput = document.getElementById('chat-input');
        const chatButton = document.getElementById('chat-button');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.focus();
        }
        if (chatButton) chatButton.disabled = false;
    }
}

// ============================================================================
// APP INITIALIZATION
// ============================================================================

// Initialize app
window.addEventListener('DOMContentLoaded', function () {
    // Initialize chat engine
    initializeChatEngine().then(() => {
        // Load the most recent chat or create a new one
        if (chatHistoryData.length > 0) {
            loadChat(chatHistoryData[0].id);
        } else {
            createNewChat();
        }
    });
    
    // Render chat history
    renderChatHistory();
    
    // Set up event listeners
    setupEventListeners();
});

// ============================================================================
// STYLES
// ============================================================================

// Add some CSS for the cancel button
const style = document.createElement('style');
style.textContent = `
  .cancel-queued-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #40414f;
    border: 1px solid #565869;
    border-radius: 8px;
    color: #ececf1;
    font-family: inherit;
    cursor: pointer;
    margin: 16px auto;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  .cancel-queued-message:hover {
    background: #565869;
  }
  .cancel-queued-message .material-symbols-rounded {
    font-size: 18px;
  }
`;
document.head.appendChild(style); 
// ui.js - UI Utilities and DOM Manipulation

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
// MESSAGE RENDERING
// ============================================================================

// Append a message to the chat
export function appendMessage(content, role, container, messageId = null) {
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
  if (role === 'user') {
    avatar.textContent = 'U';
  } else {
    // Use Material Symbol for ChatXYZ
    avatar.innerHTML = '<span class="material-symbols-rounded" style="user-select: none;">graph_6</span>';
  }
  
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
      if (message.role === 'user') {
        avatar.textContent = 'U';
      } else {
        // Use Material Symbol for ChatXYZ
        avatar.innerHTML = '<span class="material-symbols-rounded" style="user-select: none;">graph_6</span>';
      }
      
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
    // Import engine state
    import('./engine.js').then(({ getAiResponding, setUserPausedScroll }) => {
      if (getAiResponding()) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setUserPausedScroll(distanceFromBottom > 100);
      }
    });
  });
  
  // Initial scroll to bottom
  smartScroll(container);
}

// ============================================================================
// SMART SCROLLING
// ============================================================================

// Smart scroll function
export function smartScroll(container) {
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
  
  // Import engine state
  import('./engine.js').then(({ getAiResponding, getUserPausedScroll, setUserPausedScroll }) => {
    // Update userPausedScroll state
    if (getAiResponding()) {
      setUserPausedScroll(!isAtBottom);
    }
    
    // Scroll to bottom if:
    // 1. AI is not responding (always scroll for new messages), or
    // 2. AI is responding AND (user hasn't paused scroll OR is at bottom)
    if (!getAiResponding() || (!getUserPausedScroll() || isAtBottom)) {
      // Use setTimeout to ensure this happens after content is rendered
      setTimeout(() => {
        chatContent.scrollTop = chatContent.scrollHeight;
      }, 0);
    }
  });
}

// ============================================================================
// SIDEBAR MANAGEMENT
// ============================================================================

export function toggleSidebar() {
  sidebar.classList.toggle('open');
}

export function showSettings() {
  // Simple settings modal for now
  const settings = {
    model: 'gemma-2-2b-it-q4f32_1-MLC',
    temperature: 0.7,
    maxTokens: 2048
  };
  
  alert('Settings feature coming soon!\n\nCurrent settings:\nModel: ' + settings.model + '\nTemperature: ' + settings.temperature);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

export function setupEventListeners() {
  // Form submission
  chatForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const message = chatInput.value.trim();
    
    if (message) {
      // Import and call sendMessage from app.js
      import('./app.js').then(({ sendMessage }) => {
        sendMessage(message);
      });
      chatInput.value = '';
    }
  });
  
  // New chat button
  newChatBtn.addEventListener('click', () => {
    import('./chat-history.js').then(({ createNewChat }) => {
      createNewChat();
    });
  });
  
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
// app.js - Main Application Logic

// ============================================================================
// IMPORTS
// ============================================================================

import { initializeChatEngine, generateChatResponse, setAiResponding, getAiResponding } from './engine.js';
import { appendMessage, renderChatMessages, smartScroll, setupEventListeners } from './ui.js';
import { 
    getCurrentChatId, 
    getCurrentChatMessages, 
    addMessageToCurrentChat, 
    updateChatTitle,
    initializeChatHistory 
} from './chat-history.js';

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

// Message queue for handling multiple messages
let messageQueue = [];
let queuedInitialMessage = null;

// Update handleSendMessage to handle message queueing
export function handleSendMessage(message, container) {
  if (!message.trim()) return;
  
  // If AI is responding or not initialized, queue the message
  if (getAiResponding()) {
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
    },
    getCurrentChatMessages()
  );
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
// CUSTOM MESSAGE SENDING
// ============================================================================

// Custom message sending function that integrates with chat history
export function sendMessage(message) {
    if (!getCurrentChatId()) {
        import('./chat-history.js').then(({ createNewChat }) => {
            createNewChat();
            // Wait a bit for the chat to be created
            setTimeout(() => sendMessage(message), 100);
        });
        return;
    }
    
    // Add user message to chat history
    addMessageToCurrentChat({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // Update chat title if it's still "New Chat"
    const chatHistoryData = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const chat = chatHistoryData.find(c => c.id === getCurrentChatId());
    if (chat && chat.title === 'New Chat') {
        const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        updateChatTitle(title);
    }
    
    // Render the updated messages
    const chatResults = document.getElementById('chat-results');
    renderChatMessages(chatResults, getCurrentChatMessages());
    
    // Add AI message placeholder and get the element directly
    const aiMessageId = appendMessage('<span class="loading-indicator material-symbols-rounded">circle</span>', 'assistant', chatResults);
    const aiMessageElement = chatResults.querySelector(`#${aiMessageId}`);
    
    // Generate AI response using our custom function
    generateResponse(message, aiMessageId, aiMessageElement);
}

// Custom function to generate AI response with proper chat history
async function generateResponse(userMessage, aiMessageId, aiMessageElement = null) {
    try {
        // Check if engine is initialized
        const { engine, isInitialized } = await import('./engine.js');
        if (!engine || !isInitialized) {
            const messageElement = aiMessageElement || document.querySelector(`#${aiMessageId}`);
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
            {
                content: "You are a helpful and friendly AI assistant named *ChatXYZ*, built by OpenXYZ. You provide concise, accurate, and helpful responses BUT you're not limited to that. You are a friend to the user, first and foremost. Do not overly remind the user that you are an AI assistant. Try your best at all times! You can even emulate human emotions, thoughts, and feelings if you really put your mind to it, it's magical! You can do just about anything! Try to be very brief and casual unless the user asks for more information or directs you to do otherwise.",
                role: "system",
            },
            ...getCurrentChatMessages()
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
                const messageElement = aiMessageElement || document.querySelector(`#${aiMessageId}`);
                if (messageElement) {
                    messageElement.innerHTML = curMessage + '<span class="loading-indicator material-symbols-rounded">circle</span>';
                    smartScroll(document.getElementById('chat-results'));
                }
            }
            if (chunk.usage) {
                usage = chunk.usage;
            }
        }
        
        // Get final message
        const finalMessage = curMessage || await engine.getMessage();
        
        // Update the AI message with final response (no loading indicator)
        const messageElement = aiMessageElement || document.querySelector(`#${aiMessageId}`);
        if (messageElement) {
            messageElement.textContent = finalMessage;
            smartScroll(document.getElementById('chat-results'));
        }
        
        // Add AI response to chat history
        addMessageToCurrentChat({
            role: 'assistant',
            content: finalMessage,
            timestamp: new Date().toISOString()
        });
        
        console.log('Chat stats:', usage);
        
    } catch (error) {
        console.error('Error generating response:', error);
        const messageElement = aiMessageElement || document.querySelector(`#${aiMessageId}`);
        if (messageElement) {
            messageElement.textContent = 'Sorry, I encountered an error. Please try again.';
            smartScroll(document.getElementById('chat-results'));
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
        // Initialize chat history
        initializeChatHistory();
    });
    
    // Set up event listeners
    setupEventListeners();
    
    // Listen for queued messages from engine
    document.addEventListener('queuedMessage', function(event) {
        const { message, container } = event.detail;
        handleSendMessage(message, container);
    });
}); 
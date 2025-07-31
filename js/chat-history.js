// chat-history.js - Chat History Management

// ============================================================================
// CHAT HISTORY STATE
// ============================================================================

let currentChatId = null;
let chatHistoryData = JSON.parse(localStorage.getItem('chatHistory') || '[]');

// ============================================================================
// CHAT MANAGEMENT FUNCTIONS
// ============================================================================

export function createNewChat() {
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
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.focus();
}

export function loadChat(chatId) {
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
        import('./ui.js').then(({ renderChatMessages }) => {
            const chatResults = document.getElementById('chat-results');
            renderChatMessages(chatResults, chat.messages);
        });
        
        // Update active state in sidebar
        updateActiveChatInSidebar(chatId);
    }
}

export function renderChatHistory() {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return;
    
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

export function deleteChat(chatId) {
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

export function saveChatHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistoryData));
}

// Get current chat messages for AI context
export function getCurrentChatMessages() {
    const chat = chatHistoryData.find(c => c.id === currentChatId);
    return chat ? chat.messages : [];
}

// Get current chat ID
export function getCurrentChatId() {
    return currentChatId;
}

// Add message to current chat
export function addMessageToCurrentChat(message) {
    const chat = chatHistoryData.find(c => c.id === currentChatId);
    if (chat) {
        chat.messages.push(message);
        saveChatHistory();
    }
}

// Update chat title
export function updateChatTitle(title) {
    const chat = chatHistoryData.find(c => c.id === currentChatId);
    if (chat) {
        chat.title = title;
        saveChatHistory();
        renderChatHistory();
    }
}

// Get chat history data
export function getChatHistoryData() {
    return chatHistoryData;
}

// Initialize chat history (load first chat or create new one)
export function initializeChatHistory() {
    if (chatHistoryData.length > 0) {
        loadChat(chatHistoryData[0].id);
    } else {
        createNewChat();
    }
    
    // Render chat history
    renderChatHistory();
} 
let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let tempoStatus; 

// --- INICIALIZAÇÃO E TRAVAS ---
function aplicarTrava(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener("touchstart", function() { if (el.scrollTop <= 0) el.scrollTop = 1; }, { passive: true });
}

window.addEventListener("load", async () => {
    let savedId = localStorage.getItem("userId");
    if (savedId) {
        const res = await fetch(`/getUser/${savedId}`);
        const user = await res.json();
        if (!user.error) currentUser = user;
    }
    if (!currentUser) {
        const res = await fetch("/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "" })
        });
        currentUser = await res.json();
        localStorage.setItem("userId", currentUser.id);
    }
    
    socket.emit("register", currentUser.id);
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    if(currentUser.photo) {
        document.getElementById("profilePreview").src = currentUser.photo;
    }

    renderContacts();
    loadMomentos(); 
    setInterval(loadMessages, 1500);
    aplicarTrava("messages");
});

// --- 🔥 FUNÇÃO ADD (CORRIGIDA 100%) ---
const btnAdd = document.getElementById("addFriendBtn");
if (btnAdd) {
    btnAdd.onclick = async () => {
        const idInput = document.getElementById("addUserId");
        const id = idInput.value.trim();
        
        if (!id) return;
        if (id === currentUser.id) return alert("Você não pode se adicionar.");
        if (contacts.find(c => c.id === id)) return alert("Contato já está na lista.");

        try {
            const res = await fetch(`/getUser/${id}`);
            const user = await res.json();
            
            if(user.error || !user.id) {
                return alert("Usuário não encontrado.");
            }

            contacts.push(user);
            localStorage.setItem("contacts", JSON.stringify(contacts));
            renderContacts();
            idInput.value = "";
            alert("Adicionado com sucesso!");
        } catch (err) {
            alert("Erro na rede ao buscar usuário.");
        }
    };
}

// --- FUNÇÃO RENDERIZAR (COM EXCLUSÃO POR TOQUE LONGO) ---
function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const isSelected = contatoSelecionadoId === user.id;
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${isSelected ? 'selected' : ''}`;
        
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${isSelected ? '<span style="color:#075e54; font-weight:bold; margin-right:10px;">✓</span>' : ''}
        `;

        let pressTimer;
        contactEl.ontouchstart = () => {
            pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        };
        contactEl.ontouchend = () => clearTimeout(pressTimer);
        
        contactEl.onclick = () => {
            if (contatoSelecionadoId) cancelarSelecao();
            else abrirChat(user);
        };
        div.appendChild(contactEl);
    });
}

function ativarSelecao(id) {
    contatoSelecionadoId = id;
    document.getElementById("headerSelecao").style.display = "flex";
    renderContacts();
}

function cancelarSelecao() {
    contatoSelecionadoId = null;
    document.getElementById("headerSelecao").style.display = "none";
    renderContacts();
}

function confirmarExclusao() {
    contacts = contacts.filter(c => c.id !== contatoSelecionadoId);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    cancelarSelecao();
}

// --- RESTANTE DAS FUNÇÕES (MANTIDAS) ---
function abrirChat(user) {
    currentChat = user;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
}

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(m => {
            const div = document.createElement("div");
            div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
            div.innerHTML = `<div class="bubble">${m.text}</div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    }
}

socket.on("updateStatus", (lista) => {
    listaOnlineGlobal = lista;
    renderContacts();
});

async function loadMomentos() {
    const res = await fetch("/getMomentos");
    const momentos = await res.json();
    // lógica de renderizar momentos...
                                                                                                   }
                                                    

let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];

// Alternar menu de anexo
document.getElementById("attachmentBtn").onclick = () => {
    document.getElementById("attachmentMenu").classList.toggle("hidden");
};

// Salvar Perfil (Nome e Foto)
document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const newName = document.getElementById("username").value;
    const photoFile = document.getElementById("profilePic").files[0];
    
    let photoBase64 = currentUser.photo;

    if (photoFile) {
        const reader = new FileReader();
        reader.onloadend = async () => {
            photoBase64 = reader.result;
            await enviarUpdatePerfil(newName, photoBase64);
        };
        reader.readAsDataURL(photoFile);
    } else {
        await enviarUpdatePerfil(newName, photoBase64);
    }
};

async function enviarUpdatePerfil(username, photo) {
    const res = await fetch(`/updateUser/${currentUser.id}`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username, photo })
    });
    currentUser = await res.json();
    document.getElementById("profilePreview").src = currentUser.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    alert("Perfil atualizado!");
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
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    if(currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    renderContacts();
    setInterval(loadMessages, 1500);
});

document.getElementById("addFriendBtn").onclick = async () => {
    const input = document.getElementById("addUserId");
    const id = input.value.trim();
    if(!id || id === currentUser.id || contacts.find(c => c.id === id)) return;

    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(!user.error) {
        contacts.push(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
        input.value = "";
    } else {
        alert("Usuário não encontrado");
    }
};

document.getElementById("sendPhoto").onchange = function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
        fotoParaEnviar = ev.target.result;
        document.getElementById("imagePreviewTarget").src = fotoParaEnviar;
        document.getElementById("photoPreviewContainer").style.display = "flex";
        document.getElementById("attachmentMenu").classList.add("hidden");
    };
    reader.readAsDataURL(file);
};

function cancelarEnvioFoto() {
    fotoParaEnviar = null;
    document.getElementById("photoPreviewContainer").style.display = "none";
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if ((!text && !fotoParaEnviar) || !currentChat) return;

    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: fotoParaEnviar || text })
    });

    input.value = "";
    cancelarEnvioFoto();
    loadMessages();
};

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(addMessage);
        container.scrollTop = container.scrollHeight;
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    let conteudo = m.text.startsWith("data:image") ? `<img src="${m.text}" onclick="abrirFullScreen('${m.text}')">` : m.text;
    const date = new Date(m.timestamp);
    div.innerHTML = `<div class="bubble">${conteudo}<span class="time">${date.getHours()}:${date.getMinutes()}</span></div>`;
    container.appendChild(div);
}

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
});

function abrirChat(user) {
    currentChat = user;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("typingStatus").textContent = listaOnlineGlobal.includes(user.id) ? "Online" : "offline";
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
}

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = "contact";
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>`;
        contactEl.onclick = () => abrirChat(user);
        div.appendChild(contactEl);
    });
}

function abrirFullScreen(src) {
    document.getElementById("fullScreenImage").src = src;
    document.getElementById("fullScreenViewer").style.display = "flex";
}
function fecharFullScreen() { document.getElementById("fullScreenViewer").style.display = "none"; }
        

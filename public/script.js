let currentUser = null;
let currentChat = null;
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let tempoStatus; 
let grupoDeMomentosAtual = [];
let indiceMomentoAtual = 0;

window.addEventListener("load", async () => {
    let savedId = localStorage.getItem("userId");
    
    if (savedId) {
        const res = await fetch(`/getUser/${savedId}`);
        const user = await res.json();
        if (!user.error) {
            currentUser = user;
        }
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
    atualizarUIUsuario();
    renderContacts();
    loadMomentos(); 

    // Atualização em tempo real via Socket
    socket.on("refreshData", () => {
        loadMomentos();
        atualizarDadosContatos();
    });

    setInterval(loadMessages, 2000);
});

function atualizarUIUsuario() {
    if(!currentUser) return;
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    const fotoPadrao = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    const foto = currentUser.photo || fotoPadrao;
    document.getElementById("profilePreview").src = foto;
    document.getElementById("minhaFotoMomento").src = foto;
}

// Mudar foto ao clicar
document.getElementById("profilePreview").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentUser.photo = ev.target.result;
            atualizarUIUsuario();
        };
        reader.readAsDataURL(e.target.files[0]);
    };
    input.click();
};

// Salvar Perfil
document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    currentUser.username = document.getElementById("username").value;
    const res = await fetch("/updateUser", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ id: currentUser.id, username: currentUser.username, photo: currentUser.photo })
    });
    const data = await res.json();
    if(data.success) {
        alert("Perfil atualizado!");
        socket.emit("syncRequest");
    }
};

// --- CONTATOS ---
function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach((u, index) => {
        const contactEl = document.createElement("div");
        contactEl.className = "contact";
        contactEl.style = "display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;";
        contactEl.innerHTML = `
            <div style="display:flex; align-items:center; cursor:pointer; flex:1;" id="ct-${u.id}">
                <img src="${u.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; margin-right:12px;">
                <strong>${u.username}</strong>
            </div>
            <button onclick="removerContato(${index})" style="background:none; border:none; color:#ff5c5c; font-size:20px; cursor:pointer;">&times;</button>
        `;
        div.appendChild(contactEl);
        document.getElementById(`ct-${u.id}`).onclick = () => abrirChat(u);
    });
}

function removerContato(index) {
    if(confirm("Apagar este contato?")) {
        contacts.splice(index, 1);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
}

async function atualizarDadosContatos() {
    for (let i = 0; i < contacts.length; i++) {
        const res = await fetch(`/getUser/${contacts[i].id}`);
        const freshUser = await res.json();
        if(!freshUser.error) contacts[i] = freshUser;
    }
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
}

// --- CHAT ---
function abrirChat(user) {
    currentChat = user;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
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
    
    let html = "";
    filtered.forEach(m => {
        html += `<div class="message ${m.fromId == currentUser.id ? 'me' : 'other'}"><div class="bubble">${m.text}</div></div>`;
    });
    if(container.innerHTML !== html) {
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    if (!input.value.trim() || !currentChat) return;
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: input.value })
    });
    input.value = "";
    loadMessages();
};

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if (!id || id === currentUser.id) return;
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Usuário não encontrado");
    if(contacts.find(c => c.id === id)) return alert("Já é seu amigo");
    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
    document.getElementById("addUserId").value = "";
};

// --- MOMENTOS ---
async function loadMomentos() {
    const res = await fetch("/getMomentos");
    const todos = await res.json();
    const container = document.getElementById("listaMomentos");
    container.innerHTML = "";
    const grupos = {};

    todos.forEach(m => {
        if (m.userId === currentUser.id || contacts.find(c => c.id === m.userId)) {
            if (!grupos[m.userId]) grupos[m.userId] = { username: m.userId === currentUser.id ? "Você" : m.username, userPhoto: m.userPhoto, posts: [] };
            grupos[m.userId].posts.unshift(m);
        }
    });

    Object.keys(grupos).forEach(uId => {
        const g = grupos[uId];
        const item = document.createElement("div");
        item.className = "momento-item";
        item.onclick = () => abrirVisualizadorSequencial(g.posts);
        item.innerHTML = `
            <div class="momento-aro" style="border-color:${uId === currentUser.id ? '#075e54' : '#25D366'}">
                <img src="${g.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img">
            </div>
            <div style="font-size:11px; margin-top:4px;">${g.username}</div>
        `;
        container.appendChild(item);
    });
}

function abrirVisualizadorSequencial(posts) {
    grupoDeMomentosAtual = posts; indiceMomentoAtual = 0;
    const progress = document.getElementById("statusProgressBar");
    progress.innerHTML = "";
    posts.forEach(() => progress.innerHTML += '<div class="status-segment"><div class="status-filler"></div></div>');

    const mostrar = () => {
        clearTimeout(tempoStatus);
        if (indiceMomentoAtual >= posts.length) return fecharFullScreen();
        const m = posts[indiceMomentoAtual];
        document.getElementById("fullScreenImage").src = m.media;
        document.getElementById("fullScreenViewer").style.display = "flex";

        if (m.userId !== currentUser.id) {
            fetch("/visualizarMomento", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ momentoId: m._id, viewerId: currentUser.id }) });
        }
        
        atualizarUIStatus(m);
        const segs = progress.querySelectorAll(".status-segment");
        segs.forEach((s, i) => {
            s.classList.remove("active", "seen");
            if (i < indiceMomentoAtual) s.classList.add("seen");
            else if (i === indiceMomentoAtual) { s.style.display='none'; s.offsetHeight; s.style.display='flex'; s.classList.add("active"); }
        });
        tempoStatus = setTimeout(() => { indiceMomentoAtual++; mostrar(); }, 4000);
    };
    mostrar();
    document.getElementById("fullScreenImage").onclick = () => { indiceMomentoAtual++; mostrar(); };
}

function atualizarUIStatus(m) {
    const isMine = m.userId === currentUser.id;
    document.getElementById("viewControl").style.display = isMine ? "flex" : "none";
    document.getElementById("numViews").textContent = m.visualizacoes ? m.visualizacoes.length : 0;
    document.getElementById("btnCurtir").classList.toggle("active", m.curtidas && m.curtidas.includes(currentUser.id));
}

function toggleCurtir() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    fetch("/curtirMomento", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ momentoId: m._id, userId: currentUser.id }) })
    .then(r => r.json()).then(data => { m.curtidas = data.curtidas; atualizarUIStatus(m); });
}

function abrirListaQuemViu() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    if (m.userId !== currentUser.id) return;
    const modal = document.getElementById("viewerListModal");
    modal.style.display = "flex";
    const lista = document.getElementById("listaDeQuemViu");
    lista.innerHTML = "";
    m.visualizacoes.forEach(vId => {
        const c = contacts.find(con => con.id === vId);
        lista.innerHTML += `<div class="viewer-item">${c ? c.username : 'Visitante'}${m.curtidas.includes(vId) ? ' ❤️' : ''}</div>`;
    });
}

function fecharFullScreen() { 
    clearTimeout(tempoStatus); 
    document.getElementById("fullScreenViewer").style.display = "none"; 
    document.getElementById("viewerListModal").style.display = "none"; 
}

async function postarNovoMomento(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        await fetch("/postarMomento", { 
            method: "POST", 
            headers: {"Content-Type":"application/json"}, 
            body: JSON.stringify({ userId: currentUser.id, username: currentUser.username, userPhoto: currentUser.photo, media: e.target.result }) 
        });
        input.value = ""; 
        socket.emit("syncRequest");
    };
    reader.readAsDataURL(file);
    }
                     yId("addUserId").value.trim();
    if (!id || id === currentUser.id) return;
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Não encontrado");
    contacts.push(user); localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
};
    inválido ou já existente");
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Não encontrado");
    contacts.push(user); localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts(); document.getElementById("addUserId").value = "";
};
        

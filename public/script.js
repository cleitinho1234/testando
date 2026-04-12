let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// --- VARIÁVEIS PARA ÁUDIO E LIGAÇÃO ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let timerInterval;
let seconds = 0;
const ringtone = document.getElementById("ringtone");
let chamandoAgora = null;

// VARIÁVEIS WebRTC (VOZ EM TEMPO REAL)
let peer = null;
let streamLocal = null;

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

    const preview = document.getElementById("profilePreview");
    const fileInput = document.getElementById("profilePic");

    preview.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    renderContacts();
    setInterval(loadMessages, 1500);
});

// --- LÓGICA DE LIGAÇÃO E VOZ WebRTC ---

async function obterMediaPrivado() {
    try {
        // Para tracks antigos antes de iniciar um novo
        if (streamLocal) {
            streamLocal.getTracks().forEach(t => t.stop());
        }
        streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return streamLocal;
    } catch (err) {
        alert("Erro ao acessar microfone para chamada: " + err);
        return null;
    }
}

async function iniciarChamada() {
    if (!currentChat) return;
    
    const stream = await obterMediaPrivado();
    if (!stream) return;

    // Destrói peer anterior se existir
    if (peer) peer.destroy();

    // 2. Cria a conexão Peer (Iniciador)
    peer = new SimplePeer({ initiator: true, trickle: false, stream: streamLocal });

    // 3. Quando gerar o sinal de áudio, envia pelo socket
    peer.on('signal', sinal => {
        const dadosChamada = {
            de: currentUser.id,
            deNome: currentUser.username,
            deFoto: currentUser.photo,
            para: currentChat.id,
            sinal: sinal 
        };
        socket.emit("ligarPara", dadosChamada);
    });

    // 4. Quando receber a voz do outro
    peer.on('stream', streamRemota => {
        const audioRemoto = new Audio();
        audioRemoto.srcObject = streamRemota;
        audioRemoto.play();
    });

    peer.on('error', err => console.error("Erro no Peer:", err));
    
    abrirTelaChamada(currentChat.username, currentChat.photo, "Chamando...");
    document.getElementById("btnAceitar").style.display = "none";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
}

socket.on("recebendoLigacao", (dados) => {
    chamandoAgora = dados;
    abrirTelaChamada(dados.deNome, dados.deFoto, "Recebendo chamada...");
    document.getElementById("btnAceitar").style.display = "flex";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
});

// CORREÇÃO CRUCIAL: Finaliza a conexão no celular de quem ligou
socket.on("chamadaAceita", (dados) => {
    console.log("Chamada aceita, finalizando handshake...");
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("callStatusText").textContent = "Em chamada...";
    
    if (dados && dados.sinal && peer) {
        peer.signal(dados.sinal);
    }
});

async function aceitarChamada() {
    if(!chamandoAgora) return;

    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("callStatusText").textContent = "Conectando...";
    document.getElementById("btnAceitar").style.display = "none";
    
    const stream = await obterMediaPrivado();
    if (!stream) return;

    if (peer) peer.destroy();

    // Cria o Peer (Receptor - initiator false)
    peer = new SimplePeer({ initiator: false, trickle: false, stream: streamLocal });

    peer.on('signal', sinal => {
        // Envia resposta para quem ligou
        socket.emit("aceitarChamada", { para: chamandoAgora.de, sinal: sinal });
        document.getElementById("callStatusText").textContent = "Em chamada...";
    });

    peer.on('stream', streamRemota => {
        const audioRemoto = new Audio();
        audioRemoto.srcObject = streamRemota;
        audioRemoto.play();
    });

    peer.on('error', err => console.error("Erro no Peer receptor:", err));

    // Processa o sinal recebido do iniciador
    peer.signal(chamandoAgora.sinal);
}

function recusarChamada() {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    
    if (streamLocal) {
        streamLocal.getTracks().forEach(t => t.stop());
    }

    if(chamandoAgora) {
        socket.emit("chamadaRecusada", { para: chamandoAgora.de });
        chamandoAgora = null;
    } else if (currentChat) {
        socket.emit("chamadaRecusada", { para: currentChat.id });
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }
}

socket.on("chamadaEncerrada", () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    if (streamLocal) {
        streamLocal.getTracks().forEach(t => t.stop());
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    chamandoAgora = null;
});

function abrirTelaChamada(nome, foto, status) {
    document.getElementById("callerName").textContent = nome;
    document.getElementById("callerPhoto").src = foto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("callStatusText").textContent = status;
    document.getElementById("incomingCallScreen").style.display = "flex";
}

// ... (Resto do código de mídia e mensagens permanece igual)

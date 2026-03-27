let currentUser = null;
let currentChat = null;
let lastMessageId = null;

const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// =========================
// INICIAR
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

  document.getElementById("userIdDisplay").textContent = currentUser.id;

  renderContacts();
});

// =========================
// CONTATOS
function renderContacts(){
  const div = document.getElementById("contacts");
  div.innerHTML = "";

  contacts.forEach(user => {
    const el = document.createElement("div");
    el.className = "contact";
    el.textContent = user.username + " (ID: " + user.id + ")";

    el.onclick = () => abrirChat(user);

    div.appendChild(el);
  });
}

// =========================
// ABRIR CHAT
function abrirChat(user){
  currentChat = user;

  document.getElementById("home").style.display = "none";
  document.getElementById("chatScreen").style.display = "flex";

  document.getElementById("chatName").textContent = user.username;

  lastMessageId = null;
  document.getElementById("messages").innerHTML = "";

  loadMessages(true);
}

// =========================
// VOLTAR
function voltar(){
  document.getElementById("chatScreen").style.display = "none";
  document.getElementById("home").style.display = "block";

  currentChat = null;
}

// =========================
// ADICIONAR CONTATO
document.getElementById("addFriendBtn").onclick = async () => {

  const id = document.getElementById("addUserId").value;

  const res = await fetch(`/getUser/${id}`);
  const user = await res.json();

  if(user.error) return alert("Não encontrado");

  if(!contacts.some(c => c.id == user.id)){
    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
  }
};

// =========================
// ENVIAR
document.getElementById("sendMessageBtn").onclick = async () => {

  const text = document.getElementById("messageText").value;

  if(!text || !currentChat) return;

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      fromId: currentUser.id,
      toId: currentChat.id,
      text
    })
  });

  document.getElementById("messageText").value = "";

  // 🔥 adiciona direto (SEM atualizar tudo)
  addMessage({
    fromId: currentUser.id,
    text
  });
};

// =========================
// ADICIONAR MENSAGEM NA TELA
function addMessage(m){

  const div = document.createElement("div");
  div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = m.text;

  div.appendChild(bubble);

  document.getElementById("messages").appendChild(div);
}

// =========================
// CARREGAR MENSAGENS
async function loadMessages(initial = false){

  if(!currentChat) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const filtered = msgs.filter(m =>
    (m.fromId == currentUser.id && m.toId == currentChat.id) ||
    (m.fromId == currentChat.id && m.toId == currentUser.id)
  );

  if(initial){
    document.getElementById("messages").innerHTML = "";
    filtered.forEach(addMessage);

    if(filtered.length){
      lastMessageId = filtered[filtered.length - 1].id;
    }
  } else {
    const novas = filtered.filter(m => m.id > lastMessageId);

    novas.forEach(addMessage);

    if(novas.length){
      lastMessageId = novas[novas.length - 1].id;
    }
  }
}

// =========================
// ATUALIZA SEM PISCAR
setInterval(() => {
  loadMessages(false);
}, 2000);

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

  // 🔥 RECUPERAR NOME DO LOCALSTORAGE (GARANTE QUE NÃO SOME)
  const savedName = localStorage.getItem("username");
  if(savedName){
    currentUser.username = savedName;
  }

  // 🔥 MOSTRAR NOME
  if(currentUser.username){
    document.getElementById("username").value = currentUser.username;
  }

  renderContacts();
});

// =========================
// SALVAR PERFIL
document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const file = document.getElementById("profilePic").files[0];

  let photo = currentUser.photo;

  if(file){
    const reader = new FileReader();
    reader.onload = async () => {
      photo = reader.result;
      await salvarPerfil(username, photo);
    }
    reader.readAsDataURL(file);
  } else {
    await salvarPerfil(username, photo);
  }
});

async function salvarPerfil(username, photo){

  // 🔥 SALVA NO BACKEND
  await fetch("/saveProfile", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      id: currentUser.id,
      username,
      photo
    })
  });

  // 🔥 SALVA LOCAL (GARANTIA)
  localStorage.setItem("username", username);

  currentUser.username = username;
  currentUser.photo = photo;
}

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

  const avatar = document.getElementById("chatAvatar");
  avatar.src = user.photo && user.photo !== ""
    ? user.photo
    : "https://cdn-icons-png.flaticon.com/512/149/149071.png";

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
// ADD CONTATO
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

  addMessage({
    fromId: currentUser.id,
    text
  });
};

// =========================
// ADD MSG
function addMessage(m){

  const div = document.createElement("div");
  div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = m.text;

  div.appendChild(bubble);

  document.getElementById("messages").appendChild(div);

  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
}

// =========================
// LOAD MSG
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
setInterval(() => {
  loadMessages(false);
}, 2000);

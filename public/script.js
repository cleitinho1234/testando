let currentUser = null;
let currentChat = null;
let lastMessageId = null;

const contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let newUsers = JSON.parse(localStorage.getItem("newUsers")) || [];

// 🔥 SOCKET
const socket = io();

// =========================
// INICIAR
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

  document.getElementById("userIdDisplay").textContent = currentUser.id;

  const savedName = localStorage.getItem("username");
  if(savedName) currentUser.username = savedName;

  if(currentUser.username){
    document.getElementById("username").value = currentUser.username;
  }

  if(currentUser.photo){
    document.getElementById("profilePreview").src = currentUser.photo;
  }

  renderContacts();
});

// =========================
// SOCKET RECEBER MENSAGEM 🔥
socket.on("newMessage", async (msg) => {

  // 👉 Se estiver no chat aberto
  if (
    currentChat &&
    (
      (msg.fromId === currentChat.id && msg.toId === currentUser.id) ||
      (msg.fromId === currentUser.id && msg.toId === currentChat.id)
    )
  ) {
    const resUser = await fetch(`/getUser/${msg.fromId}`);
    const user = await resUser.json();

    addMessage(msg, user);

    const container = document.getElementById("messages");
    container.scrollTop = container.scrollHeight;
  }

  // 👉 Se NÃO estiver no chat
  else if (msg.toId === currentUser.id) {

    if (!newUsers.includes(msg.fromId)) {
      newUsers.push(msg.fromId);
      localStorage.setItem("newUsers", JSON.stringify(newUsers));
    }

    renderContacts();
  }
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
  await fetch("/saveProfile", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ id: currentUser.id, username, photo })
  });

  localStorage.setItem("username", username);

  currentUser.username = username;
  currentUser.photo = photo;

  document.getElementById("profilePreview").src = photo;

  renderContacts();
}

// =========================
// CONTATOS
async function renderContacts(){
  const div = document.getElementById("contacts");
  div.innerHTML = "";

  for (let i = 0; i < contacts.length; i++) {

    const res = await fetch(`/getUser/${contacts[i].id}`);
    const user = await res.json();

    if(!user.error) contacts[i] = user;

    const isNew = newUsers.includes(user.id);

    const el = document.createElement("div");
    el.className = "contact";

    el.innerHTML = `
      <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
           style="width:30px;height:30px;border-radius:50%;margin-right:10px;">
      <span>${user.username}</span>
      ${isNew ? `<span style="margin-left:auto;width:10px;height:10px;background:green;border-radius:50%;"></span>` : ""}
    `;

    el.style.display = "flex";
    el.style.alignItems = "center";

    el.onclick = () => abrirChat(user);

    div.appendChild(el);
  }

  localStorage.setItem("contacts", JSON.stringify(contacts));
}

// =========================
// ABRIR CHAT
async function abrirChat(user){

  const res = await fetch(`/getUser/${user.id}`);
  const updatedUser = await res.json();

  if(!updatedUser.error) user = updatedUser;

  currentChat = user;

  document.getElementById("home").style.display = "none";
  document.getElementById("chatScreen").style.display = "flex";

  document.getElementById("chatName").textContent = user.username;

  document.getElementById("chatAvatar").src =
    user.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  // remove bolinha
  newUsers = newUsers.filter(id => id != user.id);
  localStorage.setItem("newUsers", JSON.stringify(newUsers));

  lastMessageId = null;
  await loadMessages(true);
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

  const msg = {
    fromId: currentUser.id,
    toId: currentChat.id,
    text
  };

  // 🔥 salva no backend
  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(msg)
  });

  // 🔥 envia tempo real
  socket.emit("sendMessage", msg);

  document.getElementById("messageText").value = "";

  addMessage(msg, currentUser);
};

// =========================
// ADD MESSAGE
function addMessage(m, user){

  const div = document.createElement("div");
  div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

  const img = document.createElement("img");
  img.className = "avatar";
  img.src = user?.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = m.text;

  if(m.fromId == currentUser.id){
    div.appendChild(bubble);
    div.appendChild(img);
  } else {
    div.appendChild(img);
    div.appendChild(bubble);
  }

  const container = document.getElementById("messages");
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// =========================
// LOAD MESSAGES (mantido)
async function loadMessages(initial = false){

  if(!currentChat) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const filtered = msgs.filter(m =>
    (m.fromId == currentUser.id && m.toId == currentChat.id) ||
    (m.fromId == currentChat.id && m.toId == currentUser.id)
  );

  if(initial){
    const container = document.getElementById("messages");
    container.innerHTML = "";

    let html = "";

    for (let m of filtered){
      const isMe = m.fromId == currentUser.id;

      html += `
        <div class="message ${isMe ? "me" : "other"}">
          <div class="bubble">${m.text}</div>
        </div>
      `;
    }

    container.innerHTML = html;

    container.scrollTop = container.scrollHeight;
  }
}

// =========================
// ❌ REMOVE polling (não precisa mais)
// setInterval(() => {
//   loadMessages(false);
// }, 2000);

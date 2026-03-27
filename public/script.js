let currentUser = null;

// contatos salvos
const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// usuário atual do chat
let activeChatUserId = null;

// controle pra não piscar
let lastMessageCount = 0;

// =========================
// CARREGAR USUÁRIO
window.addEventListener("load", async () => {
  let savedId = localStorage.getItem("userId");

  if (savedId) {
    const res = await fetch(`/getUser/${savedId}`);
    const user = await res.json();

    if (!user.error) {
      currentUser = user;
    } else {
      localStorage.removeItem("userId");
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

  if(currentUser.username){
    document.getElementById("username").value = currentUser.username;
  }

  if(currentUser.photo){
    document.getElementById("profilePreview").src = currentUser.photo;
  }

  renderContacts();

  // 🔥 abre o primeiro contato automaticamente
  if (contacts.length > 0) {
    activeChatUserId = contacts[0].id;
    document.getElementById("friendSelect").value = activeChatUserId;
  }

  loadMessages();
});

// =========================
// MOSTRAR CONTATOS
function renderContacts() {
  const contactsDiv = document.getElementById("contacts");
  const select = document.getElementById("friendSelect");

  contactsDiv.innerHTML = "";
  select.innerHTML = "";

  contacts.forEach(user => {

    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.username;
    select.appendChild(option);

    const div = document.createElement("div");
    div.textContent = user.username + " (ID: " + user.id + ")";

    // 🔥 clicar troca conversa
    div.addEventListener("click", () => {
      activeChatUserId = user.id;
      select.value = user.id;

      // reset pra atualizar
      lastMessageCount = 0;

      loadMessages();
    });

    contactsDiv.appendChild(div);
  });
}

// 🔥 trocar pelo select também
document.getElementById("friendSelect").addEventListener("change", (e) => {
  activeChatUserId = e.target.value;
  lastMessageCount = 0;
  loadMessages();
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
      await saveProfile(username, photo);
    }
    reader.readAsDataURL(file);
  } else {
    await saveProfile(username, photo);
  }
});

async function saveProfile(username, photo){
  await fetch("/saveProfile", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ id: currentUser.id, username, photo })
  });

  currentUser.username = username;
  currentUser.photo = photo;

  document.getElementById("profilePreview").src = photo;
}

// =========================
// COPIAR ID
document.getElementById("copyIdBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(currentUser.id);
  alert("ID copiado!");
});

// =========================
// ADICIONAR CONTATO
document.getElementById("addFriendBtn").addEventListener("click", async () => {
  const friendId = document.getElementById("addUserId").value.trim();

  if(!friendId) return alert("Digite o ID do amigo");
  if(friendId === currentUser.id) return alert("Você não pode adicionar seu próprio ID");

  const res = await fetch(`/getUser/${friendId}`);
  const user = await res.json();

  if(user.error) return alert("Usuário não encontrado");

  if(!contacts.some(c => c.id === user.id)){
    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();

    // 🔥 já abre o chat com ele
    activeChatUserId = user.id;
    document.getElementById("friendSelect").value = user.id;
    lastMessageCount = 0;

    loadMessages();
  }

  document.getElementById("addUserId").value = "";
});

// =========================
// ENVIAR MENSAGEM
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const toId = activeChatUserId;
  const text = document.getElementById("messageText").value.trim();

  if(!toId || !text) return alert("Selecione um contato e digite a mensagem");

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fromId: currentUser.id, toId, text })
  });

  document.getElementById("messageText").value = "";
  loadMessages();
});

// =========================
// CHAT SEM PISCAR
async function loadMessages(){
  if(!currentUser || !activeChatUserId) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const messagesDiv = document.getElementById("messages");

  const filtered = msgs.filter(m =>
    (m.fromId === currentUser.id && m.toId === activeChatUserId) ||
    (m.fromId === activeChatUserId && m.toId === currentUser.id)
  );

  // 🔥 NÃO ATUALIZA SE NÃO MUDOU
  if (filtered.length === lastMessageCount) return;

  lastMessageCount = filtered.length;

  messagesDiv.innerHTML = "";

  for (let m of filtered){

    const isMe = m.fromId === currentUser.id;

    const resUser = await fetch(`/getUser/${m.fromId}`);
    const user = await resUser.json();

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isMe ? "me" : "other"}`;

    const img = document.createElement("img");
    img.className = "avatar";

    img.src = user.photo && user.photo !== ""
      ? user.photo
      : "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const nome = isMe ? "Você" : (user.username || m.fromId);
    bubble.textContent = `${nome}: ${m.text}`;

    if (isMe) {
      msgDiv.appendChild(bubble);
      msgDiv.appendChild(img);
    } else {
      msgDiv.appendChild(img);
      msgDiv.appendChild(bubble);
    }

    messagesDiv.appendChild(msgDiv);
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// =========================
// ATUALIZA SEM PISCAR
setInterval(() => {
  if(activeChatUserId){
    loadMessages();
  }
}, 3000);

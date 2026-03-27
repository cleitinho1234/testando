let currentUser = null;
let currentChatId = null;
let lastMessageIds = new Set();

// contatos salvos
const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

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

    div.textContent =
      user.username + " (ID: " + user.id + ")" +
      (user.novo ? " 🟢" : "");

    div.addEventListener("click", () => {
      openChat(user);
    });

    contactsDiv.appendChild(div);
  });
}

// =========================
// ABRIR CHAT
function openChat(user){
  currentChatId = user.id;

  document.getElementById("chatTitle").textContent =
    "Conversando com: " + user.username;

  document.getElementById("friendSelect").value = user.id;

  // 🔥 remove bolinha verde
  user.novo = false;
  localStorage.setItem("contacts", JSON.stringify(contacts));
  renderContacts();

  // limpa chat
  lastMessageIds.clear();
  document.getElementById("messages").innerHTML = "";

  loadChatMessages();
}

// =========================
// SELECT MUDA CHAT
document.getElementById("friendSelect").addEventListener("change", (e) => {
  const user = contacts.find(c => c.id === e.target.value);
  if(user) openChat(user);
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
// ADICIONAR CONTATO
document.getElementById("addFriendBtn").addEventListener("click", async () => {
  const friendId = document.getElementById("addUserId").value.trim();

  if(!friendId) return alert("Digite o ID");
  if(friendId === currentUser.id) return alert("Você não pode adicionar você mesmo");

  const res = await fetch(`/getUser/${friendId}`);
  const user = await res.json();

  if(user.error) return alert("Usuário não encontrado");

  if(!contacts.some(c => c.id === user.id)){
    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
  }

  document.getElementById("addUserId").value = "";
});

// =========================
// ENVIAR MENSAGEM
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const text = document.getElementById("messageText").value.trim();

  if(!currentChatId) return alert("Selecione um contato");
  if(!text) return alert("Digite a mensagem");

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      fromId: currentUser.id,
      toId: currentChatId,
      text
    })
  });

  document.getElementById("messageText").value = "";

  addMessageToScreen({
    fromId: currentUser.id,
    text
  });
});

// =========================
// ADICIONAR MENSAGEM LOCAL
function addMessageToScreen(m){
  const messagesDiv = document.getElementById("messages");

  const msgDiv = document.createElement("div");
  msgDiv.className = "message me";

  const img = document.createElement("img");
  img.className = "avatar";
  img.src = currentUser.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = `Você: ${m.text}`;

  msgDiv.appendChild(bubble);
  msgDiv.appendChild(img);

  messagesDiv.appendChild(msgDiv);

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// =========================
// DETECTAR NOVOS CONTATOS
async function loadMessages(){
  if(!currentUser) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  let mudou = false;

  for (let m of msgs){

    if(m.toId === currentUser.id){

      const existe = contacts.some(c => c.id === m.fromId);

      if(!existe){
        const resUser = await fetch(`/getUser/${m.fromId}`);
        const user = await resUser.json();

        user.novo = true;

        contacts.push(user);
        mudou = true;
      }
    }
  }

  if(mudou){
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
  }

  loadChatMessages();
}

// =========================
// CHAT SEM PISCAR
async function loadChatMessages(){
  if(!currentUser || !currentChatId) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const filtradas = msgs.filter(m =>
    (m.fromId === currentUser.id && m.toId === currentChatId) ||
    (m.fromId === currentChatId && m.toId === currentUser.id)
  );

  const messagesDiv = document.getElementById("messages");

  for (let m of filtradas){

    if (lastMessageIds.has(m.id)) continue;
    lastMessageIds.add(m.id);

    const isMe = m.fromId === currentUser.id;

    const resUser = await fetch(`/getUser/${m.fromId}`);
    const user = await resUser.json();

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isMe ? "me" : "other"}`;

    const img = document.createElement("img");
    img.className = "avatar";
    img.src = user.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

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
// ATUALIZA AUTOMÁTICO
setInterval(loadMessages, 3000);

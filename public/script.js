let currentUser = null;
let currentChatId = null;
let lastMessages = "";

const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// =========================
// CARREGAR USUÁRIO
window.addEventListener("load", async () => {
  let savedId = localStorage.getItem("userId");

  if (savedId) {
    const res = await fetch(`/getUser/${savedId}`);
    const user = await res.json();

    if (!user.error) currentUser = user;
    else localStorage.removeItem("userId");
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
});

// =========================
// CONTATOS
function renderContacts() {
  const contactsDiv = document.getElementById("contacts");
  const select = document.getElementById("friendSelect");

  contactsDiv.innerHTML = "";
  select.innerHTML = "";

  contacts.forEach(user => {

    // lista
    const div = document.createElement("div");
    div.textContent = user.username + " (ID: " + user.id + ")";

    div.addEventListener("click", () => {
      currentChatId = user.id;
      document.getElementById("chatWith").textContent = user.username;
      select.value = user.id;
      loadMessages();
    });

    contactsDiv.appendChild(div);

    // select
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.username;
    select.appendChild(option);
  });
}

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
  if(!text) return;

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
  loadMessages();
});

// =========================
// CHAT
async function loadMessages(){
  if(!currentUser || !currentChatId) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const filtered = msgs.filter(m =>
    (m.fromId === currentUser.id && m.toId === currentChatId) ||
    (m.fromId === currentChatId && m.toId === currentUser.id)
  );

  const hash = JSON.stringify(filtered);
  if(hash === lastMessages) return;

  lastMessages = hash;

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  for (let m of filtered){

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
    bubble.textContent = m.text;

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
setInterval(loadMessages, 3000);

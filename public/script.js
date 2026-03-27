let currentUser = null;

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
    div.textContent = user.username + " (ID: " + user.id + ")";

    div.addEventListener("click", () => {
      select.value = user.id;
    });

    contactsDiv.appendChild(div);
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
  }

  document.getElementById("addUserId").value = "";
});

// =========================
// ENVIAR MENSAGEM
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const toId = document.getElementById("friendSelect").value;
  const text = document.getElementById("messageText").value.trim();

  if(!toId || !text) return alert("Digite a mensagem");

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fromId: currentUser.id, toId, text })
  });

  document.getElementById("messageText").value = "";
  loadMessages();
});

// =========================
// CHAT ESTILO WHATSAPP
async function loadMessages(){
  if(!currentUser) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  for (let m of msgs){

    const isMe = m.fromId === currentUser.id;

    const resUser = await fetch(`/getUser/${m.fromId}`);
    const user = await resUser.json();

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isMe ? "me" : "other"}`;

    const img = document.createElement("img");
    img.className = "avatar";

    // 🔥 nunca quebra imagem
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
setInterval(loadMessages, 3000);

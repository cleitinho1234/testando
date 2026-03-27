let currentUser = null;
const contacts = [];

// =========================
// Cria usuário ou pega do localStorage
window.addEventListener("load", async () => {
  let savedId = localStorage.getItem("myZapId");

  if(savedId){
    const res = await fetch(`/getUser/${savedId}`);
    const user = await res.json();
    if(!user.error){
      currentUser = user;
      document.getElementById("userIdDisplay").textContent = currentUser.id;
      loadMessages();
      return;
    }
  }

  // Se não existe, cria novo usuário
  const res = await fetch("/user", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username: "Novo Usuário", photo: "" })
  });
  currentUser = await res.json();
  localStorage.setItem("myZapId", currentUser.id);
  document.getElementById("userIdDisplay").textContent = currentUser.id;
  loadMessages();
});

// =========================
// Salvar perfil
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
// Copiar ID
document.getElementById("copyIdBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(currentUser.id);
  alert("ID copiado!");
});

// =========================
// Adicionar contato
document.getElementById("addFriendBtn").addEventListener("click", async () => {
  const friendId = document.getElementById("addUserId").value.trim();
  if(!friendId) return alert("Digite o ID do amigo");
  if(friendId === currentUser.id) return alert("Você não pode adicionar seu próprio ID");

  const res = await fetch(`/getUser/${friendId}`);
  const user = await res.json();
  if(user.error) return alert("Usuário não encontrado");

  if(!contacts.some(c=>c.id===user.id)){
    contacts.push(user);

    const select = document.getElementById("friendSelect");
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.username;
    select.appendChild(option);

    const div = document.createElement("div");
    div.textContent = user.username + " (ID: " + user.id + ")";
    document.getElementById("contacts").appendChild(div);
  }

  document.getElementById("addUserId").value = "";
});

// =========================
// Enviar mensagem
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const toId = document.getElementById("friendSelect").value;
  const text = document.getElementById("messageText").value.trim();
  if(!toId || !text) return alert("Selecione um amigo e digite a mensagem");

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fromId: currentUser.id, toId, text })
  });

  document.getElementById("messageText").value = "";
  loadMessages();
});

// =========================
// Carregar mensagens
async function loadMessages(){
  if(!currentUser) return;
  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";
  msgs.forEach(m=>{
    const div = document.createElement("div");
    const from = m.fromId === currentUser.id ? "Você" : m.fromId;
    div.textContent = `${from}: ${m.text}`;
    messagesDiv.appendChild(div);
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Atualiza mensagens a cada 3s
setInterval(loadMessages, 3000);

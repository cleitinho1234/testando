let currentUser = null;

// =========================
// Salvar perfil
document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const file = document.getElementById("profilePic").files[0];
  let photo = "";

  if(file){
    const reader = new FileReader();
    reader.onload = async () => {
      photo = reader.result;

      await saveProfile(username, photo);
    }
    reader.readAsDataURL(file);
  } else {
    await saveProfile(username, "");
  }
});

async function saveProfile(username, photo){
  // Cria usuário novo se ainda não existe
  const res = await fetch("/user", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username, photo })
  });
  const user = await res.json();
  currentUser = user;
  document.getElementById("userIdDisplay").textContent = user.id;
  document.getElementById("profilePreview").src = user.photo || "";
  loadMessages();
}

// =========================
// Copiar ID
document.getElementById("copyIdBtn").addEventListener("click", () => {
  const id = document.getElementById("userIdDisplay").textContent;
  navigator.clipboard.writeText(id);
  alert("ID copiado!");
});

// =========================
// Adicionar contato
document.getElementById("addFriendBtn").addEventListener("click", async () => {
  const friendId = document.getElementById("addUserId").value;
  if(!friendId) return alert("Digite o ID do amigo");

  const res = await fetch(`/getUser/${friendId}`);
  const user = await res.json();

  if(user.error) return alert("Usuário não encontrado");

  // Adiciona no select e na lista de contatos
  const select = document.getElementById("friendSelect");
  const optionExists = Array.from(select.options).some(o=>o.value===user.id);
  if(!optionExists){
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.username;
    select.appendChild(option);

    const contactsDiv = document.getElementById("contacts");
    const div = document.createElement("div");
    div.textContent = user.username + " (ID: " + user.id + ")";
    contactsDiv.appendChild(div);
  }

  document.getElementById("addUserId").value = "";
});

// =========================
// Enviar mensagem
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const toId = document.getElementById("friendSelect").value;
  const text = document.getElementById("messageText").value;
  if(!currentUser || !toId || !text) return;

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
  msgs.forEach(m => {
    const div = document.createElement("div");
    const from = m.fromId === currentUser.id ? "Você" : m.fromId;
    div.textContent = `${from}: ${m.text}`;
    messagesDiv.appendChild(div);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Atualiza mensagens a cada 3s
setInterval(loadMessages, 3000);

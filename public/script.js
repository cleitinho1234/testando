const express = require("express");
const app = express();

app.use(express.json({ limit: "10mb" }));

let users = {};
let messages = [];

// =========================
// CRIAR USUÁRIO

app.post("/user", (req, res) => {
  const id = Date.now().toString();

  users[id] = {
    id,
    username: req.body.username,
    photo: req.body.photo || ""
  };

  res.json(users[id]);
});

// =========================
// PEGAR USUÁRIO

app.get("/getUser/:id", (req, res) => {
  const user = users[req.params.id];

  if (!user) return res.json({ error: true });

  res.json(user); // 🔥 inclui photo
});

// =========================
// SALVAR PERFIL

app.post("/saveProfile", (req, res) => {
  const { id, username, photo } = req.body;

  if (!users[id]) return res.json({ error: true });

  users[id].username = username;
  users[id].photo = photo; // 🔥 salva foto

  res.json({ success: true });
});

// =========================
// ENVIAR MENSAGEM

app.post("/sendMessage", (req, res) => {
  messages.push(req.body);
  res.json({ ok: true });
});

// =========================
// PEGAR MENSAGENS

app.get("/getMessages/:id", (req, res) => {
  const userId = req.params.id;

  const result = messages.filter(m =>
    m.fromId === userId || m.toId === userId
  );

  res.json(result);
});

// =========================

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});

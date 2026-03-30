const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

// CONFIGURAÇÃO DE LIMITE PARA FOTOS GRANDES
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro Mongo:", err));

// ==========================
// Modelos
const User = mongoose.model("User", {
    id: String,
    username: String,
    photo: String,
    lastSeen: Number
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    timestamp: Number
});

// ==========================
// Rota de Presença (Online)
app.post("/updatePresence", async (req, res) => {
    const { userId } = req.body;
    await User.findOneAndUpdate({ id: userId }, { lastSeen: Date.now() });
    res.sendStatus(200);
});

// Criar novo usuário
app.post("/user", async (req, res) => {
    const { username, photo } = req.body;
    let id;
    while (true) {
        id = Math.floor(1000 + Math.random() * 9000).toString();
        const existe = await User.findOne({ id });
        if (!existe) break;
    }
    const user = new User({ id, username, photo, lastSeen: Date.now() });
    await user.save();
    res.json(user);
});

// Salvar Perfil (Foto e Nome)
app.post("/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    try {
        await User.findOneAndUpdate(
            { id },
            { username, photo, lastSeen: Date.now() },
            { upsert: true }
        );
        res.send({ success: true });
    } catch (err) {
        res.status(500).send({ error: "Erro ao salvar foto muito grande" });
    }
});

// Buscar usuário
app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) res.send(user);
    else res.status(404).send({ error: "Não encontrado" });
});

// Enviar mensagem
app.post("/sendMessage", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });
    res.json({ success: true, msg });
});

// Buscar mensagens
app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({
        $or: [ { fromId: req.params.id }, { toId: req.params.id } ]
    }).sort({ timestamp: 1 });
    res.send(msgs);
});

// Porta para o Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));

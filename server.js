const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// 🔥 CONFIGURAÇÃO PARA ACEITAR FOTOS (Aumenta o limite de tamanho do JSON)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

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
    photo: String
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    timestamp: Number
});

// ==========================
// Lógica de Status e Atualização em Tempo Real
let usuariosOnline = {}; 

io.on("connection", (socket) => {
    // Registro de entrada
    socket.on("register", (userId) => {
        socket.userId = userId;
        usuariosOnline[userId] = socket.id;
        io.emit("updateStatus", Object.keys(usuariosOnline));
    });

    // 🔥 NOVIDADE: Quando alguém muda o perfil, avisa todos os outros
    socket.on("updateProfileVisual", (dados) => {
        socket.broadcast.emit("userUpdated", dados);
    });

    // Registro de saída
    socket.on("disconnect", () => {
        if (socket.userId) {
            delete usuariosOnline[socket.userId];
            io.emit("updateStatus", Object.keys(usuariosOnline));
        }
    });
});

// ==========================
// Rotas API
app.post("/user", async (req, res) => {
    try {
        const { username, photo } = req.body;
        let id;
        while (true) {
            id = Math.floor(1000 + Math.random() * 9000).toString();
            const existe = await User.findOne({ id });
            if (!existe) break;
        }
        const user = new User({ id, username, photo });
        await user.save();
        res.json(user);
    } catch (e) { res.status(500).send(e); }
});

app.post("/saveProfile", async (req, res) => {
    try {
        const { id, username, photo } = req.body;
        await User.findOneAndUpdate({ id }, { username, photo }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) res.send(user);
    else res.status(404).send({ error: "Não encontrado" });
});

app.post("/sendMessage", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });
    res.json({ success: true, msg });
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({
        $or: [{ fromId: req.params.id }, { toId: req.params.id }]
    }).sort({ timestamp: 1 });
    res.send(msgs);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

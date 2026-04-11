const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
// 🔥 Limite de 15mb para aguentar o upload de fotos de perfil e momentos em alta qualidade
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado com sucesso!"))
  .catch(err => console.log("Erro ao conectar no Mongo:", err));

// ==========================
// Modelos de Dados
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

const Momento = mongoose.model("Momento", {
    userId: String,
    username: String,
    userPhoto: String,
    media: String,
    visualizacoes: { type: [String], default: [] },
    curtidas: { type: [String], default: [] },
    timestamp: { type: Date, default: Date.now, expires: 86400 } // Some após 24h
});

// ==========================
// Lógica de Usuários Online (Socket.io)
let usuariosOnline = {}; 

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        usuariosOnline[userId] = socket.id;
        io.emit("updateStatus", Object.keys(usuariosOnline));
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete usuariosOnline[socket.userId];
            io.emit("updateStatus", Object.keys(usuariosOnline));
        }
    });
});

// ==========================
// Rotas da API - Usuário
app.post("/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = new User({ id, username: req.body.username, photo: req.body.photo });
    await user.save();
    res.json(user);
});

app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.send(user || { error: "Não encontrado" });
});

// 🔥 ROTA DE ATUALIZAÇÃO GLOBAL DE PERFIL
app.post("/updateUser", async (req, res) => {
    try {
        const { id, username, photo } = req.body;

        // 1. Atualiza o cadastro principal
        await User.findOneAndUpdate({ id: id }, { username, photo });

        // 2. Sincroniza a foto nova em todos os Momentos já postados pelo usuário
        await Momento.updateMany(
            { userId: id }, 
            { username: username, userPhoto: photo }
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================
// Rotas da API - Chat
app.post("/sendMessage", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ 
        $or: [{ fromId: req.params.id }, { toId: req.params.id }] 
    }).sort({ timestamp: 1 });
    res.send(msgs);
});

// ==========================
// Rotas da API - Momentos (Status)
app.post("/postarMomento", async (req, res) => {
    try {
        const { userId, username, userPhoto, media } = req.body;
        const novo = await Momento.create({ 
            userId, username, userPhoto, media,
            visualizacoes: [], curtidas: []
        });
        res.json(novo);
    } catch (err) {
        res.status(500).send(err);
    }
});

app.get("/getMomentos", async (req, res) => {
    const momentos = await Momento.find().sort({ timestamp: -1 });
    res.send(momentos);
});

app.post("/visualizarMomento", async (req, res) => {
    const { momentoId, viewerId } = req.body;
    // $addToSet evita que o mesmo ID apareça duas vezes na lista de quem viu
    await Momento.findByIdAndUpdate(momentoId, { $addToSet: { visualizacoes: viewerId } });
    res.sendStatus(200);
});

app.post("/curtirMomento", async (req, res) => {
    const { momentoId, userId } = req.body;
    try {
        const momento = await Momento.findById(momentoId);
        if (!momento) return res.sendStatus(404);

        const index = momento.curtidas.indexOf(userId);
        if (index === -1) {
            momento.curtidas.push(userId); // Curte
        } else {
            momento.curtidas.splice(index, 1); // Descurte
        }

        await momento.save();
        res.json({ curtidas: momento.curtidas });
    } catch (err) {
        res.status(500).send(err);
    }
});

// ==========================
// Inicialização
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`--- MINI-ZAP ONLINE ---`);
    console.log(`Porta: ${PORT}`);
});

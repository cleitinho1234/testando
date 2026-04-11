const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
// 🔥 Configuração para aceitar fotos pesadas (essencial para os Momentos)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro ao conectar:", err));

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

// Modelo de Momentos Atualizado com arrays de interações
const Momento = mongoose.model("Momento", {
    userId: String,
    username: String,
    userPhoto: String,
    media: String,
    visualizacoes: { type: [String], default: [] }, // Array de IDs de quem viu
    curtidas: { type: [String], default: [] },      // Array de IDs de quem curtiu
    timestamp: { type: Date, default: Date.now, expires: 86400 } 
});

// ==========================
// Lógica de Status (Socket.io)
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
// Rotas da API

// Criar novo usuário
app.post("/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = new User({ id, username: req.body.username, photo: req.body.photo });
    await user.save();
    res.json(user);
});

// Buscar usuário por ID
app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.send(user || { error: "Não encontrado" });
});

// Enviar mensagem
app.post("/sendMessage", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

// Buscar histórico de mensagens
app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.send(msgs);
});

// --- ROTAS PARA MOMENTOS ---

// Postar um novo Momento
app.post("/postarMomento", async (req, res) => {
    try {
        const { userId, username, userPhoto, media } = req.body;
        const novoMomento = await Momento.create({ 
            userId, 
            username, 
            userPhoto, 
            media,
            visualizacoes: [],
            curtidas: []
        });
        res.json(novoMomento);
    } catch (err) {
        res.status(500).send(err);
    }
});

// Buscar todos os Momentos ativos
app.get("/getMomentos", async (req, res) => {
    try {
        const momentos = await Momento.find().sort({ timestamp: -1 });
        res.send(momentos);
    } catch (err) {
        res.status(500).send(err);
    }
});

// 🔥 Registrar Visualização
app.post("/visualizarMomento", async (req, res) => {
    const { momentoId, viewerId } = req.body;
    try {
        // Usa o $addToSet para garantir que o ID só seja adicionado uma vez (evita duplicatas)
        await Momento.findByIdAndUpdate(momentoId, { 
            $addToSet: { visualizacoes: viewerId } 
        });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send(err);
    }
});

// 🔥 Curtir/Descurtir Momento
app.post("/curtirMomento", async (req, res) => {
    const { momentoId, userId } = req.body;
    try {
        const momento = await Momento.findById(momentoId);
        if (!momento) return res.status(404).send("Momento não encontrado");

        const jaCurtiu = momento.curtidas.includes(userId);
        
        if (jaCurtiu) {
            // Se já curtiu, remove a curtida
            momento.curtidas = momento.curtidas.filter(id => id !== userId);
        } else {
            // Se não curtiu, adiciona
            momento.curtidas.push(userId);
        }

        await momento.save();
        res.json({ curtidas: momento.curtidas });
    } catch (err) {
        res.status(500).send(err);
    }
});

// ==========================
// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.json({ limit: '15mb' })); // Aumentado para fotos de alta qualidade
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro ao conectar:", err));

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

const Momento = mongoose.model("Momento", {
    userId: String,
    username: String,
    userPhoto: String,
    media: String,
    visualizacoes: { type: [String], default: [] },
    curtidas: { type: [String], default: [] },
    timestamp: { type: Date, default: Date.now, expires: 86400 } 
});

// Lógica de Online
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

// --- ROTAS DO USUÁRIO ---
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

app.post("/updateUser", async (req, res) => {
    const { id, username, photo } = req.body;
    await User.findOneAndUpdate({ id }, { username, photo });
    res.json({ success: true });
});

// --- ROTAS DE CHAT ---
app.post("/sendMessage", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.send(msgs);
});

// --- ROTAS DE MOMENTOS ---
app.post("/postarMomento", async (req, res) => {
    const { userId, username, userPhoto, media } = req.body;
    const novo = await Momento.create({ userId, username, userPhoto, media });
    res.json(novo);
});

app.get("/getMomentos", async (req, res) => {
    const momentos = await Momento.find().sort({ timestamp: -1 });
    res.send(momentos);
});

app.post("/visualizarMomento", async (req, res) => {
    const { momentoId, viewerId } = req.body;
    await Momento.findByIdAndUpdate(momentoId, { $addToSet: { visualizacoes: viewerId } });
    res.sendStatus(200);
});

app.post("/curtirMomento", async (req, res) => {
    const { momentoId, userId } = req.body;
    const momento = await Momento.findById(momentoId);
    if (!momento) return res.sendStatus(404);
    const index = momento.curtidas.indexOf(userId);
    if (index === -1) momento.curtidas.push(userId);
    else momento.curtidas.splice(index, 1);
    await momento.save();
    res.json({ curtidas: momento.curtidas });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));

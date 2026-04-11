const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro Mongo:", err));

// Modelos
const User = mongoose.model("User", { id: String, username: String, photo: String });
const Message = mongoose.model("Message", { fromId: String, toId: String, text: String, timestamp: Number });
const Momento = mongoose.model("Momento", {
    userId: String, username: String, userPhoto: String, media: String,
    visualizacoes: { type: [String], default: [] },
    curtidas: { type: [String], default: [] },
    timestamp: { type: Date, default: Date.now, expires: 86400 } 
});

// Socket.io
io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        io.emit("updateStatus", "refresh");
    });
    // Avisa todos para atualizar quando alguém mudar o perfil ou postar momento
    socket.on("syncRequest", () => {
        io.emit("refreshData");
    });
    socket.on("disconnect", () => {
        io.emit("updateStatus", "refresh");
    });
});

// Rotas
app.post("/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = new User({ id, username: req.body.username, photo: req.body.photo || "" });
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
    await Momento.updateMany({ userId: id }, { username, userPhoto: photo });
    res.json({ success: true });
});

app.post("/sendMessage", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.send(msgs);
});

app.post("/postarMomento", async (req, res) => {
    const novo = await Momento.create(req.body);
    res.json(novo);
});

app.get("/getMomentos", async (req, res) => {
    const momentos = await Momento.find().sort({ timestamp: -1 });
    res.send(momentos);
});

app.post("/visualizarMomento", async (req, res) => {
    await Momento.findByIdAndUpdate(req.body.momentoId, { $addToSet: { visualizacoes: req.body.viewerId } });
    res.sendStatus(200);
});

app.post("/curtirMomento", async (req, res) => {
    const m = await Momento.findById(req.body.momentoId);
    if(!m) return res.sendStatus(404);
    const idx = m.curtidas.indexOf(req.body.userId);
    if (idx === -1) m.curtidas.push(req.body.userId); else m.curtidas.splice(idx, 1);
    await m.save();
    res.json({ curtidas: m.curtidas });
});

server.listen(3000, () => console.log("Servidor em http://localhost:3000"));

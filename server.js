const express = require("express");

const mongoose = require("mongoose");

const path = require("path");



const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));



// ==========================

// Conexão MongoDB

mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")

  .then(() => console.log("Mongo conectado"))

  .catch(err => console.log(err));



// ==========================

// Modelos

const User = mongoose.model("User", {

    id: String,        // ID único do usuário

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

// Pré-popular usuários fixos (10 IDs)

const usuariosFixos = [

    { id: "1001", username: "Cleitinho", photo: "" },

    { id: "1002", username: "Tommy", photo: "" },

    { id: "1003", username: "Luffy", photo: "" },

    { id: "1004", username: "Zoro", photo: "" },

    { id: "1005", username: "Nami", photo: "" },

    { id: "1006", username: "Sanji", photo: "" },

    { id: "1007", username: "Usopp", photo: "" },

    { id: "1008", username: "Chopper", photo: "" },

    { id: "1009", username: "Robin", photo: "" },

    { id: "1010", username: "Franky", photo: "" },

];



async function criarUsuariosFixos() {

    for (let u of usuariosFixos) {

        const existe = await User.findOne({ id: u.id });

        if (!existe) {

            await new User(u).save();

        }

    }

}

criarUsuariosFixos();



// ==========================

// Criar novo usuário com ID único automático

app.post("/user", async (req, res) => {

    const { username, photo } = req.body;



    // Gera ID único de 4 dígitos

    let id;

    while (true) {

        id = Math.floor(1000 + Math.random() * 9000).toString();

        const existe = await User.findOne({ id });

        if (!existe) break;

    }



    const user = new User({ id, username, photo });

    await user.save();

    res.json(user);

});



// ==========================

// Atualizar perfil

app.post("/saveProfile", async (req, res) => {

    const { id, username, photo } = req.body;



    await User.findOneAndUpdate(

        { id },

        { username, photo },

        { upsert: true }

    );



    res.send({ success: true });

});



// ==========================

// Buscar usuário por ID

app.get("/getUser/:id", async (req, res) => {

    const user = await User.findOne({ id: req.params.id });



    if (user) res.send(user);

    else res.status(404).send({ error: "Usuário não encontrado" });

});



// ==========================

// Enviar mensagem

app.post("/sendMessage", async (req, res) => {

    const { fromId, toId, text } = req.body;



    const remetente = await User.findOne({ id: fromId });

    const destinatario = await User.findOne({ id: toId });

    if (!remetente || !destinatario)

        return res.status(404).json({ error: "ID não encontrado" });



    const msg = await Message.create({

        fromId,

        toId,

        text,

        timestamp: Date.now()

    });



    res.json({ success: true, msg });

});



// ==========================

// Buscar mensagens de/para um usuário

app.get("/getMessages/:id", async (req, res) => {

    const id = req.params.id;



    const msgs = await Message.find({

        $or: [

            { fromId: id },

            { toId: id }

        ]

    }).sort({ timestamp: 1 });



    res.send(msgs);

});



// ==========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

const luffy = document.getElementById("luffy");

let x = 100;
let y = 100;

// animação
let frame = 0;
let frameWidth = 48;
let frameHeight = 48;
let linha = 0;

// teclas
let teclas = {};

document.addEventListener("keydown", (e) => {
teclas[e.key] = true;
});

document.addEventListener("keyup", (e) => {
teclas[e.key] = false;
});

// loop do jogo
function loop() {

let andando = false;

if (teclas["ArrowRight"]) {
x += 5;
linha = 1;
andando = true;
}

if (teclas["ArrowLeft"]) {
x -= 5;
linha = 1;
andando = true;
}

// anima só se estiver andando
if (andando) {
frame++;
if (frame > 5) frame = 0;
} else {
frame = 0;
}

// posição
luffy.style.left = x + "px";
luffy.style.top = y + "px";

// sprite
let posX = frame * frameWidth;
let posY = linha * frameHeight;

luffy.style.backgroundPosition = `-${posX}px -${posY}px`;

requestAnimationFrame(loop);
}

loop();

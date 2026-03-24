const luffy = document.getElementById("luffy");

let x = 50;

// animação
let frame = 0;
let frameWidth = 48;
let frameHeight = 48;
let linha = 1;

let teclas = {};

document.addEventListener("keydown", (e) => {
teclas[e.key] = true;
});

document.addEventListener("keyup", (e) => {
teclas[e.key] = false;
});

function loop() {

```
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

if (andando) {
    frame++;
    if (frame > 5) frame = 0;
} else {
    frame = 0;
}

// movimento
luffy.style.left = x + "px";

// animação da sprite
let posX = frame * frameWidth;
let posY = linha * frameHeight;

luffy.style.backgroundPosition = `-${posX}px -${posY}px`;

requestAnimationFrame(loop);
```

}

loop();

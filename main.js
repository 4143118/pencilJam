/*
MDN references:
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerenter_event
https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
 */

//Intro dialog
const introDialog = document.querySelector("#intro-dialog");
const startButton = document.querySelector("#start-button");
introDialog.showModal();

startButton.addEventListener("click", () => {
    unlockAudio();
    introDialog.close();
});

//Find elements
const pencilButtons = document.querySelectorAll(".pencil-button");
const slots = document.querySelectorAll(".note-slot");
const eraserButton = document.querySelector("#eraser-button");
const playbackButton = document.querySelector("#playback-button");

// Playback control is unavailable until the first pencil is placed.
playbackButton.disabled = true;
playbackButton.addEventListener("click", () => {
    const icon = playbackButton.querySelector(".playback-icon");
    if (audioTimer !== null) {
        // Pause the music loop
        clearInterval(audioTimer);
        audioTimer = null;

        icon.classList.remove("is-pause");
        icon.classList.add("is-play");
        playbackButton.setAttribute("aria-label", "Replay music");
    } else {
        //Replay the melody from the first step
        currentStep = 0;
        startAudio();

        icon.classList.remove("is-play");
        icon.classList.add("is-pause");
        playbackButton.setAttribute("aria-label", "Pause music");
    }
});

//A small movement is a click, moving more than 6 pixels starts a drag.
const dragThreshold = 6;
//Stores the pencil or eraser currently being moved.
let gesture = null;

//These control the sound and track which of the six steps is playing.
let audioContext = null;
let audioTimer = null;
let currentStep = 0;

//the time between two steps can be changed by the ruler
let stepDuration = 250;

// Keep the visible part of each image inside the CSS asset window.
// Create the image and its wrapper together, so the same code can be reused for different
// pencils and other assets.
function makeAsset(className, imagePath) {
    const wrapper = document.createElement("span");
    wrapper.className = `asset ${className}`;

    const image = document.createElement("img");
    image.src = imagePath; image.alt = ""; image.draggable = false;
    wrapper.append(image);
    return wrapper;
}

//Long and short pencils use different images at the same scale.
function makePencil(color, length = "long") {
    const suffix = length === "short" ? "-short" : "";

    return makeAsset(
        "art-pencil",
        `sources/pencil-${color}${suffix}.png`
    );
}

//Replace the original images with asset windows to remove transparent space.
eraserButton.replaceChildren(
    makeAsset("art-eraser", "sources/eraser.png")
);

//Show a pencil in this button or slot, and save its colour and length so
//the code can use them later.
function renderPencil(element, color, length) {
    element.dataset.pencil = color;
    element.dataset.length = length;
    element.replaceChildren(makePencil(color, length));

    if (element.classList.contains("note-slot")) {
        const row = Number(element.dataset.row) + 1;
        const step = Number(element.dataset.step) + 1;

        element.setAttribute(
            "aria-label",
            `Row ${row}, step ${step}, ${length} ${color} pencil`
        );
    }
}

//Clicking a pencil in the case changes its length before placing it.
function togglePencil(button) {
    const nextLength =
        button.dataset.length === "short" ? "long" : "short";

    renderPencil(
        button,
        button.dataset.pencil,
        nextLength
    );
}

//if user puts new pencil to grid after they stopped the music track, audio still disabled
function placePencil(slot, color, length) {
    // Copy the pencil, leaving the original in the case.
    renderPencil(slot, color, length);

    // Only the first pencil placement starts playback automatically.
    if (playbackButton.disabled) {
        playbackButton.disabled = false;
        currentStep = 0;
        startAudio();
    }
}

function eraseSlot(slot) {
    // The eraser only removes the pencil from the chosen slot.
    slot.replaceChildren();
    delete slot.dataset.pencil;
    delete slot.dataset.length;

    const row = Number(slot.dataset.row) + 1;
    const step = Number(slot.dataset.step) + 1;

    slot.setAttribute(
        "aria-label",
        `Row ${row}, step ${step}, empty`
    );
}

//The same pointer gesture works for pencils and the eraser.
function beginGesture(event, source, tool) {
    if (gesture || event.button !== 0) return;

    unlockAudio();

    gesture = {
        source,
        tool,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        color: source.dataset.pencil,
        length: source.dataset.length,
        ghost: null
    };

    //Keep tracking this drag when the pointer moves away from the pencil towards a slot.
    source.setPointerCapture(event.pointerId);
    event.preventDefault();
}

pencilButtons.forEach((button) => {
    renderPencil(button, button.dataset.pencil, "long");

    button.addEventListener("pointerdown", (event) => {
        beginGesture(event, button, "pencil");
    });

    //Preview the sound of pencil when the pointer enters it.
    //Browsers may require one click or drag before hover audio can play.
    button.addEventListener("pointerenter", () => {
        if (audioContext?.state === "running") {
            playSound(
                button.dataset.pencil,
                button.dataset.length,
                0,
                true
            );
        }
    });
});


//eraser button event istener
eraserButton.addEventListener("pointerdown", (event) => {
    beginGesture(event, eraserButton, "eraser");
});

// Make a temporary copy that follows the pointer.
function startDrag() {
    const ghost = document.createElement("div");
    const isEraser = gesture.tool === "eraser";

    ghost.className = isEraser
        ? "drag-pencil drag-eraser"
        : "drag-pencil";

    ghost.style.width = `${gesture.source.offsetWidth}px`;

    ghost.append(
        isEraser
            ? makeAsset("art-eraser", "sources/eraser.png")
            : makePencil(gesture.color, gesture.length)
    );

    document.body.append(ghost);
    gesture.ghost = ghost;
}

//Move the temporary image to the pointer's current position.
function moveGhost(x, y) {
    gesture.ghost.style.left = `${x}px`;
    gesture.ghost.style.top = `${y}px`;
}

//Check whether the pointer is currently over a note slot.
function getTargetSlot(x, y) {
    return document
        .elementFromPoint(x, y)
        ?.closest(".note-slot");
}

//Remove the highlight from all slots.
function clearHighlights() {
    slots.forEach((slot) => {
        slot.classList.remove("is-target");
    });
}

//When the drag ends, remove its temporary image and reset the drag state.
function endGesture() {
    gesture?.ghost?.remove();
    gesture = null;
    clearHighlights();
}

document.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    // Small movement counts as a click. Larger movement starts a drag.
    if (!gesture.ghost) {
        const distance = Math.hypot(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY
        );

        if (distance < dragThreshold) return;

        startDrag();
    }

    //Make the temporary tool follow the pointer.
    moveGhost(event.clientX, event.clientY);

    //highlight only the slot currently under the pointer.
    clearHighlights();

    const target = getTargetSlot(event.clientX, event.clientY);

    if (target) {
        target.classList.add("is-target");
    }
});

//run this code when the user releases the pointer
document.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (gesture.ghost) {
        //If a drag happened, check whether the tool was released over a slot
        const target = getTargetSlot(event.clientX, event.clientY);

        if (target) {
            if (gesture.tool === "eraser") {
                //The eraser clears the slot
                eraseSlot(target);
            } else {
                //A pencil is copied into the slot
                placePencil(
                    target,
                    gesture.color,
                    gesture.length
                );
            }
        }
    } else if (gesture.tool === "pencil") {
        //if there was no drag, treat it as a click and change the pencil;s length
        togglePencil(gesture.source);
    }

    //remove the temporary tool and highlight after interaction
    endGesture();
});

// During debugging, I found that an interrupted drag could leave the temporary image behind.
//clear the drag state when the browser cancels the pointer interaction.
document.addEventListener("pointercancel", endGesture);

/*
 * Placed pencils have no click event.
 * Their length is decided before dragging them into the grid.
 * The eraser must also be dragged into a slot.
 */

// Prepare audio without starting the music loop.
function unlockAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume();
    }
}

// Start the music loop when needed.
function startAudio() {
    unlockAudio();

    if (audioTimer !== null) return;
    // Play each step using the speed selected on the ruler.
    audioTimer = setInterval(() => {
        if (audioContext.state !== "running") return;

        slots.forEach((slot) => {
            if (
                Number(slot.dataset.step) === currentStep &&
                slot.dataset.pencil
            ) {
                playSound(
                    slot.dataset.pencil,
                    slot.dataset.length,
                    currentStep
                );
            }
        });

        currentStep = (currentStep + 1) % 6;
    }, stepDuration);
}
//Give each colour a different sound and each length a different volume.
//cuz this is the prototype stage, I just use code to make some noise
//I will change it at the later stage
function playSound(color, length, step, preview = false) {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Raised from the previous version. Short remains quieter than long.
    const baseVolume = length === "short" ? 0.09 : 0.22;
    const volume = preview ? baseVolume * 0.6 : baseVolume;

    const melody = [
        261.63, 293.66, 329.63,
        392.00, 440.00, 392.00
    ];

    let duration;

    if (color === "red") {
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(
            melody[step],
            now
        );
        duration = 0.22;
    } else if (color === "yellow") {
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.exponentialRampToValueAtTime(
            45,
            now + 0.12
        );
        duration = 0.16;
    } else {
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(
            melody[step] * 2,
            now
        );
        duration = 0.35;
    }

    // Keep hover previews short so repeated exploration feels responsive.
    if (preview) {
        duration = Math.min(duration, 0.15);
    }

    // Fade the sound in and out to avoid a click at its edges.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
        volume,
        now + 0.008
    );
    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);

    oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
    };
}

/* The marker follows the mouse while the ruler is being dragged.
The music speed changes only when the mouse is released.
This gives children time to choose a position before hearing it.*/
const ruler = document.querySelector(".ruler-stage");
let rulerDrag = null;

function getRulerPosition(mouseX) {
    const box = ruler.getBoundingClientRect();
    const position = (mouseX - box.left) / box.width;
    return Math.max(0, Math.min(1, position));
}

ruler.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    rulerDrag = {
        startX: event.clientX,
        moved: false
    };

    event.preventDefault();
});

document.addEventListener("mousemove", (event) => {
    if (!rulerDrag) return;

    // A small movement is still a click, not a ruler drag.
    if (
        !rulerDrag.moved &&
        Math.abs(event.clientX - rulerDrag.startX) < 6
    ) return;

    rulerDrag.moved = true;

    // Show the possible position, but do not change the sound yet.
    const amount = getRulerPosition(event.clientX);
    ruler.style.setProperty("--speed-position", `${amount * 100}%`);
});

document.addEventListener("mouseup", (event) => {
    if (!rulerDrag) return;

    if (rulerDrag.moved) {
        const amount = getRulerPosition(event.clientX);

        //Set the speed only when the drag is finished.
        //Left = 400 ms, middle = 250 ms, right = 100 ms.
        stepDuration = 400 - amount * 300;
        ruler.style.setProperty("--speed-position", `${amount * 100}%`);
    }
// The old interval keeps its original speed, so replace it.
    clearInterval(audioTimer);
    audioTimer = null;
    startAudio();
    rulerDrag = null;
});

// I used ChatGPT to help implement the ruler's speed control.
// While debugging, I found that changing stepDuration alone did not
// change the music's speed. setInterval keeps the delay it was created
// with, so I clear the old loop and start a new one after releasing the ruler.
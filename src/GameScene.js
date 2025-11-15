export default class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");

        // game state
        this.currentPlayable = [];        // playable sets (values)
        this.selectedIndices = [];       // indices of user's selected cards (NOT values)
        this.diceHidden = false;

        // constants
        this.CARD_COUNT = 6;
        this.COLORS = ["red", "blue", "green", "yellow"]; // user requested: use all colors

        // helpers for pending animations / moves
        this._pendingAIMoves = null;
        this._pendingPlayerMoves = null;
        this.isRolling = false;
        this._swapTimer = null;

        this._activeShakeTweens = [];
        this.difficulty = "hard";
    }

    preload() {
        // background + table
        this.load.image("bg", "./assets/bg/bg.png");
        this.load.image("table_red", "./assets/table/table_red.png");
        this.load.image("table_blue", "./assets/table/table_blue.png");
        this.load.image("table_green", "./assets/table/table_green.png");

        // card faces for 1..6 and all colors
        for (const c of this.COLORS) {
            for (let v = 1; v <= this.CARD_COUNT; v++) {
                this.load.image(`${v}_${c}`, `./assets/cards/${v}_${c}.png`);
            }
        }

        // dice
        for (let i = 1; i <= 6; i++) {
            this.load.image(`dice_${i}`, `./assets/dice/dice_${i}.png`);
        }
    }

    startContinuousShake(card) {
        if (!card || card.isShaking) return;

        card.isShaking = true;

        card._shakeTween = this.tweens.add({
            targets: card,
            x: card.slotX + Phaser.Math.Between(-6, 6),
            duration: 80,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        this._activeShakeTweens.push(card._shakeTween);
    }

    create() {
        // layout constants
        const topY = this.scale.height * 0.28;  // AI row
        const midY = this.scale.height * 0.50;  // Result row
        const bottomY = this.scale.height * 0.72;  // User row
        const startX = this.scale.width * 0.28;    // leftmost card in each row
        const gapX = this.scale.width * 0.085;    // spacing between cards
        const CARD_W = 240;
        const CARD_H = 360;

        // background
        const bg = this.add.image(0, 0, "bg").setOrigin(0).setDisplaySize(this.scale.width, this.scale.height);

        // pick table randomly (include yellow)
        const tableOptions = ["table_red", "table_blue", "table_green"];
        const tableKey = Phaser.Utils.Array.GetRandom(tableOptions);
        const table = this.add.image(this.scale.width / 2, this.scale.height / 2, tableKey);
        const tableWidth = this.scale.width * 0.90;
        table.setScale(tableWidth / table.width);
        this.table = table;

        // helper for slot graphics
        const makeSlot = (x, y) => {
            const slot = this.add.graphics();
            slot.lineStyle(3, 0xffffff, 0.8);
            slot.fillStyle(0xffffff, 0);
            const radius = 20;
            const w = CARD_W;
            const h = CARD_H;
            slot.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
            slot.slotX = x;
            slot.slotY = y;
            slot.width = w;
            slot.height = h;
            slot.cardImage = null; // will hold the sprite on top
            return slot;
        };

        // choose colors for AI and player (now include yellow possibility)
        const colors = ["red", "blue", "green", "yellow"];
        this.aiColor = Phaser.Utils.Array.GetRandom(colors);
        // user color must differ
        this.userColor = Phaser.Utils.Array.GetRandom(colors.filter(c => c !== this.aiColor));
        console.log("AI color =", this.aiColor);
        console.log("User color =", this.userColor);

        // hands (numbers 1..6) — 0 means empty
        this.aiCards = Array.from({ length: this.CARD_COUNT }, (_, i) => i + 1);
        this.userCards = Array.from({ length: this.CARD_COUNT }, (_, i) => i + 1);

        // Keep original slot mapping (value → original index) so returns go back correctly
        // Values are unique so this is straightforward
        this.userOriginalIndexByValue = {};
        this.aiOriginalIndexByValue = {};
        for (let i = 0; i < this.CARD_COUNT; i++) {
            const v = i + 1;
            this.userOriginalIndexByValue[v] = i;
            this.aiOriginalIndexByValue[v] = i;
        }

        // result slots data: for value X (index X-1) holds current owner + prevIndex
        this.resultSlotsData = [];
        for (let i = 0; i < this.CARD_COUNT; i++) {
            this.resultSlotsData.push({ value: 0, owner: "none", prevIndex: null });
        }

        // build slot containers
        this.aiSlots = [];
        this.resultSlots = [];
        this.userSlots = [];

        for (let i = 0; i < this.CARD_COUNT; i++) {
            const x = startX + i * gapX;
            this.aiSlots.push(makeSlot(x, topY));
            this.resultSlots.push(makeSlot(x, midY));
            this.userSlots.push(makeSlot(x, bottomY));
        }

        if (!this.textures.exists('cardShine')) {
            const g = this.make.graphics({ add: false });
            // a thin white bar (we will rotate it when used)
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 180, 44);
            g.generateTexture('cardShine', 180, 44);
            g.destroy();
        }

        // layers
        this.backgroundLayer = this.add.layer();
        this.cardLayer = this.add.layer();
        this.diceLayer = this.add.layer().setDepth(999999);

        // draw initial hands and result
        this.drawSlots(this.aiSlots, this.aiCards, this.aiColor);
        this.drawResultSlots();
        this.drawSlots(this.userSlots, this.userCards, this.userColor);

        this.startRandomShine();


        // UI layer (deprecated, replaced by diceLayer)
        // this.uiLayer = this.add.layer();
        this.uiLayer = this.add.layer();

        // dice image + shadow
        this.diceImage = this.add.image(this.scale.width * 0.5, this.scale.height * 0.5, "dice_1").setDisplaySize(400, 400).setDepth(9999);
        this.diceLayer.add(this.diceImage);

        this.diceShadow = this.add.ellipse(this.diceImage.x, this.diceImage.y + this.diceImage.displayHeight * 0.45, 300, 80, 0x000000, 0.35).setDepth(9998);
        this.diceLayer.add(this.diceShadow);

        // roll button
        this.rollBtn = this.createButton(this.scale.width * 0.5, this.scale.height * 0.65, "ROLL", 300, 110, () => this.rollDice());
        this.diceLayer.add(this.rollBtn.btn);
        this.diceLayer.add(this.rollBtn.label);

        // turn text
        this.currentTurn = "player";
        this.turnText = this.add.text(this.scale.width * 0.5, this.scale.height * 0.08, this.currentTurn === "player" ? "Your Turn" : "Opponent's Turn", {
            fontSize: "128px",
            fontWeight: "bold",
            color: this.currentTurn === "player" ? this.userColor : this.aiColor,
            stroke: "#ffffff",
            strokeThickness: 6
        }).setOrigin(0.5);
        this.diceLayer.add(this.turnText);

        // subtle bob for dice
        this.tweens.add({ targets: this.diceImage, y: this.diceImage.y - 50, duration: 1800, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
        this.tweens.add({ targets: this.diceShadow, scaleX: 0.9, scaleY: 0.9, duration: 1800, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });

        // initial availability
        this.updateCardAvailability();

        // enable user clicks
        this.enableUserCardClicks();
    }

    shineCard(card) {
        if (!card || !card.postFX) return;

        // add shine
        const fx = card.postFX.addShine(0.5, 0.25, 5);

        // long shine sweep (change duration as you like)
        this.tweens.add({
            targets: fx,
            progress: 1,
            duration: 1800, // <--- increase for longer shine
            ease: "Sine.easeInOut",
            onComplete: () => {
                // remove only THIS shine effect, not all FX
                if (card.postFX && card.postFX.list) {
                    const list = card.postFX.list;
                    const i = list.indexOf(fx);
                    if (i !== -1) list.splice(i, 1);
                }
            }
        });
    }

    spinReplace(newSprite) {
        if (!newSprite) return;

        // start small and rotated
        newSprite.setScale(0.6);
        newSprite.setAngle(-90);
        newSprite.setAlpha(0);

        // animate into view with rotation + scale
        this.tweens.add({
            targets: newSprite,
            angle: 0,
            scale: 1,
            alpha: 1,
            duration: 350,
            ease: "Back.easeOut"
        });
    }

    startRandomShine() {
        // every 2–5 seconds, shine a random visible card
        this.time.addEvent({
            delay: Phaser.Math.Between(2000, 5000),
            loop: true,
            callback: () => {
                const allCards = [];

                // collect visible card sprites
                this.userSlots.forEach(s => { if (s.cardImage) allCards.push(s.cardImage); });
                this.aiSlots.forEach(s => { if (s.cardImage) allCards.push(s.cardImage); });
                this.resultSlots.forEach(s => { if (s.cardImage) allCards.push(s.cardImage); });

                if (allCards.length === 0) return;

                const card = Phaser.Utils.Array.GetRandom(allCards);
                this.shineCard(card);
            }
        });
    }

    // ---------------------- Drawing / slots ----------------------
    drawResultSlots() {
        for (let i = 0; i < this.CARD_COUNT; i++) {
            const slot = this.resultSlots[i];
            const data = this.resultSlotsData[i];

            const color = data.owner === "player" ? this.userColor : this.aiColor;
            const key = data.value === 0 ? null : `${data.value}_${color}`;

            // If empty slot
            if (!key) {
                if (slot.cardImage) {
                    slot.cardImage.destroy();
                    slot.cardImage = null;
                }
                continue;
            }

            // If same sprite already exists → DO NOT recreate (fixes shake)
            if (slot.cardImage && slot.cardImage.texture.key === key) {
                slot.cardImage.slotX = slot.slotX;
                slot.cardImage.slotY = slot.slotY;
                continue;
            }

            // Otherwise replace it
            if (slot.cardImage) slot.cardImage.destroy();

            slot.cardImage = this.add.image(slot.slotX, slot.slotY, key);
            this.cardLayer.add(slot.cardImage);
            slot.cardImage.setDisplaySize(slot.width, slot.height);
            slot.cardImage.slotX = slot.slotX;
            slot.cardImage.slotY = slot.slotY;
        }
    }

    drawSlots(slots, values, color) {
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const value = values[i];

            if (slot.cardImage) {
                slot.cardImage.destroy();
                slot.cardImage = null;
            }

            if (value > 0) {
                const key = `${value}_${color}`;
                slot.cardImage = this.add.image(slot.slotX, slot.slotY, key);
                this.cardLayer.add(slot.cardImage);
                slot.cardImage.setDisplaySize(slot.width, slot.height);
                slot.cardImage.slotX = slot.slotX;
                slot.cardImage.slotY = slot.slotY;
            }
        }
    }

    // ---------------------- Core game helpers ----------------------
    isPlayerTurn() { return this.currentTurn === "player"; }
    isAITurn() { return this.currentTurn === "ai"; }

    switchTurn() {
        this.currentTurn = this.isPlayerTurn() ? "ai" : "player";
        console.log("Turn switched. Current turn:", this.currentTurn);
        this.updateTurnUI();
    }

    // choose random playable for easy AI
    chooseAIMove_Easy(playableSets) {
        if (!playableSets || playableSets.length === 0) return null;
        return Phaser.Utils.Array.GetRandom(playableSets);
    }

    updateTurnUI() {
        // ensure dice are visible for the active turn
        this.diceImage.setVisible(true);
        this.diceShadow.setVisible(true);

        if (this.isPlayerTurn()) {
            this.turnText.setText("Your Turn");
            this.turnText.setColor(this.userColor);

            this.rollBtn.btn.setVisible(true);
            this.rollBtn.label.setVisible(true);
            this.rollBtn.btn.setInteractive();

            // fade in UI pieces
            this.rollBtn.btn.alpha = 0; this.rollBtn.label.alpha = 0; this.diceImage.alpha = 0; this.diceShadow.alpha = 0;
            this.tweens.add({ targets: [this.rollBtn.btn, this.rollBtn.label, this.diceImage, this.diceShadow], alpha: 1, duration: 350, ease: "Quad.easeOut" });

        } else {
            this.turnText.setText("Opponent's Turn");
            this.turnText.setColor(this.aiColor);

            this.rollBtn.btn.disableInteractive();
            this.rollBtn.btn.setVisible(false);
            this.rollBtn.label.setVisible(false);

            // ensure dice visible and immediate AI roll
            this.diceImage.alpha = 1;
            this.diceShadow.alpha = 1;

            this.time.delayedCall(900, () => this.rollDice(true));
        }
    }

    // ---------------------- Dice animations and rolling ----------------------
    showFinalNumber(value, color = "#ffffff") {
        if (this.finalText) this.finalText.destroy();
        const fontSize = Math.floor(this.scale.height * 0.16);
        this.finalText = this.add.text(this.scale.width * 0.50, this.scale.height * 0.32, value.toString(), {
            fontSize: fontSize + "px",
            color: color,
            fontStyle: "bold",
            stroke: "#ffffff",
            strokeThickness: 18
        }).setOrigin(0.5);

        this.diceLayer.add(this.finalText);
        this.finalText.setScale(0.1);
        this.tweens.add({
            targets: this.finalText, scale: 1.25, duration: 350, ease: "Back.easeOut", onComplete: () => {
                this.tweens.add({ targets: this.finalText, alpha: 0, duration: 500, delay: 900, onComplete: () => this.finalText.destroy() });
            }
        });
    }

    startFaceSwap(finalValue, onDone) {
        if (this._swapTimer) { this._swapTimer.remove(); this._swapTimer = null; }
        const delays = [50, 70, 100, 140, 190, 260, 340, 460];
        let index = 0;
        const doSwap = () => {
            if (index >= delays.length) {
                this.diceImage.setTexture(`dice_${finalValue}`);
                this._swapTimer = null; if (onDone) onDone(); return;
            }
            let f = Phaser.Math.Between(1, 6);
            if (f === finalValue) f = (f % 6) + 1;
            this.diceImage.setTexture(`dice_${f}`);
            this._swapTimer = this.time.delayedCall(delays[index], () => { index++; doSwap(); });
        };
        doSwap();
    }

    rollDice(isAI = false) {
        if (!isAI && this.isAITurn()) return;
        if (this.isRolling) return;
        this.isRolling = true;

        if (!isAI) {
            this.rollBtn.btn.disableInteractive();
            this.rollBtn.btn.setVisible(false);
            this.rollBtn.label.setVisible(false);
        }

        const dice = this.diceImage; const shadow = this.diceShadow;
        if (this._swapTimer) { this._swapTimer.remove(); this._swapTimer = null; }

        const ox = dice.x; const oy = dice.y; const oScaleX = dice.scaleX; const oScaleY = dice.scaleY; const oAngle = dice.angle || 0;
        const updateShadow = () => { shadow.x = dice.x; const lift = oy - dice.y; const t = Phaser.Math.Clamp(lift / 160, 0, 1); const s = 1 - t * 0.55; shadow.scaleX = s; shadow.scaleY = s; };

        let rapidTimer = this.time.addEvent({ delay: 60, loop: true, callback: () => { const f = Phaser.Math.Between(1, 6); dice.setTexture(`dice_${f}`); } });

        this.tweens.chain({
            targets: [dice], tweens: [
                { x: ox + Phaser.Math.Between(-25, 25), y: oy - Phaser.Math.Between(100, 160), angle: oAngle + 360, scaleX: oScaleX * 0.92, scaleY: oScaleY * 1.08, duration: 280, ease: "Quad.easeOut", onUpdate: updateShadow },
                { x: ox - Phaser.Math.Between(50, 90), y: oy + Phaser.Math.Between(20, 40), angle: oAngle + 540, scaleX: oScaleX, scaleY: oScaleY, duration: 320, ease: "Back.easeOut", onUpdate: updateShadow },
                { x: ox + Phaser.Math.Between(50, 90), angle: oAngle - 300, duration: 260, ease: "Cubic.easeInOut", onUpdate: updateShadow },
                { y: oy - 60, duration: 180, ease: "Quad.easeOut", onUpdate: updateShadow },
                { x: ox, y: oy, angle: oAngle, scaleX: oScaleX, scaleY: oScaleY, duration: 300, ease: "Quad.easeOut", onUpdate: updateShadow }
            ], onComplete: () => {
                if (rapidTimer) { rapidTimer.remove(); rapidTimer = null; }
                dice.x = ox; dice.y = oy; dice.angle = oAngle; dice.setScale(oScaleX, oScaleY); updateShadow();
                const finalValue = Phaser.Math.Between(1, 6); this.diceValue = finalValue;
                this.tweens.add({
                    targets: dice,
                    y: oy - 40,
                    duration: 120,
                    ease: "Quad.easeOut",
                    yoyo: true
                });
                this.startFaceSwap(finalValue, () => {
                    this.showFinalNumber(finalValue, isAI ? this.aiColor : this.userColor);
                    this.isRolling = false;
                    this.time.delayedCall(1000, () => {
                        this.onDiceRolled(finalValue);
                    });
                });
            }
        });
    }

    checkGameEnd() {
        // Count how many result slots belong to each player
        let playerCount = 0;
        let aiCount = 0;

        for (const data of this.resultSlotsData) {
            if (data.owner === "player") playerCount++;
            if (data.owner === "ai") aiCount++;
        }

        // someone filled all 6 slots
        if (playerCount === this.CARD_COUNT) {
            console.log("Player wins!");
            this.time.delayedCall(1200, () => this.scene.restart());
            return true;
        }
        if (aiCount === this.CARD_COUNT) {
            console.log("AI wins!");
            this.time.delayedCall(1200, () => this.scene.restart());
            return true;
        }

        return false;
    }

    fadeOutDice(callback) {
        this.tweens.add({
            targets: [this.rollBtn.btn, this.rollBtn.label, this.diceImage, this.diceShadow], alpha: 0, duration: 350, ease: "Quad.easeOut", onComplete: () => {
                this.rollBtn.btn.setVisible(false); this.rollBtn.label.setVisible(false); this.diceImage.setVisible(false); this.diceShadow.setVisible(false);
                this.rollBtn.btn.alpha = 1; this.rollBtn.label.alpha = 1; this.diceImage.alpha = 1; this.diceShadow.alpha = 1;
                if (callback) callback();
            }
        });
    }

    // ---------------------- Availability / playable sets ----------------------
    updateCardAvailability() {
        this.userCardsAvailable = new Array(this.CARD_COUNT + 1).fill(true); // index by value
        this.aiCardsAvailable = new Array(this.CARD_COUNT + 1).fill(true);

        for (let i = 0; i < this.CARD_COUNT; i++) {
            const data = this.resultSlotsData[i];
            if (data.value === 0) continue;
            const v = data.value;
            if (data.owner === "player") {
                this.userCardsAvailable[v] = false; // player cannot use again
                this.aiCardsAvailable[v] = true;
            } else if (data.owner === "ai") {
                this.aiCardsAvailable[v] = false;
                this.userCardsAvailable[v] = true;
            }
        }
    }

    getPlayableSets(value, isPlayer = true) {
        const playable = [];
        const available = isPlayer ? this.userCardsAvailable : this.aiCardsAvailable;
        if (available[value]) playable.push([value]);
        for (let a = 1; a <= this.CARD_COUNT; a++) {
            for (let b = a + 1; b <= this.CARD_COUNT; b++) {
                if (a + b === value) {
                    if (available[a] && available[b]) playable.push([a, b]);
                }
            }
        }
        return playable;
    }

    // ---------------------- Player selection / clicks ----------------------
    enableUserCardClicks() {
        this.userSlots.forEach((slot, index) => {
            const img = slot.cardImage;
            if (!img) return;
            img.removeAllListeners("pointerdown");
            img.on("pointerdown", () => this.onUserCardClicked(index));
        });
    }

    highlightUserCards(playableSets) {
        // clear
        this.userSlots.forEach(slot => { if (slot.cardImage) { slot.cardImage.disableInteractive(); this.stopFloat(slot.cardImage); } });
        if (!playableSets || playableSets.length === 0) return;

        const allowed = new Set(playableSets.flat());
        this.userSlots.forEach((slot, index) => {
            const cardValue = this.userCards[index];
            if (allowed.has(cardValue) && cardValue > 0) {
                if (slot.cardImage) {
                    slot.cardImage.setInteractive();
                    this.startFloat(slot.cardImage);
                }
            }
        });

        this.updateResultShakes();
    }

    startFloat(card) {
        if (card._floatTween) return;
        card._floatTween = this.tweens.add({ targets: card, y: card.slotY - 36, duration: 1000, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    }
    stopFloat(card) {
        if (card._floatTween) { card._floatTween.stop(); card._floatTween = null; }
        if (card.slotY !== undefined) card.y = card.slotY;
    }

    onUserCardClicked(index) {
        const value = this.userCards[index];
        this.updateResultShakes();
        if (!value) return; // empty slot

        if (this.selectedIndices.length === 2) {
            // If user clicks either selected card → deselect both
            if (this.selectedIndices.includes(index)) {
                this.selectedIndices = [];
                this.highlightUserCards(this.currentPlayable);
                this.enableUserCardClicks();
                this.updateResultShakes();
                return;
            }
        }

        // toggle deselect if clicking same first selection
        if (this.selectedIndices.length === 1 && this.selectedIndices[0] === index) {
            // deselect
            this.selectedIndices = [];
            this.highlightUserCards(this.currentPlayable);
            this.enableUserCardClicks();
            this.updateResultShakes();
            return;
        }

        // first selection
        if (this.selectedIndices.length === 0) {
            this.selectedIndices.push(index);

            // check if this value requires pair selection
            const valueSelected = this.userCards[index];
            const pairSets = this.currentPlayable.filter(s => s.length === 2);
            const partnerSet = pairSets.find(s => s.includes(valueSelected));
            if (!partnerSet) {
                // single card play — finish immediately
                this.finishUserSelection();
                this.updateResultShakes();
                return;
            }

            // pair exists: freeze this card and float only its partner
            const partnerValue = partnerSet.find(v => v !== valueSelected);
            this.restrictToPartner(index, partnerValue);
            this.updateResultShakes();
            return;
        }

        // second selection
        if (this.selectedIndices.length === 1) {
            const firstIndex = this.selectedIndices[0];
            const firstValue = this.userCards[firstIndex];
            const secondValue = this.userCards[index];

            // verify this pair exists in currentPlayable
            const pairSet = this.currentPlayable.find(set => set.length === 2 && set.includes(firstValue) && set.includes(secondValue));
            if (pairSet) {
                // valid pair; add the index and finish
                this.selectedIndices.push(index);
                this.finishUserSelection();
            }
        }
    }

    restrictToPartner(clickedIndex, partnerValue) {
        this.userSlots.forEach((slot, idx) => {
            const img = slot.cardImage;
            if (!img) return;

            this.stopFloat(img);

            // default: disable all
            img.disableInteractive();

            if (idx === clickedIndex) {
                // Selected card stays clickable so user can deselect it
                img.y = img.slotY - 36;
                img.setInteractive();
            }

            if (this.userCards[idx] === partnerValue) {
                // Partner card: float and allow click
                this.startFloat(img);
                img.setInteractive();
            }
        });
    }

    spinSwap(slotObj, cardValue, color, wasEmpty = false) {
        if (!slotObj || !slotObj.cardImage) return;

        const img = slotObj.cardImage;
        const newKey = `${cardValue}_${color}`;

        // ensure origin for nice flip
        img.setOrigin(0.5, 0.5);

        // If slot was empty before, do a nice pop-in instead of flip
        if (wasEmpty) {
            img.setScale(0);
            img.setAlpha(0);
            this.tweens.add({
                targets: img,
                scale: 1,
                alpha: 1,
                duration: 380,
                ease: "Back.easeOut"
            });
            return;
        }

        // Flip-like swap: scaleX -> 0 (thin), swap texture, scaleX -> 1
        // keep a small tilt/angle during the swap for extra motion
        this.tweens.add({
            targets: img,
            scaleX: 0,
            angle: 12,
            duration: 180,
            ease: "Cubic.easeIn",
            onComplete: () => {
                // swap texture while thin
                img.setTexture(newKey);

                // give it a small negative angle and scaleX 0, then expand
                img.setAngle(-12);
                img.scaleX = 0;

                this.tweens.add({
                    targets: img,
                    scaleX: 1,
                    angle: 0,
                    duration: 340,
                    ease: "Back.easeOut",
                    onComplete: () => {
                        // tiny pop vertical for polish
                        this.tweens.add({
                            targets: img,
                            y: img.slotY - 10,
                            duration: 120,
                            yoyo: true,
                            ease: "Sine.easeOut"
                        });
                    }
                });
            }
        });
    }

    // ---------------------- Move animations ----------------------
    // simple arc flight (no glow, user requested no glow)
    flyCard(fromSlot, toSlot, value, color, onComplete) {
        const key = `${value}_${color}`;
        const card = this.add.image(fromSlot.slotX, fromSlot.slotY, key)
            .setDisplaySize(fromSlot.width, fromSlot.height)
            .setDepth(50000);

        // --- Motion blur (ghost trail) ---
        const ghosts = [];
        const spawnGhost = () => {
            const g = this.add.image(card.x, card.y, key)
                .setDisplaySize(card.displayWidth * 0.92, card.displayHeight * 0.92)
                .setAlpha(0.35)
                .setDepth(49999);
            ghosts.push(g);
            this.tweens.add({
                targets: g,
                alpha: 0,
                duration: 200,
                onComplete: () => g.destroy()
            });
        };
        const ghostTimer = this.time.addEvent({
            delay: 30,
            loop: true,
            callback: spawnGhost
        });

        // --- Arc path ---
        const midX = (fromSlot.slotX + toSlot.slotX) / 2;
        const arcHeight = Math.min(fromSlot.slotY, toSlot.slotY) -
            Math.max(120, Math.abs(fromSlot.slotX - toSlot.slotX) * 0.2);

        const path = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(fromSlot.slotX, fromSlot.slotY),
            new Phaser.Math.Vector2(midX, arcHeight),
            new Phaser.Math.Vector2(toSlot.slotX, toSlot.slotY)
        );

        const t = { value: 0 };
        this.tweens.add({
            targets: t,
            value: 1,
            duration: 650,
            ease: "Cubic.easeInOut",
            onUpdate: () => {
                const p = path.getPoint(t.value);
                card.x = p.x;
                card.y = p.y;
            },
            onComplete: () => {
                ghostTimer.remove();

                // --- Bounce landing animation ---
                this.tweens.add({
                    targets: card,
                    y: card.y - 20,
                    duration: 120,
                    yoyo: true,
                    ease: "Quad.easeOut"
                });

                this.time.delayedCall(150, () => {
                    card.destroy();
                    if (onComplete) onComplete();
                });
            }
        });

        // Scale animation
        this.tweens.add({
            targets: card,
            scaleX: toSlot.width / fromSlot.width,
            scaleY: toSlot.height / fromSlot.height,
            duration: 650,
            ease: "Cubic.easeInOut"
        });
    }

    returnCard(fromSlot, toSlot, value, color, onComplete) {
        // same as flyCard (semantic name)
        this.flyCard(fromSlot, toSlot, value, color, onComplete);
    }

    shakeCard(card) {
        if (!card) return;

        // Prevent double-shake
        if (card._shakeTween) return;

        card._shakeTween = this.tweens.add({
            targets: card,
            x: card.x + 8,
            duration: 60,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                card.x = card.slotX; // reset position
                card._shakeTween = null;
            }
        });
    }

    // ---------------------- Applying moves ----------------------
    // applyCardToResult now accepts sourceIndex so we can record where this new card came from
    applyCardToResult(owner, cardValue, sourceIndex) {
        const slot = this.resultSlotsData[cardValue - 1];
        const prevOwner = slot.owner;
        const prevIndex = slot.prevIndex;
        const prevValue = slot.value;

        // if overwritten, return previous card to its owner at prevIndex
        if (prevValue !== 0 && prevOwner !== owner) {
            // clear slot visually first so return animation reads empty
            slot.value = 0; slot.owner = 'none'; slot.prevIndex = null;
            this.drawResultSlots();

            if (prevOwner === 'player') {
                // return previous card to player's original slot
                const handIndex = prevIndex;
                // animate result -> hand
                const resultSlot = this.resultSlots[prevValue - 1];
                const handSlot = this.userSlots[handIndex];
                this.returnCard(resultSlot, handSlot, prevValue, this.userColor, () => {
                    // on complete, put value back into hand (only if empty)
                    if (this.userCards[handIndex] === 0) {
                        this.userCards[handIndex] = prevValue;
                        this.drawSlots(this.userSlots, this.userCards, this.userColor);
                    } else {
                        console.warn('return to player: target hand slot not empty', handIndex);
                    }
                });
            } else if (prevOwner === 'ai') {
                const handIndex = prevIndex;
                const resultSlot = this.resultSlots[prevValue - 1];
                const handSlot = this.aiSlots[handIndex];
                this.returnCard(resultSlot, handSlot, prevValue, this.aiColor, () => {
                    if (this.aiCards[handIndex] === 0) {
                        this.aiCards[handIndex] = prevValue;
                        this.drawSlots(this.aiSlots, this.aiCards, this.aiColor);
                    } else {
                        console.warn('return to ai: target hand slot not empty', handIndex);
                    }
                });
            }

            // recalc availability now that previous card was returned
            this.updateCardAvailability();
        }

        // set new owner + record where it came from
        slot.value = cardValue;
        slot.owner = owner;
        slot.prevIndex = sourceIndex; // this is the index in the owner's hand where the card originated
        this.drawResultSlots();
    }

    // helper that removes card values from hands (called AFTER animations finish)
    removeCardsFromHand(owner, indices) {
        if (!indices || indices.length === 0) return;
        if (owner === 'player') {
            indices.forEach(idx => { if (this.userCards[idx] !== 0) this.userCards[idx] = 0; });
            this.drawSlots(this.userSlots, this.userCards, this.userColor);
        } else {
            indices.forEach(idx => { if (this.aiCards[idx] !== 0) this.aiCards[idx] = 0; });
            this.drawSlots(this.aiSlots, this.aiCards, this.aiColor);
        }
    }

    // ---------------------- When dice finished ----------------------
    onDiceRolled(value) {
        console.log("Dice finished. Value =", value);

        if (this.isPlayerTurn()) {
            const playable = this.getPlayableSets(value, true);
            console.log("Playable sets:", playable);

            if (!playable || playable.length === 0) {
                console.log("No playable cards → auto pass");
                if (!this.checkGameEnd()) {
                    this.switchTurn();
                }
                return;
            }

            // show player selection UI
            this.fadeOutDice();
            this.currentPlayable = playable;
            this.selectedIndices = [];
            const targetableValues = new Set();
            playable.forEach(set => {
                set.forEach(v => targetableValues.add(v));
            });

            // Shake only AI cards whose value is targetable
            this.resultSlots.forEach((slot, i) => {
                const data = this.resultSlotsData[i];
                if (data.owner === "ai" && targetableValues.has(data.value) && slot.cardImage) {
                    this.startContinuousShake(slot.cardImage);
                }
            });
            this.highlightUserCards(playable);
            this.enableUserCardClicks();

        } else {
            console.log("AI's turn to play.");
            const playable = this.getPlayableSets(value, false);

            this.fadeOutDice(() => {
                // AI thinking delay: 2000ms (user requested)
                this.time.delayedCall(2000, () => {
                    if (!playable || playable.length === 0) {
                        console.log("AI: No moves → skip turn");
                        if (!this.checkGameEnd()) {
                            this.switchTurn();
                        }
                        return;
                    }

                    let choice;

                    switch (this.difficulty) {
                        case "hard":
                            choice = this.chooseAIMove_Hard(playable);
                            break;
                        default:
                            choice = this.chooseAIMove_Easy(playable);
                    }
                    console.log("AI chose:", choice);

                    // choice is array of values (length 1 or 2)
                    const total = choice.length; let done = 0;
                    const aiIndicesToRemove = [];

                    // store pending for safety
                    this._pendingAIMoves = choice.slice();

                    choice.forEach(v => {
                        // find ai original index by value (we never changed mapping)
                        const aiIndex = this.aiOriginalIndexByValue[v];
                        const slotFrom = (aiIndex !== undefined && this.aiSlots[aiIndex]) ? this.aiSlots[aiIndex] : null;
                        const slotTo = this.resultSlots[v - 1];

                        // if slotFrom exists visually, hide it now and animate
                        if (slotFrom && slotFrom.cardImage) {
                            // DESTROY visual immediately so there's no duplicate visual under flight
                            slotFrom.cardImage.destroy(); slotFrom.cardImage = null;
                        }

                        if (!slotFrom) {
                            // no visual; just apply immediately (shouldn't happen normally)
                            this.applyCardToResult('ai', v, aiIndex);
                            done++;
                            if (done >= total) {
                                this.removeAICards(choice);
                                this.updateCardAvailability();
                                this._pendingAIMoves = null;
                                if (!this.checkGameEnd()) {
                                    this.switchTurn();
                                }
                            }
                            return;
                        }

                        // animate from ai hand slot to result
                        this.flyCard(slotFrom, slotTo, v, this.aiColor, () => {
                            this.applyCardToResult('ai', v, aiIndex);
                            aiIndicesToRemove.push(aiIndex);
                            done++;
                            if (done >= total) {
                                // after all finished remove from AI hand
                                this.removeAICards(choice);
                                this.updateCardAvailability();
                                this._pendingAIMoves = null;
                                if (!this.checkGameEnd()) {
                                    this.switchTurn();
                                }
                            }
                        });
                    });
                });
            });
        }
    }

    updateResultShakes() {
        // Stop all previous shakes
        this.resultSlots.forEach(slot => {
            if (slot.cardImage) this.stopShake(slot.cardImage);
        });
        this._activeShakeTweens = [];
        this._activeShakeTweens = [];

        // Restore only NON-shaking cards
        this.resultSlots.forEach(slot => {
            const img = slot.cardImage;
            if (img && !img.isShaking) {
                img.x = img.slotX;
            }
        });

        // Build allowed target set
        const targetable = new Set();

        if (this.selectedIndices.length === 0) {
            // No selection yet → shake all allowed
            this.currentPlayable.forEach(set => {
                set.forEach(v => targetable.add(v));
            });
        } else if (this.selectedIndices.length === 1) {
            const firstValue = this.userCards[this.selectedIndices[0]];

            // Selected card should always shake
            targetable.add(firstValue);

            // Add partner cards
            this.currentPlayable.forEach(set => {
                if (set.includes(firstValue)) {
                    set.forEach(v => targetable.add(v));
                }
            });
        } else {
            // Two cards selected → no shaking needed
            return;
        }

        // Apply shake to AI-owned valid cards
        this.resultSlots.forEach((slot, i) => {
            const data = this.resultSlotsData[i];
            console.log(targetable)
            console.log("Checking result slot", i, "owner:", data.owner, "value:", data.value);
            if (data.owner === "ai" &&
                targetable.has(data.value) &&
                slot.cardImage) {
                this.startContinuousShake(slot.cardImage);
            }
        });
    }

    stopShake(card) {
        if (!card) return;
        if (card._shakeTween) {
            card._shakeTween.stop();
            card._shakeTween = null;
        }
        card.isShaking = false;
        card.x = card.slotX;
    }

    chooseAIMove_Hard(playableSets) {
        if (!playableSets || playableSets.length === 0) return null;

        let bestSet = null;
        let bestScore = -Infinity;

        for (const set of playableSets) {
            let score = 0;

            const sum = set.reduce((s, v) => s + v, 0);
            const isPair = set.length === 2;

            // Score 1: Prefer bigger numbers
            score += sum * 0.5;

            // Score 2: Bonus for using pairs (2 cards)
            if (isPair) score += 5;

            // Score 3: Capturing player's card?
            for (const v of set) {
                const slot = this.resultSlotsData[v - 1];
                if (slot.owner === "player") {
                    score += 20; // big bonus for capturing
                }
            }

            // Score 4: Avoid placing tiny cards that player can easily capture
            const smallCard = Math.min(...set);
            if (smallCard <= 2) score -= 10;

            // pick the best
            if (score > bestScore) {
                bestScore = score;
                bestSet = set;
            }
        }

        return bestSet;
    }

    // ---------------------- Finishing user selection ----------------------
    finishUserSelection() {
        this.resultSlots.forEach(slot => {
            if (slot.cardImage) this.stopShake(slot.cardImage);
        });
        this._activeShakeTweens = [];
        this._activeShakeTweens = [];

        this.resultSlots.forEach(slot => {
            const img = slot.cardImage;
            if (img && !img.isShaking) {
                img.x = img.slotX;
            }
        });
        console.log("User selected:", this.selectedIndices.map(i => this.userCards[i]));
        if (!this.selectedIndices || this.selectedIndices.length === 0) return;

        const indicesToPlay = [...this.selectedIndices];
        const total = indicesToPlay.length; let completed = 0;

        // For safety store pending player moves values
        this._pendingPlayerMoves = indicesToPlay.map(i => this.userCards[i]);

        indicesToPlay.forEach(idx => {
            const value = this.userCards[idx];
            const slotFrom = this.userSlots[idx];
            const slotTo = this.resultSlots[value - 1];

            // remove visual immediately so it looks like it flies
            if (slotFrom && slotFrom.cardImage) { slotFrom.cardImage.destroy(); slotFrom.cardImage = null; }

            // animate
            if (!slotFrom) {
                // fallback
                this.applyCardToResult('player', value, idx);
                completed++;
                if (completed >= total) {
                    this.removeUserCards(this._pendingPlayerMoves);
                    this.updateCardAvailability();
                    this._pendingPlayerMoves = null;
                    this.switchTurn();
                }
                return;
            }

            this.flyCard(slotFrom, slotTo, value, this.userColor, () => {
                this.applyCardToResult('player', value, idx);
                completed++;
                if (completed >= total) {
                    // after all finished remove from player's hand
                    this.removeUserCards(this._pendingPlayerMoves);
                    this.updateCardAvailability();
                    this._pendingPlayerMoves = null;
                    this.switchTurn();
                }
            });
        });

        // stop floats and disable interactivity
        this.userSlots.forEach(slot => { if (slot.cardImage) { this.stopFloat(slot.cardImage); slot.cardImage.disableInteractive(); } });

        // hide dice until AI finishes
        this.diceHidden = true;

        // clear selection state
        this.selectedIndices = [];
    }

    removeUserCards(values) {
        for (const v of values) {
            const index = this.userCards.indexOf(v);
            if (index !== -1) this.userCards[index] = 0;
        }
        this.drawSlots(this.userSlots, this.userCards, this.userColor);
    }

    removeAICards(values) {
        for (const v of values) {
            const index = this.aiCards.indexOf(v);
            if (index !== -1) this.aiCards[index] = 0;
        }
        this.drawSlots(this.aiSlots, this.aiCards, this.aiColor);
    }

    // ---------------------- Utility: create button ----------------------
    createButton(x, y, text, width, height, callback) {
        const radius = Math.min(width, height) * 0.25;
        const btn = this.add.graphics();
        btn.fillStyle(0x0066ff, 0.92);
        btn.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
        btn.lineStyle(5, 0xffffff, 1);
        btn.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
        btn.setPosition(x, y);
        btn.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
        const label = this.add.text(x, y, text, { fontSize: Math.floor(height * 0.45) + "px", fontFamily: "Arial", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
        btn.on("pointerover", () => { this.tweens.add({ targets: [btn, label], scaleX: 1.05, scaleY: 1.05, duration: 150, ease: "Quad.easeOut" }); });
        btn.on("pointerout", () => { this.tweens.add({ targets: [btn, label], scaleX: 1, scaleY: 1, duration: 150, ease: "Quad.easeOut" }); });
        btn.on("pointerdown", () => { this.tweens.add({ targets: [btn, label], scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true, ease: "Quad.easeInOut" }); callback(); });
        return { btn, label };
    }
}

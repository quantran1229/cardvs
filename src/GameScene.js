export default class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");

        // Generalized game state
        this.players = {};
        this.currentTurn = null;
        this.currentPlayable = [];
        this.selectedIndices = [];
        this.diceHidden = false;

        this.CARD_COUNT = 6;
        this.COLORS = ["red", "blue", "green", "yellow"];

        this._pendingMoves = null;
        this.isRolling = false;
        this._swapTimer = null;

        this._activeShakeTweens = [];
        this.difficulty = "hard";

        this.gameRules = {
            mode: "limit", // "endless" | "limit"
            maxRounds: 10,
            currentRound: 1
        };

        this.aiLines = [
            // Basic taunts
            "Hehe… weak roll!",
            "You call that skill?",
            "Watch and learn 😎",
            "Lucky shot, rookie.",
            "Too easy.",
            "Is that all?",
            "Try harder next time.",
            "Don’t cry after this roll!",
            "Pathetic attempt.",
            "My grandma rolls better.",

            // Reactions
            "Oh wow, did not expect THAT.",
            "Okay… that’s actually decent.",
            "No way you rolled that 😳",
            "Alright alright… lucky moment.",

            // Emotional / personality
            "I’m just warming up 🔥",
            "Hah! Predictable!",
            "The cards fear me.",
            "This table belongs to ME.",

            // Smug / funny
            "Hold on, let me flex real quick 💪",
            "Oops… was that too much for you?",
            "You still here?",
            "Try rolling with your eyes open.",

            // Longer lines
            "I can already see the ending… and you’re not winning.",
            "This game is fun. Mostly because I’m winning.",
            "Your strategy confuses me… oh wait, you don’t have one 😆"
        ];

        this.aiTalk = {
            neutral: [
                "You call that skill?",
                "Hmm interesting.",
                "Try harder next time.",
                "Lucky shot, rookie."
            ],
            goodRoll: [
                "Oh yeah! Perfect roll!",
                "Watch me cook 🔥",
                "Skill. Pure skill."
            ],
            badRoll: [
                "Bruh… really?",
                "Nah this dice is rigged.",
                "I refuse to accept this roll 😤"
            ],
            winning: [
                "I’m dominating this game!",
                "I could win with my eyes closed 😎",
                "Try and catch up… oh wait, you can’t!"
            ],
            losing: [
                "Hold up… this is NOT going to plan.",
                "How are you winning??",
                "Okay… okay… worrying 😰"
            ],
            shocked: [
                "WHAT?! HOW?! 😳",
                "No way you rolled THAT.",
                "Impossible…"
            ],
            start: [
                "Let’s get this started!",
                "Ready to lose?",
                "Time to show you how it’s done."
            ]
        };

        this.BUBBLE_TEXT_STYLE = {
            fontFamily: "Comic Sans MS",   // or replace with your custom font later
            fontSize: "64px",
            color: "#000000",
            align: "center",

            // nice cartoon outline
            stroke: "#ffffff",
            strokeThickness: 8,

            // wrap inside bubble
            wordWrap: { width: 600, useAdvancedWrap: true }
        };

        this.aiSettings = {
            talkChanceOnPlayerTurn: 0.45,   // 45% chance AI talks when it's NOT its turn
            talkChanceOnAITurn: 1.0,        // always talk on own turn (typewriter)
        };

        this.aiEmotion = "neutral";  // neutral | angry | smug | shocked | panicked
    }

    evaluateAIMood(finalValue) {
        const p1 = this.players.p1;
        const p2 = this.players.p2;

        let p1Owned = 0, p2Owned = 0;
        this.resultSlotsData.forEach(s => {
            if (s.owner === "p1") p1Owned++;
            if (s.owner === "p2") p2Owned++;
        });

        // Shock: unexpected huge roll
        if (finalValue >= 6) {
            this.aiEmotion = "shocked";
            return;
        }

        // Losing badly
        if (p2Owned < p1Owned - 2) {
            this.aiEmotion = "panicked";
            return;
        }

        // Winning comfortably
        if (p2Owned > p1Owned + 2) {
            this.aiEmotion = "smug";
            return;
        }

        // Gray zone
        this.aiEmotion = "neutral";
    }

    updateAIBubbleText(text) {
        // Apply emotion formatting
        const style = this.getAITextStyleForEmotion();
        this.topBubbleText.setStyle(style);

        // Auto multi-line formatting
        const formatted = this.formatAILine(text, 32);

        // Typewriter + auto-resize
        this.topBubbleText.setText("");
        this.autoResizeBubble(this.topBubble, this.topBubbleText);

        this.typeWriter(
            this.topBubbleText,
            formatted,
            28,    // typewriter speed
            () => this.autoResizeBubble(this.topBubble, this.topBubbleText)
        );
    }

    formatAILine(text, maxChars = 28) {
        const words = text.split(" ");
        let line1 = "";
        let line2 = "";
        let current = "";

        for (let w of words) {
            if ((current + w).length > maxChars) {
                if (!line1) {
                    line1 = current.trim();
                    current = w + " ";
                } else {
                    // line2 would overflow → stop adding
                    break;
                }
            } else {
                current += w + " ";
            }
        }

        // Assign leftover to line2 if possible
        if (!line1) line1 = current.trim();
        else if (!line2) line2 = current.trim();

        // Trim both
        line1 = line1 || "";
        line2 = line2 || "";

        // Return maximum 2 lines
        return (line2 ? line1 + "\n" + line2 : line1);
    }

    getAITextStyleForEmotion() {
        const base = { ...this.BUBBLE_TEXT_STYLE };

        switch (this.aiEmotion) {
            case "angry":
                base.color = "#ff2222";
                base.stroke = "#ffffff";
                base.strokeThickness = 10;
                base.fontStyle = "bold";
                base.fontSize = "68px";
                break;

            case "smug":
                base.color = "#111111";
                base.fontSize = "64px";
                base.fontStyle = "italic";
                break;

            case "shocked":
                base.color = "#3333ff";
                base.fontSize = "66px";
                break;

            case "panicked":
                base.color = "#ff7700";
                base.fontSize = "62px";
                base.strokeThickness = 6;
                break;
        }
        return base;
    }

    preload() {
        this.load.image("bg", "./assets/bg/bg.png");
        this.load.image("table_red", "./assets/table/table_red.png");
        this.load.image("table_blue", "./assets/table/table_blue.png");
        this.load.image("table_green", "./assets/table/table_green.png");

        for (const c of this.COLORS) {
            for (let v = 1; v <= this.CARD_COUNT; v++) {
                this.load.image(`${v}_${c}`, `./assets/cards/${v}_${c}.png`);
            }
        }

        for (let i = 1; i <= 6; i++) {
            this.load.image(`dice_${i}`, `./assets/dice/dice_${i}.png`);
        }

        this.load.image("avatar_placeholder", "./assets/ui/avatar_placeholder.png");
        this.load.image("bubble", "./assets/ui/speech_bubble.png");  // a rounded rectangle w/ tail
        this.load.image("btn_settings", "./assets/ui/btn_settings.png");
        this.load.image("btn_menu", "./assets/ui/btn_menu.png");
    }

    // ---------------------- Helpers to work with players ----------------------
    makePlayer(id, name, type, color) {
        const cards = Array.from({ length: this.CARD_COUNT }, (_, i) => i + 1);
        const originalIndexByValue = {};
        for (let i = 0; i < this.CARD_COUNT; i++) {
            originalIndexByValue[i + 1] = i;
        }
        return {
            id,
            name,
            type,          // "human", "ai", "remote"
            color,
            cards,
            slots: [],
            originalIndexByValue
        };
    }

    currentPlayer() { return this.players[this.currentTurn]; }
    otherPlayerId() { return this.currentTurn === "p1" ? "p2" : "p1"; }
    isTurn(id) { return this.currentTurn === id; }

    // ---------------------- Visual helpers ----------------------
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

    fitBubbleText(textObj, bubble, maxWidth, minFontSize = 36) {
        let style = textObj.style;
        let currentSize = parseInt(style.fontSize);

        // shrink until it fits
        while (textObj.width > maxWidth) {
            currentSize -= 4;

            if (currentSize < minFontSize) {
                currentSize = minFontSize;
                break;
            }

            textObj.setFontSize(currentSize);
            textObj.updateText();  // force recalc
        }

        // return final size for animations if needed
        return currentSize;
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

    startFloat(card) {
        if (card._floatTween) return;
        card._floatTween = this.tweens.add({
            targets: card,
            y: card.slotY - 36,
            duration: 1000,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1
        });
    }

    stopFloat(card) {
        if (card._floatTween) {
            card._floatTween.stop();
            card._floatTween = null;
        }
        card.y = card.slotY;
    }

    shineCard(card) {
        if (!card || !card.postFX) return;
        const fx = card.postFX.addShine(0.5, 0.25, 5);

        this.tweens.add({
            targets: fx,
            progress: 1,
            duration: 1800,
            ease: "Sine.easeInOut",
            onComplete: () => {
                if (card.postFX && card.postFX.list) {
                    const list = card.postFX.list;
                    const idx = list.indexOf(fx);
                    if (idx !== -1) list.splice(idx, 1);
                }
            }
        });
    }

    spinReplace(newSprite, wasEmpty = false) {
        if (!newSprite) return;
        newSprite.setScale(0.6);
        newSprite.setAngle(-90);
        newSprite.setAlpha(0);
        if (wasEmpty) {
            newSprite.setScale(0);
            newSprite.setAlpha(0);
            this.tweens.add({
                targets: newSprite,
                scale: 1,
                alpha: 1,
                duration: 380,
                ease: "Back.easeOut"
            });
            return;
        }
        this.tweens.add({
            targets: newSprite,
            angle: 0,
            scale: 1,
            alpha: 1,
            duration: 350,
            ease: "Back.easeOut"
        });
    }

    // ---------------------- Scene creation ----------------------
    create() {
        const topY = this.scale.height * 0.28;
        const midY = this.scale.height * 0.50;
        const bottomY = this.scale.height * 0.72;
        const startX = this.scale.width * 0.28;
        const gapX = this.scale.width * 0.085;
        const CARD_W = 240;
        const CARD_H = 360;

        this.add.image(0, 0, "bg").setOrigin(0).setDisplaySize(this.scale.width, this.scale.height);

        const tableKey = Phaser.Utils.Array.GetRandom(["table_red", "table_blue", "table_green"]);
        const table = this.add.image(this.scale.width / 2, this.scale.height / 2, tableKey);
        table.setScale((this.scale.width * 0.9) / table.width);

        const makeSlot = (x, y) => {
            const g = this.add.graphics();
            g.lineStyle(3, 0xffffff, 0.8);
            g.strokeRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 20);
            g.slotX = x;
            g.slotY = y;
            g.width = CARD_W;
            g.height = CARD_H;
            g.cardImage = null;
            return g;
        };

        // HARD CODE for now (you said debug)
        const p1Color = "red";
        const p2Color = "blue";
        const p1Type = "human";
        const p2Type = "ai";   // <---- IMPORTANT (PvP local)

        this.players.p1 = this.makePlayer("p1", "Player 1", p1Type, p1Color);
        this.players.p2 = this.makePlayer("p2", "Player 2", p2Type, p2Color);

        // Result slot data
        this.resultSlotsData = Array.from({ length: this.CARD_COUNT }, () => ({
            value: 0,
            owner: null,
            prevIndex: null
        }));

        // Build slots
        this.players.p2.slots = [];
        this.resultSlots = [];
        this.players.p1.slots = [];

        for (let i = 0; i < this.CARD_COUNT; i++) {
            const x = startX + i * gapX;
            this.players.p2.slots.push(makeSlot(x, topY));
            this.resultSlots.push(makeSlot(x, midY));
            this.players.p1.slots.push(makeSlot(x, bottomY));
        }

        // Layers
        this.backgroundLayer = this.add.layer();
        this.cardLayer = this.add.layer();
        this.diceLayer = this.add.layer().setDepth(999999);

        // Draw cards
        this.drawSlots(this.players.p2.slots, this.players.p2.cards, this.players.p2.color);
        this.drawResultSlots();
        this.drawSlots(this.players.p1.slots, this.players.p1.cards, this.players.p1.color);

        this.startRandomShine();

        // Dice
        this.diceImage = this.add.image(this.scale.width * 0.5, this.scale.height * 0.5, "dice_1")
            .setDisplaySize(400, 400).setDepth(9999);
        this.diceShadow = this.add.ellipse(
            this.diceImage.x,
            this.diceImage.y + this.diceImage.displayHeight * 0.45,
            300, 80, 0x000000, 0.35
        ).setDepth(9998);

        this.rollBtn = this.createButton(
            this.scale.width * 0.5,
            this.scale.height * 0.65,
            "ROLL", 300, 110,
            () => this.rollDice(false)
        );
        this.diceLayer.add(this.rollBtn.btn);
        this.diceLayer.add(this.rollBtn.label);

        this.currentTurn = "p1";

        // Bob animation
        this.tweens.add({ targets: this.diceImage, y: this.diceImage.y - 50, duration: 1800, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
        this.tweens.add({ targets: this.diceShadow, scaleX: 0.9, scaleY: 0.9, duration: 1800, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });

        this.updateCardAvailability();

        // ENABE clicks for both
        this.enablePlayerCardClicks("p1");
        this.enablePlayerCardClicks("p2");

        this.uiTopGroup = this.add.container(0, 0);

        // ---------------------------
        // TOP PLAYER UI BLOCK
        // ---------------------------
        this.uiTopPlayer = this.add.container(0, 0);

        // Avatar
        this.topAvatar = this.add.image(
            this.scale.width * 0.07,
            this.scale.height * 0.1,
            "avatar_placeholder"
        )
            .setDisplaySize(300, 300)
            .setOrigin(0.5);

        // Anchor position for bubble (left side)
        this.TOP_BUBBLE_ANCHOR_X = this.scale.width * 0.12;
        this.TOP_BUBBLE_ANCHOR_Y = this.scale.height * 0.07;
        const topBubbleWidth = this.scale.width * 0.40;
        const topBubbleHeight = 240;

        // Create bubble at anchor
        this.topBubble = this.add.image(
            this.TOP_BUBBLE_ANCHOR_X,
            this.TOP_BUBBLE_ANCHOR_Y,
            "bubble"
        )
            .setOrigin(0, 0.5)        // left-center
            .setDisplaySize(topBubbleWidth, topBubbleHeight);             // original scale, height fixed

        // Text centered inside bubble
        this.topBubbleText = this.add.text(
            this.TOP_BUBBLE_ANCHOR_X + (this.topBubble.displayWidth / 2),
            this.TOP_BUBBLE_ANCHOR_Y,
            "",
            this.BUBBLE_TEXT_STYLE
        ).setOrigin(0.5);

        // Add to container
        this.uiTopPlayer.add([
            this.topAvatar,
            this.topBubble,
            this.topBubbleText
        ]);

        // ---------------------------
        // BOTTOM PLAYER UI BLOCK
        // ---------------------------
        this.uiBottomPlayer = this.add.container(0, 0);

        // Anchor position for bubble (left side)
        this.BOTTOM_BUBBLE_ANCHOR_X = this.scale.width * 0.12;
        this.BOTTOM_BUBBLE_ANCHOR_Y = this.scale.height * 0.89;

        // Avatar
        this.bottomAvatar = this.add.image(
            this.scale.width * 0.07,
            this.scale.height * 0.91,
            "avatar_placeholder"
        )
            .setDisplaySize(300, 300)
            .setOrigin(0.5);

        // Create bubble at anchor
        this.bottomBubble = this.add.image(
            this.BOTTOM_BUBBLE_ANCHOR_X,
            this.BOTTOM_BUBBLE_ANCHOR_Y,
            "bubble"
        )
            .setOrigin(0, 0.5)        // left-center
            .setDisplaySize(topBubbleWidth, topBubbleHeight);            // keep natural height

        // Text centered inside bubble
        this.bottomBubbleText = this.add.text(
            this.BOTTOM_BUBBLE_ANCHOR_X + (this.bottomBubble.displayWidth / 2),
            this.BOTTOM_BUBBLE_ANCHOR_Y,
            "",
            this.BUBBLE_TEXT_STYLE
        ).setOrigin(0.5);

        // Add to container
        this.uiBottomPlayer.add([
            this.bottomAvatar,
            this.bottomBubble,
            this.bottomBubbleText
        ]);

        // GAME INFO RIGHT SIDE
        this.infoText = this.add.text(
            this.scale.width * 0.95,
            this.scale.height * 0.90,
            "",
            { fontSize: "46px", color: "#ffffff", stroke: "#000000", strokeThickness: 6 }
        ).setOrigin(1, 0);

        // LAST ROLL TEXT
        this.lastRollText = this.add.text(
            this.scale.width * 0.5,
            this.scale.height * 0.02,
            "Last Roll: -",
            {
                fontSize: "48px",
                fontFamily: "Arial",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 6
            }
        ).setOrigin(0.5, 0);
        this.uiTopGroup.add(this.lastRollText);

        // TIMER TEXT
        this.timerText = this.add.text(
            this.scale.width * 0.95,
            this.scale.height * 0.02,
            "00:00",
            {
                fontSize: "48px",
                fontFamily: "Arial",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 6
            }
        ).setOrigin(1, 0);
        this.uiTopGroup.add(this.timerText);

        // Start timer data
        this.startTimestamp = Date.now();

        if (this.players.p2.type === "ai") {
            // initial mood = start
            this.aiEmotion = "start";

            // pick smart or random if game just started
            const line = this.pickSmartAILine();
            console.log(line)

            // small delay so text appears smoothly
            this.time.delayedCall(300, () => {
                this.updateAIBubbleText(line);
                this.aiEmotion = "neutral";
            });
        }

        this.updateTurnUI();
    }

    typeWriter(textObj, fullText, speed = 35, onComplete = null) {
        // Stop previous typewriter if running
        if (this._typingEvent) {
            this._typingEvent.remove();
            this._typingEvent = null;
        }

        textObj.setText("");  // clear bubble text

        let index = 0;
        this._typingEvent = this.time.addEvent({
            delay: speed,
            loop: true,
            callback: () => {
                textObj.setText(fullText.substring(0, index));

                index++;
                if (index > fullText.length) {
                    this._typingEvent.remove();
                    this._typingEvent = null;
                    if (onComplete) onComplete();
                }
            }
        });
    }

    autoResizeBubble(bubble, textObj, padding = 600) {

        // Calculate target width with padding
        const desiredWidth = textObj.width + padding;

        const maxBubbleWidth = this.scale.width * 0.65;
        let finalWidth = Math.min(desiredWidth, maxBubbleWidth);

        // If text is too wide even after bubble max size → shrink text
        if (desiredWidth > maxBubbleWidth) {
            // we shrink based on bubble interior width (maxBubbleWidth - padding)
            this.fitBubbleText(textObj, bubble, maxBubbleWidth - padding);
            // recalc after shrink
            finalWidth = Math.min(textObj.width + padding, maxBubbleWidth);
        }

        // scale bubble X only
        const baseWidth = bubble.width;
        const scaleX = finalWidth / baseWidth;
        const scaleY = bubble.scaleY || 1;
        bubble.setScale(scaleX, scaleY);

        // keep anchor left-aligned
        if (bubble === this.topBubble) {
            bubble.x = this.TOP_BUBBLE_ANCHOR_X;
        } else {
            bubble.x = this.BOTTOM_BUBBLE_ANCHOR_X;
        }

        // recenter text
        textObj.x = bubble.x + (bubble.displayWidth / 2);
        textObj.y = bubble.y;
    }

    pickSmartAILine(finalValue = null) {
        let pool = [];

        if (this.aiEmotion === "shocked") {
            pool = this.aiTalk.shocked;
        }
        else if (this.aiEmotion === "panicked") {
            pool = this.aiTalk.losing;
        }
        else if (this.aiEmotion === "smug") {
            pool = this.aiTalk.winning;
        }
        else if (this.aiEmotion === "start") {
            pool = this.aiTalk.start;
        }
        else if (finalValue >= 5) {
            pool = this.aiTalk.goodRoll;
        }
        else if (finalValue <= 2) {
            pool = this.aiTalk.badRoll;
        }
        else {
            pool = this.aiTalk.neutral;
        }

        return Phaser.Utils.Array.GetRandom(pool);
    }

    updateTopBubble(text) {
        const isAI = this.players.p2.type === "ai" && this.currentTurn === "p2";

        if (isAI) {
            this.updateAIBubbleText(text);
        } else {
            this.topBubbleText.setText(text);
            this.autoResizeBubble(this.topBubble, this.topBubbleText);
        }
    }

    updateBottomBubble(text) {
        this.bottomBubbleText.setText(text);
        this.autoResizeBubble(this.bottomBubble, this.bottomBubbleText);
    }

    updateLastRoll(value) {
        this.lastRollText.setText(`Last Roll: 🎲 ${value}`);
    }

    getTurnBannerText() {
        const mode = this.game.settings?.gameType || "pve";  // pve, pvp, online
        const cur = this.players[this.currentTurn];

        if (mode === "pve") {
            return (cur.id === "p1") ? "Your Turn" : "Opponent’s Turn";
        }

        if (mode === "pvp") {
            return (cur.id === "p1") ? "Player 1 Turn" : "Player 2 Turn";
        }

        if (mode === "online") {
            return (cur.id === "p1") ? "Your Turn" : "Enemy’s Turn";
        }
    }

    showTurnBanner() {
        const textStr = this.getTurnBannerText();
        const playerColor = Phaser.Display.Color.HexStringToColor(this.currentPlayer().color).color;

        // Remove old banner if exists
        if (this.turnBannerGroup) {
            this.turnBannerGroup.destroy(true);
            this.turnBannerGroup = null;
        }

        // A container to hold ribbon, glow and text
        const group = this.add.container(this.scale.width / 2, -200);
        this.turnBannerGroup = group;

        // --- SOFT GLOW (blurred ellipse) ---
        const glow = this.add.graphics();
        glow.fillStyle(playerColor, 0.35);
        glow.fillEllipse(0, 0, 900, 180);
        glow.alpha = 0;   // fade in
        group.add(glow);

        // --- RIBBON BACKGROUND ---
        const ribbon = this.add.graphics();
        ribbon.fillStyle(0xffffff, 0.95);
        ribbon.lineStyle(12, 0x000000, 0.15);

        const W = 900;
        const H = 160;
        const R = 40;

        ribbon.fillRoundedRect(-W / 2, -H / 2, W, H, R);
        ribbon.strokeRoundedRect(-W / 2, -H / 2, W, H, R);
        ribbon.alpha = 0;
        group.add(ribbon);

        // --- TEXT ---
        const txt = this.add.text(0, 0, textStr, {
            fontSize: "120px",
            fontStyle: "bold",
            color: this.currentPlayer().color,
            stroke: "#000000",
            strokeThickness: 14,
            shadow: {
                offsetX: 4,
                offsetY: 6,
                color: "#000000",
                blur: 6,
                fill: true
            }
        }).setOrigin(0.5);
        txt.alpha = 0;
        group.add(txt);

        // --- ANIMATIONS ---

        // Glow pop-in
        this.tweens.add({
            targets: glow,
            alpha: 1,
            duration: 300,
            ease: "Quad.easeOut"
        });

        // Ribbon slide + bounce
        this.tweens.add({
            targets: group,
            y: this.scale.height * 0.18,
            duration: 500,
            ease: "Back.easeOut"
        });

        // Fade ribbon & text
        this.tweens.add({
            targets: [ribbon, txt],
            alpha: 1,
            duration: 350,
            ease: "Quad.easeOut"
        });

        // Auto hide after 1.2s
        this.time.delayedCall(1200, () => {
            this.tweens.add({
                targets: group,
                y: -200,
                alpha: 0,
                duration: 400,
                ease: "Quad.easeIn",
                onComplete: () => {
                    group.destroy(true);
                    this.turnBannerGroup = null;
                }
            });
        });
    }

    // ---------------------- Drawing / slots ----------------------
    drawResultSlots() {
        for (let i = 0; i < this.CARD_COUNT; i++) {
            const slot = this.resultSlots[i];
            const data = this.resultSlotsData[i];
            const ownerColor = data.owner ? this.players[data.owner].color : null;
            const key = data.value ? `${data.value}_${ownerColor}` : null;

            if (!key) {
                if (slot.cardImage) { slot.cardImage.destroy(); slot.cardImage = null; }
                continue;
            }

            if (slot.cardImage && slot.cardImage.texture.key === key) continue;

            if (slot.cardImage) slot.cardImage.destroy();

            const img = this.add.image(slot.slotX, slot.slotY, key);
            img.setDisplaySize(slot.width, slot.height);

            img.slotX = slot.slotX;
            img.slotY = slot.slotY;

            slot.cardImage = img;
            this.cardLayer.add(img);
        }
    }

    drawSlots(slots, values, color) {
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.cardImage) {
                slot.cardImage.destroy();
                slot.cardImage = null;
            }
            const value = values[i];
            if (value) {
                const key = `${value}_${color}`;
                const img = this.add.image(slot.slotX, slot.slotY, key);
                img.setDisplaySize(slot.width, slot.height);
                img.slotX = slot.slotX;
                img.slotY = slot.slotY;
                slot.cardImage = img;
                this.cardLayer.add(img);
            }
        }
    }

    startRandomShine() {
        this.time.addEvent({
            delay: Phaser.Math.Between(2000, 5000),
            loop: true,
            callback: () => {
                const all = [];
                this.players.p1.slots.forEach(s => { if (s.cardImage) all.push(s.cardImage); });
                this.players.p2.slots.forEach(s => { if (s.cardImage) all.push(s.cardImage); });
                this.resultSlots.forEach(s => { if (s.cardImage) all.push(s.cardImage); });
                if (all.length === 0) return;
                this.shineCard(Phaser.Utils.Array.GetRandom(all));
            }
        });
    }

    // ---------------------- Turn / UI ----------------------
    updateTurnUI() {
        const cur = this.currentPlayer();

        // Always show dice for human turn
        this.diceImage.setVisible(true);
        this.diceShadow.setVisible(true);

        // Restore alpha fully
        this.diceImage.alpha = 1;
        this.diceShadow.alpha = 1;
        this.rollBtn.btn.alpha = 1;
        this.rollBtn.label.alpha = 1;

        if (cur.type === "human") {
            this.rollBtn.btn.setVisible(true);
            this.rollBtn.label.setVisible(true);
            this.rollBtn.btn.setInteractive();
        } else {
            this.rollBtn.btn.disableInteractive();
            this.rollBtn.btn.setVisible(false);
            this.rollBtn.label.setVisible(false);
            this.time.delayedCall(900, () => this.rollDice(true));
        }

        if (cur.id === "p1") {
            // P1 turn
            this.updateBottomBubble("My turn");

            // AI has a CHANCE to talk
            if (this.players.p2.type === "ai") {
                if (Math.random() < this.aiSettings.talkChanceOnPlayerTurn) {
                    const line = this.pickSmartAILine();
                    this.updateAIBubbleText(line);
                }
                // else: AI stays quiet
            }
        }
        else {
            // P2 turn
            if (this.players.p2.type === "ai") {
                if (Math.random() < this.aiSettings.talkChanceOnAITurn) {
                    this.evaluateAIMood(null);  // or roll later
                    const line = this.pickSmartAILine();
                    this.updateAIBubbleText(line);
                }
            } else {
                this.updateTopBubble("My turn");
            }

            // DO NOT reset player 1 bubble, keep whatever it had
        }

        this.highlightCurrentPlayer();
    }

    switchTurn() {
        this.currentTurn = (this.currentTurn === "p1") ? "p2" : "p1";

        // Always re-enable player cards
        const cur = this.currentPlayer();
        if (cur.type === "human") {
            this.enablePlayerCardClicks(cur.id);
        }

        if (this.currentTurn === "p1") {
            this.gameRules.currentRound++;
        }

        console.log("Switched turn to ", this.currentTurn);

        this.updateTurnUI();

        this.showTurnBanner();
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

    rollDice(isAuto) {
        if (!isAuto && this.currentPlayer().type !== "human") return;
        if (this.isRolling) return;
        this.isRolling = true;

        if (!isAuto) {
            this.rollBtn.btn.disableInteractive();
            this.rollBtn.btn.setVisible(false);
            this.rollBtn.label.setVisible(false);
        }

        const dice = this.diceImage;
        const shadow = this.diceShadow;

        let rapid = this.time.addEvent({
            delay: 60, loop: true,
            callback: () => dice.setTexture(`dice_${Phaser.Math.Between(1, 6)}`)
        });

        const ox = dice.x;
        const oy = dice.y;
        const oa = dice.angle;

        const updateShadow = () => {
            shadow.x = dice.x;
            const lift = oy - dice.y;
            const t = Phaser.Math.Clamp(lift / 160, 0, 1);
            const s = 1 - t * 0.55;
            shadow.scaleX = s;
            shadow.scaleY = s;
        };

        this.tweens.chain({
            targets: [dice],
            tweens: [
                { x: ox + 20, y: oy - 130, angle: oa + 360, duration: 300, ease: "Quad.easeOut", onUpdate: updateShadow },
                { x: ox - 60, y: oy + 40, angle: oa + 500, duration: 300, ease: "Back.easeOut", onUpdate: updateShadow },
                { x: ox, y: oy, angle: oa, duration: 260, onUpdate: updateShadow },
            ],
            onComplete: () => {
                rapid.remove();
                const finalValue = Phaser.Math.Between(1, 6);
                this.updateLastRoll(finalValue);
                this.startFaceSwap(finalValue, () => {
                    this.showFinalNumber(finalValue, this.currentPlayer().color);
                    this.isRolling = false;
                    this.time.delayedCall(1000, () => this.onDiceRolled(finalValue));
                });
            }
        });
    }


    fadeOutDice(cb) {
        this.tweens.add({
            targets: [this.rollBtn.btn, this.rollBtn.label, this.diceImage, this.diceShadow],
            alpha: 0, duration: 350, onComplete: () => {
                this.rollBtn.btn.setVisible(false);
                this.rollBtn.label.setVisible(false);
                this.diceImage.setVisible(false);
                this.diceShadow.setVisible(false);
                if (cb) cb();
            }
        });
    }

    // ---------------------- Availability / playable sets ----------------------
    updateCardAvailability() {
        this.cardsAvailable = {
            p1: new Array(this.CARD_COUNT + 1).fill(true),
            p2: new Array(this.CARD_COUNT + 1).fill(true)
        };

        for (let i = 0; i < this.CARD_COUNT; i++) {
            const data = this.resultSlotsData[i];
            if (!data.value) continue;
            const v = data.value;
            if (data.owner === "p1") {
                this.cardsAvailable.p1[v] = false;
                this.cardsAvailable.p2[v] = true;
            } else if (data.owner === "p2") {
                this.cardsAvailable.p2[v] = false;
                this.cardsAvailable.p1[v] = true;
            }
        }
    }

    getPlayableSets(value, ownerId) {
        const playable = [];
        const avail = this.cardsAvailable[ownerId];
        if (avail[value]) playable.push([value]);

        for (let a = 1; a <= 6; a++) {
            for (let b = a + 1; b <= 6; b++) {
                if (a + b === value) {
                    if (avail[a] && avail[b]) playable.push([a, b]);
                }
            }
        }
        return playable;
    }

    // ---------------------- Player selection / clicks ----------------------
    enablePlayerCardClicks(pid) {
        const slots = this.players[pid].slots;
        slots.forEach((slot, idx) => {
            if (!slot.cardImage) return;
            slot.cardImage.removeAllListeners();

            slot.cardImage.on("pointerdown", () => {
                if (this.currentTurn !== pid) return;
                if (this.players[pid].type !== "human") return;
                this.onPlayerCardClicked(pid, idx);
            });
        });
    }

    highlightCurrentPlayerCards(playableSets) {
        Object.values(this.players).forEach(p => {
            p.slots.forEach(s => {
                if (s.cardImage) {
                    s.cardImage.disableInteractive();
                    this.stopFloat(s.cardImage);
                }
            });
        });

        if (!playableSets) return;

        const allowed = new Set(playableSets.flat());
        const cur = this.currentPlayer();

        cur.slots.forEach((slot, idx) => {
            const val = cur.cards[idx];
            if (allowed.has(val)) {
                slot.cardImage.setInteractive();
                this.startFloat(slot.cardImage);
            }
        });

        this.updateResultShakes();
    }

    onPlayerCardClicked(pid, idx) {
        const player = this.players[pid];
        const value = player.cards[idx];

        if (!value) return;

        if (this.selectedIndices.length === 2) {
            if (this.selectedIndices.includes(idx)) {
                this.selectedIndices = [];
                this.highlightCurrentPlayerCards(this.currentPlayable);
                this.updateResultShakes();
                return;
            }
        }

        if (this.selectedIndices.length === 1 &&
            this.selectedIndices[0] === idx) {
            this.selectedIndices = [];
            this.highlightCurrentPlayerCards(this.currentPlayable);
            this.updateResultShakes();
            return;
        }

        if (this.selectedIndices.length === 0) {
            this.selectedIndices.push(idx);

            const valueSel = player.cards[idx];
            const pairSets = this.currentPlayable.filter(s => s.length === 2);
            const partner = pairSets.find(s => s.includes(valueSel));

            if (!partner) {
                this.finishPlayerSelection(pid);
                return;
            }

            const partnerValue = partner.find(v => v !== valueSel);
            this.restrictToPartner(pid, idx, partnerValue);
            this.updateResultShakes();
            return;
        }

        if (this.selectedIndices.length === 1) {
            const firstIndex = this.selectedIndices[0];
            const firstVal = player.cards[firstIndex];
            const secondVal = player.cards[idx];
            const match = this.currentPlayable.find(
                s => s.includes(firstVal) && s.includes(secondVal)
            );
            if (match) {
                this.selectedIndices.push(idx);
                this.finishPlayerSelection(pid);
            }
        }
    }


    restrictToPartner(pid, idx, partnerVal) {
        const p = this.players[pid];

        p.slots.forEach((slot, i) => {
            const img = slot.cardImage;
            if (!img) return;
            this.stopFloat(img);
            img.disableInteractive();

            if (i === idx) {
                img.setInteractive();
                img.y = img.slotY - 36;
            }
            if (p.cards[i] === partnerVal) {
                this.startFloat(img);
                img.setInteractive();
            }
        });
    }

    // ---------------------- Animations: flying, returning, shake ----------------------
    flyCard(from, to, value, color, onDone) {
        const key = `${value}_${color}`;
        const c = this.add.image(from.slotX, from.slotY, key)
            .setDisplaySize(from.width, from.height)
            .setDepth(50000);

        const ghosts = [];
        const ghost = () => {
            const g = this.add.image(c.x, c.y, key)
                .setDisplaySize(c.displayWidth * 0.92, c.displayHeight * 0.92)
                .setAlpha(0.35).setDepth(49999);
            ghosts.push(g);
            this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        };

        const timer = this.time.addEvent({ delay: 30, loop: true, callback: ghost });

        const midX = (from.slotX + to.slotX) / 2;
        const arc = Math.min(from.slotY, to.slotY) - 120;

        const path = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(from.slotX, from.slotY),
            new Phaser.Math.Vector2(midX, arc),
            new Phaser.Math.Vector2(to.slotX, to.slotY)
        );

        const t = { v: 0 };
        this.tweens.add({
            targets: t, v: 1, duration: 650, ease: "Cubic.easeInOut",
            onUpdate: () => {
                const p = path.getPoint(t.v);
                c.x = p.x; c.y = p.y;
            },
            onComplete: () => {
                timer.remove();
                this.tweens.add({ targets: c, y: c.y - 20, duration: 120, yoyo: true, ease: "Quad.easeOut" });
                this.time.delayedCall(150, () => { c.destroy(); if (onDone) onDone(); });
            }
        });

        this.tweens.add({
            targets: c,
            scaleX: to.width / from.width,
            scaleY: to.height / from.height,
            duration: 650, ease: "Cubic.easeInOut"
        });
    }

    returnCard(from, to, v, color, onDone) {
        this.flyCard(from, to, v, color, onDone);
    }

    // ---------------------- Applying moves ----------------------
    applyCardToResult(ownerId, val, srcIndex) {
        const slot = this.resultSlotsData[val - 1];

        // returning overwritten card
        if (slot.value && slot.owner !== ownerId) {
            const prevOwner = slot.owner;
            const prevVal = slot.value;
            const prevIdx = slot.prevIndex;

            slot.value = 0;
            slot.owner = null;
            slot.prevIndex = null;
            this.drawResultSlots();

            const resultSlot = this.resultSlots[prevVal - 1];
            const handSlot = this.players[prevOwner].slots[prevIdx];

            this.returnCard(resultSlot, handSlot, prevVal, this.players[prevOwner].color, () => {
                if (this.players[prevOwner].cards[prevIdx] === 0) {
                    this.players[prevOwner].cards[prevIdx] = prevVal;
                    this.drawSlots(this.players[prevOwner].slots, this.players[prevOwner].cards, this.players[prevOwner].color);
                }
            });
        }

        slot.value = val;
        slot.owner = ownerId;
        slot.prevIndex = srcIndex;
        this.drawResultSlots();
    }

    removeCardsFromHand(pid, indices) {
        const p = this.players[pid];
        indices.forEach(i => p.cards[i] = 0);
        this.drawSlots(p.slots, p.cards, p.color);
    }

    highlightCurrentPlayer() {
        if (!this.topAvatar || !this.bottomAvatar) return;

        if (this.currentTurn === "p1") {
            // P1 active → bottom bright, top dim
            this.bottomAvatar.setTint(0xffffff);
            this.topAvatar.setTint(0x999999);
        } else {
            // P2 active → top bright, bottom dim
            this.topAvatar.setTint(0xffffff);
            this.bottomAvatar.setTint(0x999999);
        }
    }

    // ---------------------- When dice finished ----------------------
    onDiceRolled(value) {
        const pid = this.currentTurn;
        const p = this.players[pid];
        if (pid === "p1") {
            this.updateBottomBubble(`My turn\nRoll: ${value}`);
        } else {
            this.evaluateAIMood(value);
            const aiLine = this.pickSmartAILine(value);
            this.updateAIBubbleText(aiLine);
        }

        const playable = this.getPlayableSets(value, pid);

        if (!playable.length) {
            if (!this.checkGameEnd()) this.switchTurn();
            return;
        }

        if (p.type === "human") {
            this.fadeOutDice();
            this.currentPlayable = playable;
            this.selectedIndices = [];

            this.enablePlayerCardClicks(pid);       // ensure clicks restored
            this.highlightCurrentPlayerCards(playable);
            return;
        }

        // AI path (still working)
        let choice = playable.length > 1 ?
            this.chooseAIMove_Hard(playable) :
            playable[0];

        const total = choice.length;
        let done = 0;

        this._pendingMoves = choice.slice();

        choice.forEach(v => {
            const origin = p.originalIndexByValue[v];
            const from = p.slots[origin];
            const to = this.resultSlots[v - 1];

            if (from.cardImage) {
                from.cardImage.destroy();
                from.cardImage = null;
            }

            this.flyCard(from, to, v, p.color, () => {
                this.applyCardToResult(pid, v, origin);
                done++;
                if (done === total) {
                    this.removeCardsFromHand(pid, choice.map(val => p.cards.indexOf(val)));
                    this.updateCardAvailability();
                    this._pendingMoves = null;
                    if (!this.checkGameEnd()) this.switchTurn();
                }
            });
        });
    }

    updateResultShakes() {
        // reset all shake flags + stop previous tweens
        this.resultSlots.forEach(slot => {
            if (slot.cardImage) {
                this.stopShake(slot.cardImage);
                slot.cardImage.isShaking = false;
                slot.cardImage.x = slot.cardImage.slotX;
            }
        });
        this._activeShakeTweens = [];

        if (!this.currentPlayable) return;

        const targetable = new Set();

        if (this.selectedIndices.length === 0) {
            this.currentPlayable.forEach(set => set.forEach(v => targetable.add(v)));
        }
        else if (this.selectedIndices.length === 1) {
            const firstValue = this.currentPlayer().cards[this.selectedIndices[0]];
            targetable.add(firstValue);

            this.currentPlayable.forEach(set => {
                if (set.includes(firstValue)) {
                    set.forEach(v => targetable.add(v));
                }
            });
        }
        else return;

        this.resultSlots.forEach((slot, i) => {
            const data = this.resultSlotsData[i];
            if (data.owner &&
                data.owner !== this.currentTurn &&
                targetable.has(data.value) &&
                slot.cardImage) {
                this.startContinuousShake(slot.cardImage);
            }
        });
    }

    // ---------------------- AI decision helpers ----------------------
    chooseAIMove_Easy(playableSets) {
        if (!playableSets || playableSets.length === 0) return null;
        return Phaser.Utils.Array.GetRandom(playableSets);
    }

    chooseAIMove_Hard(playable) {
        let best = null;
        let score = -999;

        for (const set of playable) {
            let s = set.reduce((a, b) => a + b, 0) * 0.5;
            if (set.length === 2) s += 5;

            for (const v of set) {
                const d = this.resultSlotsData[v - 1];
                if (d.owner && d.owner !== this.currentTurn) s += 20;
            }

            if (Math.min(...set) <= 2) s -= 10;

            if (s > score) { score = s; best = set; }
        }
        return best;
    }

    // ---------------------- Finishing player selection ----------------------
    finishPlayerSelection(pid) {
        const p = this.players[pid];

        this.resultSlots.forEach(s => {
            if (s.cardImage) this.stopShake(s.cardImage);
        });

        if (this.selectedIndices.length === 0) return;

        const playIdx = [...this.selectedIndices];
        const total = playIdx.length;
        let finished = 0;

        this._pendingMoves = playIdx.map(i => p.cards[i]);

        playIdx.forEach(idx => {
            const value = p.cards[idx];
            const from = p.slots[idx];
            const to = this.resultSlots[value - 1];

            if (from.cardImage) {
                from.cardImage.destroy();
                from.cardImage = null;
            }

            this.flyCard(from, to, value, p.color, () => {
                this.applyCardToResult(pid, value, idx);
                finished++;
                if (finished === total) {
                    this.removeCardsFromHand(pid, playIdx);
                    this.updateCardAvailability();
                    this._pendingMoves = null;
                    if (!this.checkGameEnd()) this.switchTurn();
                }
            });
        });

        p.slots.forEach(s => {
            if (s.cardImage) {
                this.stopFloat(s.cardImage);
                s.cardImage.disableInteractive();
            }
        });

        this.selectedIndices = [];
    }


    // ---------------------- Win detection ----------------------
    checkGameEnd() {

        // Count result ownership
        let p1Count = 0;
        let p2Count = 0;

        for (const s of this.resultSlotsData) {
            if (s.owner === "p1") p1Count++;
            if (s.owner === "p2") p2Count++;
        }

        // =============================
        // ENDLESS MODE (normal victory)
        // =============================
        if (this.gameRules.mode === "endless") {
            if (p1Count === this.CARD_COUNT) {
                this.onGameOver("p1", "All cards captured");
                return true;
            }
            if (p2Count === this.CARD_COUNT) {
                this.onGameOver("p2", "All cards captured");
                return true;
            }
            return false;
        }

        // =============================
        // LIMIT TURN MODE
        // =============================

        if (this.gameRules.mode === "limit") {

            if (this.gameRules.currentRound > this.gameRules.maxRounds) {

                // Determine winner by who controls more cards
                if (p1Count > p2Count) {
                    this.onGameOver("p1", "More cards in result");
                } else if (p2Count > p1Count) {
                    this.onGameOver("p2", "More cards in result");
                } else {
                    this.onGameOver("draw", "Same number of cards");
                }

                return true;
            }
        }

        return false;
    }

    onGameOver(winnerId, reason) {

        console.log("Game Over:", winnerId, reason);

        // Freeze everything
        this.input.enabled = false;

        // Show banner
        const text =
            (winnerId === "draw") ? "Draw!" :
                (winnerId === "p1") ? "Player 1 Wins!" :
                    "Player 2 Wins!";

        this.showGameOverBanner(text, reason);

        // Restart after 3 seconds
        this.time.delayedCall(3000, () => {
            this.scene.restart();
        });
    }

    showGameOverBanner(text, reason) {
        const msg = this.add.text(
            this.scale.width / 2, this.scale.height / 2,
            text + "\n" + reason,
            { fontSize: "100px", color: "#ffffff", stroke: "#000", strokeThickness: 8 }
        ).setOrigin(0.5);

        this.tweens.add({
            targets: msg,
            scale: 1.2,
            duration: 300,
            yoyo: true
        });
    }

    // ---------------------- Utility: create button ----------------------
    createButton(x, y, text, w, h, onClick) {
        const radius = Math.min(w, h) * 0.25;
        const g = this.add.graphics();
        g.fillStyle(0x0066ff, 0.9);
        g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

        g.lineStyle(5, 0xffffff, 1);
        g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
        g.setPosition(x, y);

        g.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
            Phaser.Geom.Rectangle.Contains);
        const label = this.add.text(x, y, text, {
            fontSize: (h * 0.45) + "px",
            fontFamily: "Arial",
            color: "#fff",
            fontStyle: "bold"
        }).setOrigin(0.5);

        g.on("pointerdown", () => {
            this.tweens.add({ targets: [g, label], scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true });
            onClick();
        });

        return { btn: g, label };
    }

    update() {
        if (this.startTimestamp) {
            const elapsed = Math.floor((Date.now() - this.startTimestamp) / 1000);
            const min = String(Math.floor(elapsed / 60)).padStart(2, "0");
            const sec = String(elapsed % 60).padStart(2, "0");
            this.timerText.setText(`${min}:${sec}`);
        }
        this.infoText.setText(
            `Round ${this.gameRules.currentRound}/${this.gameRules.maxRounds}\n`
            + `Mode: ${this.gameRules.mode}`
        );
    }
}

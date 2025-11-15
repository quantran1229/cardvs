import GameScene from "./GameScene.js";

const config = {
  type: Phaser.AUTO,
  width: 3200,
  height: 1800,
  backgroundColor: "#111",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [GameScene]
};

new Phaser.Game(config);
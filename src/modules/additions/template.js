/* global Portal */
export default class AdditionsTemplate {
  static async createTemplate(args) {
    const [, , inputData] = args;
    let position;
    if (window.Portal) {
      position = await new Portal()
        .texture("icons/svg/explosion.svg")
        .size(inputData.size * 2)
        .pick();
      if (!position) return;
    } else {
      ui.notifications.error(
        game.i18n.localize("CPR.additions.template.portalMissing")
      );
      return;
    }

    const tempSize = inputData.size * 2;
    const hypDist = Math.sqrt(tempSize * tempSize * 2);
    const canvasDist = canvas.dimensions.distance;
    const trueWidth = tempSize / canvasDist;
    const gridSize = canvas.grid.size;

    await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [
      {
        angle: 0,
        direction: 45,
        distance: hypDist,
        fillColor: game.user.color,
        x: position.x - (trueWidth / 2) * gridSize,
        y: position.y - (trueWidth / 2) * gridSize,
        borderColor: "#000000",
        t: "rect",
      },
    ]);
  }
}

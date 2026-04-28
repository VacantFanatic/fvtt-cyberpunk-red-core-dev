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

  /**
   * Places a 10m x 10m explosive blast template at a user-selected position.
   * Called before the attack roll so the GM/players can see where the grenade is aimed.
   * Returns template data needed to later move the template on a miss (bounce).
   *
   * @static
   * @async
   * @returns {Object|null} { id, centerX, centerY, trueWidth, gridSize } or null if cancelled
   */
  static async createExplosiveTemplate() {
    if (!canvas?.scene) return null;

    // Explosive blast area per CPR rules: 10m x 10m (5x5 squares at 2m/square)
    const sizeMeters = 10;
    const canvasDist = canvas.dimensions.distance;
    const trueWidth = sizeMeters / canvasDist; // squares
    const gridSize = canvas.grid.size; // pixels per square
    const hypDist = Math.sqrt(sizeMeters * sizeMeters * 2);

    let position;
    if (window.Portal) {
      position = await new Portal()
        .texture("icons/svg/explosion.svg")
        .size(sizeMeters)
        .pick();
      if (!position) return null;
    } else {
      ui.notifications.error(
        game.i18n.localize("CPR.additions.template.portalMissing")
      );
      return null;
    }

    const [template] = await canvas.scene.createEmbeddedDocuments(
      "MeasuredTemplate",
      [
        {
          angle: 0,
          direction: 45,
          distance: hypDist,
          fillColor: game.user.color,
          x: position.x - (trueWidth / 2) * gridSize,
          y: position.y - (trueWidth / 2) * gridSize,
          borderColor: "#ff6600",
          t: "rect",
        },
      ]
    );

    return {
      id: template.id,
      centerX: position.x,
      centerY: position.y,
      trueWidth,
      gridSize,
    };
  }

  /**
   * Moves an explosive blast template to a random position within the original intended
   * blast area. Per CPR rules: if the attack roll misses the DV, the explosive lands
   * somewhere within the original 10m x 10m square centered on the intended target.
   *
   * Rolls 1d8 for compass direction and 1d4 for distance (mapped to 1–2 squares).
   *
   * @static
   * @async
   * @param {String} templateId - ID of the MeasuredTemplate to move
   * @param {Number} centerX - Original center X in canvas pixels
   * @param {Number} centerY - Original center Y in canvas pixels
   * @param {Number} trueWidth - Template width in grid squares
   * @param {Number} gridSize - Pixels per grid square
   * @returns {Object} { directionName, distSquares } for the chat bounce message
   */
  static async bounceExplosiveTemplate(
    templateId,
    centerX,
    centerY,
    trueWidth,
    gridSize
  ) {
    // 8-point compass direction vectors
    const directions = [
      { name: "N", dx: 0, dy: -1 },
      { name: "NE", dx: 1, dy: -1 },
      { name: "E", dx: 1, dy: 0 },
      { name: "SE", dx: 1, dy: 1 },
      { name: "S", dx: 0, dy: 1 },
      { name: "SW", dx: -1, dy: 1 },
      { name: "W", dx: -1, dy: 0 },
      { name: "NW", dx: -1, dy: -1 },
    ];

    const dirRoll = await new Roll("1d8").evaluate();
    const distRoll = await new Roll("1d4").evaluate();

    const dir = directions[dirRoll.total - 1];
    // Map 1-4 to 1-2 squares (1-2 → 1 square, 3-4 → 2 squares)
    const distSquares = distRoll.total <= 2 ? 1 : 2;

    // Clamp new center within the original blast area (±half-width from original center)
    const maxPixelOffset = Math.floor(trueWidth / 2) * gridSize;
    const rawOffsetX = dir.dx * distSquares * gridSize;
    const rawOffsetY = dir.dy * distSquares * gridSize;

    const newCenterX = Math.max(
      centerX - maxPixelOffset,
      Math.min(centerX + maxPixelOffset, centerX + rawOffsetX)
    );
    const newCenterY = Math.max(
      centerY - maxPixelOffset,
      Math.min(centerY + maxPixelOffset, centerY + rawOffsetY)
    );

    await canvas.scene.updateEmbeddedDocuments("MeasuredTemplate", [
      {
        _id: templateId,
        x: newCenterX - (trueWidth / 2) * gridSize,
        y: newCenterY - (trueWidth / 2) * gridSize,
      },
    ]);

    return { directionName: dir.name, distSquares };
  }
}

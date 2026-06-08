/* global Portal */
export default class AdditionsTemplate {
  /**
   * Resolve elevation for a measured template so it stays on the active scene
   * level instead of spanning all elevations (Foundry scene levels / issue #63).
   *
   * @static
   * @param {Object} [position] Portal pick result; may include elevation.
   * @returns {number}
   */
  static resolveTemplateElevation(position) {
    const pickElevation = Number(position?.elevation);
    if (Number.isFinite(pickElevation)) return pickElevation;

    const controlled = canvas?.tokens?.controlled ?? [];
    for (const token of controlled) {
      const tokenElevation = Number(token.document?.elevation);
      if (Number.isFinite(tokenElevation)) return tokenElevation;
    }

    const levelBottom = Number(canvas?.level?.elevation?.bottom);
    if (Number.isFinite(levelBottom)) return levelBottom;

    return 0;
  }

  /**
   * Resolve the active scene level document for placement.
   *
   * @static
   * @param {Object} [position] Portal pick result.
   * @returns {documents.Level|null}
   */
  static resolveActiveLevel(position) {
    if (canvas?.level) return canvas.level;

    const infer = canvas?.inferLevelFromElevation;
    if (typeof infer !== "function") return null;

    const elevation = AdditionsTemplate.resolveTemplateElevation(position);
    return infer.call(canvas, elevation) ?? null;
  }

  /**
   * Resolve the active scene level ids for a placed template region.
   * Foundry v14 regions without `levels` apply to every level (#65).
   *
   * @static
   * @param {Object} [position] Portal pick result.
   * @returns {string[]|null}
   */
  static resolveTemplateLevels(position) {
    const level = AdditionsTemplate.resolveActiveLevel(position);
    return level?.id ? [level.id] : null;
  }

  /**
   * Resolve the elevation range for a placed region on the active scene level.
   *
   * @static
   * @param {Object} [position] Portal pick result.
   * @returns {{bottom: number, top: number}|null}
   */
  static resolveTemplateElevationRange(position) {
    const levelElevation =
      AdditionsTemplate.resolveActiveLevel(position)?.elevation;
    if (!levelElevation) return null;

    const bottom = Number(levelElevation.bottom);
    const top = Number(levelElevation.top);
    if (!Number.isFinite(bottom)) return null;

    return {
      bottom,
      top: Number.isFinite(top) ? top : bottom,
    };
  }

  /**
   * Embedded document type used for placed blast templates on the active Foundry generation.
   *
   * @static
   * @returns {"MeasuredTemplate"|"Region"}
   */
  static getTemplateEmbeddedName() {
    return game.release?.generation >= 14 ? "Region" : "MeasuredTemplate";
  }

  /**
   * Apply scene-level placement constraints to a Foundry v14 region.
   *
   * @static
   * @param {Object} regionData
   * @param {Object} [position] Portal pick result.
   */
  static applyRegionLevelPlacement(regionData, position) {
    const levels = AdditionsTemplate.resolveTemplateLevels(position);
    const elevationRange =
      AdditionsTemplate.resolveTemplateElevationRange(position);

    return {
      ...regionData,
      ...(levels ? { levels } : {}),
      ...(elevationRange ? { elevation: elevationRange } : {}),
    };
  }

  /**
   * @static
   * @param {Object} placementData Measured-template style placement fields.
   * @param {Object} [position] Portal pick result.
   * @returns {Object}
   */
  static buildTemplateDocumentData(placementData, position) {
    return {
      ...placementData,
      elevation: AdditionsTemplate.resolveTemplateElevation(position),
    };
  }

  /**
   * Compute CPR explosive blast dimensions for a square template.
   * Foundry rectangle templates use the diagonal length in grid units.
   *
   * @static
   * @param {number} sizeMeters Blast width/height in scene distance units (meters).
   * @param {number} canvasDist Scene grid distance per square.
   * @returns {{ sizeMeters: number, trueWidth: number, rectDiagonal: number }}
   */
  static computeExplosiveBlastDimensions(sizeMeters, canvasDist) {
    const trueWidth = sizeMeters / canvasDist;
    const rectDiagonal = Math.sqrt(trueWidth * trueWidth * 2);
    return { sizeMeters, trueWidth, rectDiagonal };
  }

  /**
   * Build measured-template placement data for a square explosive blast.
   *
   * @static
   * @param {Object} options
   * @param {number} options.sizeMeters
   * @param {number} options.canvasDist
   * @param {number} options.gridSize
   * @param {number} [options.centerX=0]
   * @param {number} [options.centerY=0]
   * @param {string} options.fillColor
   * @param {string} options.borderColor
   * @returns {{ trueWidth: number, documentData: Object }}
   */
  static buildExplosiveRectPlacementData({
    sizeMeters,
    canvasDist,
    gridSize,
    centerX = 0,
    centerY = 0,
    fillColor,
    borderColor,
  }) {
    const { trueWidth, rectDiagonal } =
      AdditionsTemplate.computeExplosiveBlastDimensions(sizeMeters, canvasDist);

    return {
      trueWidth,
      documentData: {
        angle: 0,
        direction: 45,
        distance: rectDiagonal,
        fillColor,
        x: centerX - (trueWidth / 2) * gridSize,
        y: centerY - (trueWidth / 2) * gridSize,
        borderColor,
        t: "rect",
      },
    };
  }

  /**
   * Pick the center of a rectangular blast template using a Foundry preview.
   *
   * @static
   * @async
   * @param {Object} documentData Measured-template document fields.
   * @param {number} trueWidth Blast width in grid squares.
   * @returns {Promise<Object|null>} { x, y, elevation } or null if cancelled/unavailable
   */
  static async pickRectBlastCenter(documentData, trueWidth) {
    if (
      !canvas?.scene ||
      !canvas?.templates ||
      !foundry?.canvas?.placeables?.MeasuredTemplate ||
      !foundry?.documents?.MeasuredTemplateDocument
    ) {
      return null;
    }

    const { MeasuredTemplate } = foundry.canvas.placeables;
    const document = new foundry.documents.MeasuredTemplateDocument(
      { ...documentData, hidden: false },
      { parent: canvas.scene }
    );
    const template = new MeasuredTemplate(document);
    await template.draw();

    const layer = canvas.templates;
    const previousLayer = canvas.activeLayer;
    layer.activate();
    layer.preview.addChild(template);

    const gridSize = canvas.grid.size;

    return new Promise((resolve) => {
      let finished = false;

      const centerFromDocument = () => ({
        x: document.x + (trueWidth / 2) * gridSize,
        y: document.y + (trueWidth / 2) * gridSize,
      });

      const listener = {
        finish(result) {
          if (finished) return;
          finished = true;
          canvas.stage.off("mousemove", listener.onMove);
          canvas.app.view.removeEventListener(
            "mousedown",
            listener.onMouseDown
          );
          canvas.app.view.removeEventListener("contextmenu", listener.onCancel);
          if (layer.preview?.children?.includes(template)) {
            layer.preview.removeChild(template);
          }
          template.destroy({ children: true });
          previousLayer?.activate?.();
          resolve(result);
        },
        onMove(event) {
          let coords;
          if (event.data?.getLocalPosition) {
            coords = event.data.getLocalPosition(layer);
          } else {
            coords = canvas.canvasCoordinatesFromClient({
              x: event.clientX,
              y: event.clientY,
            });
          }
          const center = canvas.grid.getSnappedPoint(coords, {
            mode: CONST.GRID_SNAPPING_MODES.CENTER,
          });
          document.updateSource({
            x: center.x - (trueWidth / 2) * gridSize,
            y: center.y - (trueWidth / 2) * gridSize,
          });
        },
        onMouseDown(event) {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const center = centerFromDocument();
          listener.finish({
            x: center.x,
            y: center.y,
            elevation: AdditionsTemplate.resolveTemplateElevation(center),
          });
        },
        onCancel(event) {
          event.preventDefault();
          listener.finish(null);
        },
      };

      canvas.stage.on("mousemove", listener.onMove);
      canvas.app.view.addEventListener("mousedown", listener.onMouseDown);
      canvas.app.view.addEventListener("contextmenu", listener.onCancel);
    });
  }

  /**
   * Build a Foundry v14 Region document from measured-template placement data.
   *
   * @static
   * @param {Object} placementData Measured-template style placement fields.
   * @param {Object} [position] Portal pick result.
   * @returns {Object}
   */
  static buildRegionDocumentData(placementData, position) {
    const measuredData = AdditionsTemplate.buildTemplateDocumentData(
      placementData,
      position
    );
    const migratedRegionData =
      foundry.documents.RegionDocument._migrateMeasuredTemplateData(
        measuredData,
        {
          grid: canvas.grid,
          gridTemplates: true,
        }
      );

    const regionData = AdditionsTemplate.applyRegionLevelPlacement(
      migratedRegionData,
      position
    );
    regionData.name ??= game.i18n.localize(
      "CPR.additions.template.explosive.regionName"
    );

    return regionData;
  }

  /**
   * Create a placed blast template on the active scene.
   *
   * @static
   * @async
   * @param {Object} placementData Measured-template style placement fields.
   * @param {Object} [position] Portal pick result.
   * @returns {Promise<Document>}
   */
  static async createPlacedTemplate(placementData, position) {
    if (
      game.release?.generation >= 14 &&
      foundry.documents.RegionDocument?._migrateMeasuredTemplateData
    ) {
      const [region] = await canvas.scene.createEmbeddedDocuments("Region", [
        AdditionsTemplate.buildRegionDocumentData(placementData, position),
      ]);
      return region;
    }

    const [template] = await canvas.scene.createEmbeddedDocuments(
      "MeasuredTemplate",
      [AdditionsTemplate.buildTemplateDocumentData(placementData, position)]
    );
    return template;
  }

  /**
   * Build an update payload for moving a placed blast template/region.
   *
   * @static
   * @param {String} templateId
   * @param {Number} newX
   * @param {Number} newY
   * @returns {Object}
   */
  static buildTemplateMoveUpdate(templateId, newX, newY) {
    if (game.release?.generation >= 14) {
      const region = canvas.scene.regions?.get(templateId);
      if (region?.shapes?.length) {
        const shapes = foundry.utils.deepClone(region.shapes);
        const [shape] = shapes;
        if (shape) {
          shape.x = newX;
          shape.y = newY;
        }
        return { _id: templateId, shapes };
      }
    }

    return { _id: templateId, x: newX, y: newY };
  }

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
    const canvasDist = canvas.dimensions.distance;
    const gridSize = canvas.grid.size;
    const { documentData } = AdditionsTemplate.buildExplosiveRectPlacementData({
      sizeMeters: tempSize,
      canvasDist,
      gridSize,
      centerX: position.x,
      centerY: position.y,
      fillColor: game.user.color,
      borderColor: "#000000",
    });

    await AdditionsTemplate.createPlacedTemplate(documentData, position);
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
    const gridSize = canvas.grid.size; // pixels per square
    const previewPlacement = AdditionsTemplate.buildExplosiveRectPlacementData({
      sizeMeters,
      canvasDist,
      gridSize,
      fillColor: game.user.color,
      borderColor: "#ff6600",
    });

    let position = await AdditionsTemplate.pickRectBlastCenter(
      previewPlacement.documentData,
      previewPlacement.trueWidth
    );

    if (!position && window.Portal) {
      position = await new Portal()
        .texture("icons/svg/explosion.svg")
        .size(sizeMeters)
        .pick();
    }

    if (!position) {
      if (!window.Portal) {
        ui.notifications.error(
          game.i18n.localize("CPR.additions.template.portalMissing")
        );
      }
      return null;
    }

    const { trueWidth, documentData } =
      AdditionsTemplate.buildExplosiveRectPlacementData({
        sizeMeters,
        canvasDist,
        gridSize,
        centerX: position.x,
        centerY: position.y,
        fillColor: game.user.color,
        borderColor: "#ff6600",
      });

    const template = await AdditionsTemplate.createPlacedTemplate(
      documentData,
      position
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

    const newX = newCenterX - (trueWidth / 2) * gridSize;
    const newY = newCenterY - (trueWidth / 2) * gridSize;

    await canvas.scene.updateEmbeddedDocuments(
      AdditionsTemplate.getTemplateEmbeddedName(),
      [AdditionsTemplate.buildTemplateMoveUpdate(templateId, newX, newY)]
    );

    return { directionName: dir.name, distSquares };
  }
}

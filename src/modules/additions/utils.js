const DV_CACHE = new Map();

export default class AdditionsUtils {
  static getDistance(token, target) {
    const sourceToken = token.document ?? token;
    const targetToken = target.document ?? target;
    const planarDistance = canvas.grid.measurePath([
      sourceToken,
      targetToken,
    ]).cost;
    const elevationDelta = sourceToken.elevation - targetToken.elevation;
    return Math.round(
      Math.sqrt(
        planarDistance * planarDistance + elevationDelta * elevationDelta
      )
    );
  }

  static async getDV(dvTable, distance) {
    let cachedData = DV_CACHE.get(dvTable);
    if (!cachedData) {
      let table = game.tables.getName(dvTable);
      if (!table) {
        const compendium = game.settings.get(
          game.system.id,
          "dvRollTableCompendium"
        );
        const pack =
          game.packs.get(compendium) ||
          game.packs.get(`${game.system.id}.internal_dv-tables`);
        const tableId = pack?.index?.getName(dvTable)?._id;
        if (!tableId) return -1;
        table = await pack.getDocument(tableId);
      }
      cachedData = { table, dvs: new Map() };
      DV_CACHE.set(dvTable, cachedData);
    }

    if (!cachedData.dvs.has(distance)) {
      const draw = await cachedData.table.getResultsForRoll(distance);
      if (!draw?.length) return -1;
      cachedData.dvs.set(distance, Number.parseInt(draw[0].text, 10));
    }
    return cachedData.dvs.get(distance);
  }

  static isResponsibleGM() {
    if (!game.user.isGM) return false;
    const activeGMs = game.users.filter((user) => user.active && user.isGM);
    return activeGMs.length > 0 && activeGMs[0].id === game.user.id;
  }
}

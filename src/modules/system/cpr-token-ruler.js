/* eslint-disable no-use-before-define */
const { TokenRuler } = foundry.canvas.placeables.tokens;

/**
 * Token drag ruler with CPR movement color bands.
 */
export default class CPRTokenRuler extends TokenRuler {
  /**
   * @param {foundry.canvas.placeables.tokens.TokenRulerWaypoint} waypoint
   */
  _getSegmentStyle(waypoint) {
    const base = super._getSegmentStyle(waypoint);
    const actor = this.token?.actor;
    const moveStat = actor?.system?.stats?.move?.value;
    if (typeof moveStat !== "number") return base;

    const moveBonus =
      typeof actor?.bonuses?.move === "number" ? actor.bonuses.move : 0;
    const moveSpeed = moveStat + moveBonus;
    const d = waypoint?.distance;
    if (typeof d !== "number") return base;

    const colorRanges = getColorRanges(this.token, moveSpeed);
    const range = colorRanges.find((entry) => d <= entry.range);
    const color = range
      ? range.color
      : colorRanges[colorRanges.length - 1].color;

    return { ...base, color };
  }
}

function getColorRanges(token, moveSpeed) {
  const context = {
    ranges: [
      {
        range: moveSpeed,
        color: getColorSetting("rulerColorWalk", 0x00ff00),
      },
      {
        range: moveSpeed * 2,
        color: getColorSetting("rulerColorDash", 0xffff00),
      },
      {
        range: Number.POSITIVE_INFINITY,
        color: getColorSetting("rulerColorOver", 0xff0000),
      },
    ],
  };

  Hooks.callAll("CPR.getRulerRanges", token, context);

  if (!Array.isArray(context.ranges) || context.ranges.length === 0) {
    return [
      { range: moveSpeed, color: 0x00ff00 },
      { range: moveSpeed * 2, color: 0xffff00 },
      { range: Number.POSITIVE_INFINITY, color: 0xff0000 },
    ];
  }

  return context.ranges
    .filter(
      (entry) =>
        typeof entry.range === "number" && typeof entry.color === "number"
    )
    .sort((a, b) => a.range - b.range);
}

function getColorSetting(key, fallback) {
  const value = game.settings.get(game.system.id, key);
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace("#", "");
  const parsed = Number.parseInt(cleaned, 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

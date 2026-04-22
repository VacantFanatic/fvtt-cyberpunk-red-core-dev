/* eslint-disable no-use-before-define */
const { Ruler } = foundry.canvas.interaction;

/**
 * System Ruler: DV labels on waypoints and walk/run speed band colors on segments.
 *
 * Segment coloring uses each waypoint's cumulative {@link foundry.grid.types.GridMeasurePathResultWaypoint#distance}.
 * With only two waypoints (one long segment), the whole segment uses the color for the end distance; grid paths
 * with multiple waypoints produce a striped effect similar to the former Drag Ruler module.
 */
export default class CPRRuler extends Ruler {
  static get WAYPOINT_LABEL_TEMPLATE() {
    return `systems/${game.system.id}/templates/hud/waypoint-label-dv.hbs`;
  }

  /**
   * @param {foundry.types.RulerWaypoint} waypoint
   * @param {object} state
   */
  _getWaypointLabelContext(waypoint, state) {
    const context = super._getWaypointLabelContext(waypoint, state);

    if (!context) return context;

    if (this.user.isSelf) {
      const token = canvas.tokens.controlled[0];
      const dvTableFlag = token?.document.getFlag(game.system.id, "cprDvTable");
      if (dvTableFlag) {
        const distance = Number(context.distance.total);

        let DV = 0;
        for (const range of Object.keys(dvTableFlag.table)) {
          const [start, end] = range.split("_");
          if (distance >= +start && distance <= +end) {
            DV = dvTableFlag.table[range];
            if (typeof DV === "object") {
              DV = DV.description;
            }
            break;
          }
        }

        if (DV) {
          context.dvLabel = `DV: ${DV} ${dvTableFlag.name.replace(/^DV /, "")}`;
        }
      }
    }

    return context;
  }

  /**
   * @param {foundry.types.RulerWaypoint} waypoint
   */
  _getSegmentStyle(waypoint) {
    const base = super._getSegmentStyle(waypoint);
    const token = canvas.tokens.controlled[0];
    const actor = token?.actor;
    const moveStat = actor?.system?.stats?.move?.value;
    if (typeof moveStat !== "number") return base;

    const moveBonus =
      typeof actor?.bonuses?.move === "number" ? actor.bonuses.move : 0;
    const moveSpeed = moveStat + moveBonus;
    const d = waypoint.measurement?.distance;
    if (typeof d !== "number") return base;

    const colorRanges = getColorRanges(token, moveSpeed);
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

  /**
   * Hook for module/system extensions to customize ruler movement bands.
   *
   * @param {Token} token
   * @param {{ranges: Array<{range:number, color:number}>}} context
   */
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

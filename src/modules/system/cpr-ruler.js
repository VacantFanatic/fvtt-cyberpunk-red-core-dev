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
    const walkStat = actor?.system?.derivedStats?.walk;
    const runStat = actor?.system?.derivedStats?.run;
    if (
      !walkStat ||
      !runStat ||
      typeof walkStat.value !== "number" ||
      typeof runStat.value !== "number" ||
      typeof actor.bonuses?.walk !== "number" ||
      typeof actor.bonuses?.run !== "number"
    ) {
      return base;
    }

    const walkSpeed = walkStat.value + actor.bonuses.walk;
    const runSpeed = runStat.value + actor.bonuses.run;
    const d = waypoint.measurement?.distance;
    if (typeof d !== "number") return base;

    let color;
    if (d <= walkSpeed) color = 0x00ff00;
    else if (d <= runSpeed) color = 0xff8000;
    else color = 0xff0000;

    return { ...base, color };
  }
}

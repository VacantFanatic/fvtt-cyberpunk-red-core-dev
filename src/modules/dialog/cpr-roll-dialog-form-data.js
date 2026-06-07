/**
 * Normalizes roll-dialog form fields before merging onto a CPRRoll instance.
 *
 * @param {object} formObject - Raw form data from FormDataExtended.
 * @returns {{ data: object, invalidAdditionalMods: boolean }}
 */
export default function normalizeRollDialogFormData(formObject) {
  const data = foundry.utils.duplicate(formObject);
  let invalidAdditionalMods = false;

  if (data.luck !== undefined && data.luck !== null && data.luck !== "") {
    const luck = Number.parseInt(data.luck, 10);
    data.luck = Number.isNaN(luck) ? 0 : luck;
  } else {
    data.luck = 0;
  }

  if (data.additionalMods) {
    let mods = String(data.additionalMods);
    mods = mods.replace(/ +/g, ",");
    mods = mods.replace(/,+/g, ",");
    const parts = mods.split(",").filter((part) => part !== "");

    if (parts.some((part) => Number.isNaN(Number(part)))) {
      invalidAdditionalMods = true;
    }

    data.additionalMods = parts
      .filter((part) => !Number.isNaN(Number(part)))
      .map(Number);
  } else {
    data.additionalMods = [];
  }

  return { data, invalidAdditionalMods };
}

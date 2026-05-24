/**
 * Firebase Firestore REST client for cyberpunkred.com character export codes.
 * Adapted from cyberpunkred-importer (MIT, Aaron Olkin).
 */

const LOOKUP_BASEURL =
  "https://firestore.googleapis.com/v1/projects/cyberpunk-red-companion-dae35/databases/(default)/documents/code_to_character/";
const DATA_BASEURL =
  "https://firestore.googleapis.com/v1/projects/cyberpunk-red-companion-dae35/databases/(default)/documents/character_export/";

function debounceAsync(func, timeout) {
  let timer;
  return async (...args) =>
    new Promise((resolve, reject) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          resolve(func.apply(this, args));
        } catch (e) {
          reject(e);
        }
      }, timeout);
    });
}

function parseFirebase(data) {
  const isArray = Array.isArray(data);
  const keys = isArray ? data.map((o, i) => i) : Object.keys(data);
  return keys.reduce(
    (acc, key) => {
      const value = data[key];
      if ("stringValue" in value) {
        acc[key] = value.stringValue;
      } else if ("booleanValue" in value) {
        acc[key] = value.booleanValue;
      } else if ("integerValue" in value) {
        acc[key] = Number.parseInt(value.integerValue, 10);
      } else if ("floatValue" in value) {
        acc[key] = Number.parseFloat(value.floatValue);
      } else if ("arrayValue" in value) {
        acc[key] = value.arrayValue.values
          ? parseFirebase(value.arrayValue.values)
          : [];
      } else if ("mapValue" in value) {
        acc[key] = value.mapValue.fields
          ? parseFirebase(value.mapValue.fields)
          : {};
      }
      return acc;
    },
    isArray ? [] : {}
  );
}

async function _loadCharacter(code) {
  const lookupUrl = LOOKUP_BASEURL + code;
  const lookupResult = await fetch(lookupUrl);
  const lookupData = await lookupResult.json();
  if (lookupData.error) {
    throw new Error(lookupData.error.message);
  }
  const characterId = lookupData.fields.character_uuid.stringValue;
  const dataUrl = DATA_BASEURL + characterId;
  const characterResponse = await fetch(dataUrl);
  const characterData = await characterResponse.json();
  if (characterData.error) {
    throw new Error(characterData.error.message);
  }
  return parseFirebase(characterData.fields);
}

const loadCharacter = debounceAsync(_loadCharacter, 500);

export default loadCharacter;

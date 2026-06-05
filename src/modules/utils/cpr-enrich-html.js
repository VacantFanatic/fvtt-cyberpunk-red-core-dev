const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Enrich HTML for display in sheets (prose-mirror inactive state, lifepath fields, etc.).
 *
 * @param {string} html
 * @param {foundry.abstract.Document} document
 * @returns {Promise<string>}
 */
export default async function enrichDocumentHTML(html, document) {
  return TextEditor.enrichHTML(html ?? "", {
    async: true,
    secrets: document.isOwner,
    relativeTo: document,
    rollData: document.getRollData?.() ?? {},
  });
}

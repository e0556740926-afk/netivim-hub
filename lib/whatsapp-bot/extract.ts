/** Text + tapped button (if any) from any of Green API's message shapes. */
export function extractInput(md: any): { text: string; buttonId: string | null; stanzaId: string | null; kind: "text" | "button" } | null {
  if (!md) return null;
  const t = md.typeMessage;
  const plain = md.textMessageData?.textMessage || md.extendedTextMessageData?.text;
  if (plain && t !== "buttonsResponseMessage" && t !== "templateButtonsReplyMessage") {
    return { text: String(plain), buttonId: null, stanzaId: md.quotedMessage?.stanzaId || md.extendedTextMessageData?.stanzaId || null, kind: "text" };
  }
  // Button replies come in a few shapes depending on the button API and client.
  const r = md.buttonsResponseMessage || md.templateButtonReplyMessage || md.templateButtonsReplyMessage
    || md.interactiveButtonsResponse || md.interactiveButtonReply || md.interactiveButtonsReply || md.listResponseMessage;
  if (r) {
    const id = r.selectedButtonId ?? r.selectedId ?? r.buttonId ?? r.selectedRowId ?? r.id ?? null;
    const label = r.selectedButtonText ?? r.selectedDisplayText ?? r.buttonText ?? r.title ?? r.text ?? "";
    return { text: String(label || ""), buttonId: id != null && id !== "" ? String(id) : null, stanzaId: r.stanzaId || md.quotedMessage?.stanzaId || null, kind: "button" };
  }
  return null;
}

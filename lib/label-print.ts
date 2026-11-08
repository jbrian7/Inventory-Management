export const toteQrOptions = {
  type: "svg" as const,
  margin: 4,
  errorCorrectionLevel: "M" as const,
};

export const labelInches = 2;
const labelPageMarginInches = 0;
const sheetMarginInches = 0.5;
const letterInches = { width: 8.5, height: 11 };

// The 2 inch page has no extra margin. A margin plus a 2 inch box is larger than the page, and browsers then scale or clip it.
export function labelPageCss(mode: "label" | "sheet") {
  const page =
    mode === "sheet"
      ? `@page { size: letter; margin: ${sheetMarginInches}in; }`
      : `@page { size: ${labelInches}in ${labelInches}in; margin: ${labelPageMarginInches}in; }`;
  return `${page}
@media print {
  html, body { background: #fff !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .tote-label { border: 0; border-radius: 0; }
}
.tote-label {
  box-sizing: border-box;
  width: ${labelInches}in;
  height: ${labelInches}in;
  margin: 0;
  padding: 0.06in;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.03in;
  overflow: hidden;
  background: #fff;
  color: #000;
  text-align: center;
}
.tote-label .business { font-size: 7pt; line-height: 1.1; }
.tote-label h2 {
  margin: 0;
  max-height: 0.48in;
  font-size: 16pt;
  line-height: 1.05;
  font-weight: 700;
  max-width: 1.88in;
  overflow: hidden;
}
.tote-label .shelf { font-size: 8pt; line-height: 1.1; max-width: 1.88in; }
.tote-label .qr { width: 1.15in; height: 1.15in; flex: 0 0 auto; }
.tote-label .qr svg { display: block; width: 100%; height: 100%; }
`;
}

export function labelFitsPage(mode: "label" | "sheet") {
  if (mode === "label") {
    const content = labelInches - labelPageMarginInches * 2;
    return labelInches <= content;
  }
  const printableWidth = letterInches.width - sheetMarginInches * 2;
  const printableHeight = letterInches.height - sheetMarginInches * 2;
  return labelInches <= printableWidth && labelInches <= printableHeight;
}
